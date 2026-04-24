import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_GET_SETTINGS,
  ACTION_PROCESS_SELECTION,
  ACTION_REQUEST_SUMMARY,
  RuntimeMessageActions,
  TabMessageActions,
} from "../../js/messaging/actions.js";
import {
  ChromeMessageError,
  sendRuntimeAction,
  sendRuntimeMessage,
  sendTabAction,
} from "../../js/messaging/runtimeClient.js";
import {
  installChromeMock,
  resetChromeMock,
} from "../helpers/chromeMock.js";

test.beforeEach(() => {
  installChromeMock();
});

test.afterEach(() => {
  delete globalThis.chrome;
});

test("dispatches known runtime actions and returns normalized success results", async () => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    assert.equal(message.action, ACTION_GET_SETTINGS);
    sendResponse({ status: "success", settings: { language: "en" } });
  });

  const result = await sendRuntimeAction(RuntimeMessageActions.getSettings);

  assert.deepEqual(chrome.__mock.calls.runtimeSendMessage, [
    { action: ACTION_GET_SETTINGS },
  ]);
  assert.deepEqual(result, {
    ok: true,
    direction: "runtime",
    action: ACTION_GET_SETTINGS,
    tabId: undefined,
    response: { status: "success", settings: { language: "en" } },
  });
});

test("preserves error and aborted response shapes from runtime handlers", async () => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === ACTION_REQUEST_SUMMARY && message.abort) {
      sendResponse({ status: "aborted", message: "Summary request aborted." });
      return;
    }

    sendResponse({ status: "error", message: "Summary failed." });
  });

  const errorResult = await sendRuntimeAction(RuntimeMessageActions.requestSummary);
  const abortedResult = await sendRuntimeAction(RuntimeMessageActions.requestSummary, {
    abort: true,
  });

  assert.deepEqual(errorResult.response, {
    status: "error",
    message: "Summary failed.",
  });
  assert.deepEqual(abortedResult.response, {
    status: "aborted",
    message: "Summary request aborted.",
  });
});

test("rejects unknown runtime actions before dispatch", async () => {
  assert.throws(
    () => sendRuntimeMessage({ action: "missingAction" }),
    (error) => {
      assert.ok(error instanceof ChromeMessageError);
      assert.equal(error.code, "INVALID_ACTION");
      assert.equal(error.direction, "runtime");
      assert.equal(error.action, "missingAction");
      assert.equal(error.message, "Unsupported runtime message action: missingAction");
      return true;
    },
  );

  assert.deepEqual(chrome.__mock.calls.runtimeSendMessage, []);
});

test("normalizes chrome.runtime.lastError into ChromeMessageError", async () => {
  chrome.__mock.setLastError({ message: "Receiving end does not exist." });

  await assert.rejects(
    () => sendRuntimeAction(RuntimeMessageActions.getSettings),
    (error) => {
      assert.ok(error instanceof ChromeMessageError);
      assert.equal(error.code, "SEND_FAILED");
      assert.equal(error.direction, "runtime");
      assert.equal(error.action, ACTION_GET_SETTINGS);
      assert.equal(error.message, "Receiving end does not exist.");
      assert.deepEqual(error.lastError, { message: "Receiving end does not exist." });
      return true;
    },
  );

  resetChromeMock();
});

test("dispatches tab actions through chrome.tabs.sendMessage", async () => {
  const result = await sendTabAction(42, TabMessageActions.processSelection, {
    source: "shortcut",
  });

  assert.deepEqual(chrome.__mock.calls.tabsSendMessage, [
    {
      tabId: 42,
      message: { action: ACTION_PROCESS_SELECTION, source: "shortcut" },
    },
  ]);
  assert.deepEqual(result, {
    ok: true,
    direction: "tab",
    action: ACTION_PROCESS_SELECTION,
    tabId: 42,
    response: undefined,
  });
});
