import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_ABORT_CHAT_REQUEST,
  ACTION_GET_SETTINGS,
  ACTION_REQUEST_SUMMARY,
} from "../../js/messaging/actions.js";
import {
  createMessageRouter,
  MessageRouter,
  rawMessageResponse,
} from "../../js/messaging/router.js";
import { installChromeMock } from "../helpers/chromeMock.js";

test("registers and dispatches known actions with normalized success responses", async () => {
  const router = createMessageRouter({ context: { source: "background" } });
  const sender = { tab: { id: 7 } };

  router.register(ACTION_GET_SETTINGS, (request, actualSender, context) => {
    assert.equal(request.action, ACTION_GET_SETTINGS);
    assert.equal(actualSender, sender);
    assert.deepEqual(context, { source: "background" });
    return { language: "en" };
  });

  assert.equal(router.hasAction(ACTION_GET_SETTINGS), true);
  assert.equal(router.hasHandler(ACTION_GET_SETTINGS), true);
  assert.deepEqual(await router.dispatch({ action: ACTION_GET_SETTINGS }, sender), {
    status: "success",
    data: { language: "en" },
  });
});

test("passes through success, error, and aborted status response shapes", async () => {
  const router = new MessageRouter();

  router
    .register(ACTION_GET_SETTINGS, () => ({ status: "success", settings: {} }))
    .register(ACTION_REQUEST_SUMMARY, () => ({
      status: "error",
      message: "Summary failed.",
    }))
    .register(ACTION_ABORT_CHAT_REQUEST, () => ({
      status: "aborted",
      message: "Chat request aborted.",
    }));

  assert.deepEqual(await router.dispatch({ action: ACTION_GET_SETTINGS }), {
    status: "success",
    settings: {},
  });
  assert.deepEqual(await router.dispatch({ action: ACTION_REQUEST_SUMMARY }), {
    status: "error",
    message: "Summary failed.",
  });
  assert.deepEqual(await router.dispatch({ action: ACTION_ABORT_CHAT_REQUEST }), {
    status: "aborted",
    message: "Chat request aborted.",
  });
});

test("passes through raw legacy responses without status wrapping", async () => {
  const router = createMessageRouter();
  const settings = { debug: false, models: [{ id: "model-a" }] };

  router.register(ACTION_GET_SETTINGS, () => rawMessageResponse(settings));

  assert.deepEqual(await router.dispatch({ action: ACTION_GET_SETTINGS }), settings);
});

test("normalizes unknown and unhandled actions to error responses", async () => {
  const router = createMessageRouter();

  assert.deepEqual(await router.dispatch({ action: "missingAction" }), {
    status: "error",
    message: "Unknown message action.",
    action: "missingAction",
  });
  assert.deepEqual(await router.dispatch({ action: ACTION_GET_SETTINGS }), {
    status: "error",
    message: "No handler registered for message action.",
    action: ACTION_GET_SETTINGS,
  });
});

test("normalizes thrown handler errors to error responses", async () => {
  const router = createMessageRouter();

  router.register(ACTION_GET_SETTINGS, () => {
    throw new Error("Settings load failed.");
  });

  assert.deepEqual(await router.dispatch({ action: ACTION_GET_SETTINGS }), {
    status: "error",
    message: "Settings load failed.",
    action: ACTION_GET_SETTINGS,
  });
});

test("throws when registering unknown actions or non-function handlers", () => {
  const router = createMessageRouter();

  assert.throws(
    () => router.register("missingAction", () => {}),
    /Unknown message action\. missingAction/,
  );
  assert.throws(
    () => router.register(ACTION_GET_SETTINGS, null),
    /Message handler must be a function\./,
  );
});

test("background runtime listener dispatches async handlers through chrome mock", async () => {
  installChromeMock();
  const router = createMessageRouter();

  router.register(ACTION_GET_SETTINGS, async () => ({
    status: "success",
    settings: { theme: "dark" },
  }));
  chrome.runtime.onMessage.addListener(router.createRuntimeListener());

  const response = await chrome.runtime.sendMessage({ action: ACTION_GET_SETTINGS });

  assert.deepEqual(chrome.__mock.calls.runtimeSendMessage, [
    { action: ACTION_GET_SETTINGS },
  ]);
  assert.deepEqual(response, {
    status: "success",
    settings: { theme: "dark" },
  });

  delete globalThis.chrome;
});
