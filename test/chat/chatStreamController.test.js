import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import domino from "@mixmark-io/domino";

import { createChatStreamController } from "../../js/chat/chatStreamController.js";
import { renderStreamingPlaceholder } from "../../js/chat/chatRenderer.js";
import { createChatStateStore } from "../../js/chat/chatState.js";

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const waitForPromiseHandlers = () => new Promise((resolve) => setTimeout(resolve, 0));

const installDom = () => {
  const document = domino.createDocument(
    "<!doctype html><html><body><div id=\"messages\"></div></body></html>",
    "https://reader.example/chat-stream-controller",
  );

  globalThis.window = document.defaultView;
  globalThis.document = document;
  globalThis.Node = domino.impl.Node;

  return document.getElementById("messages");
};

const createHarness = () => {
  const wrap = installDom();
  const store = createChatStateStore({
    selectedModelId: "model/a",
    chatContext: { domSnippet: "<article>Test</article>", summary: "Summary" },
    messages: [{ role: "user", content: "Question" }],
  });
  const busyStates = [];
  const errors = [];
  const abortResponses = [];
  const scrolls = [];
  const runtimeCalls = [];
  const llmDeferred = createDeferred();
  const abortDeferred = createDeferred();
  const actions = {
    llmChatStream: "llmChatStream",
    abortChatRequest: "abortChatRequest",
  };

  const controller = createChatStreamController({
    chatState: store,
    buildApiMessages: (userText, messages, chatContext) => [
      { role: "system", content: chatContext.summary },
      ...messages,
      { role: "user", content: userText },
    ],
    renderStreamingPlaceholder,
    sendRuntimeAction: (action, payload) => {
      runtimeCalls.push({ action, payload });
      if (action === actions.abortChatRequest) {
        return abortDeferred.promise;
      }
      return llmDeferred.promise;
    },
    actions,
    getMessagesWrap: () => wrap,
    setBusy: (isBusy) => busyStates.push(isBusy),
    onSuccess: ({ content, model }) => {
      store.addMessage({ role: "assistant", content, model });
    },
    onError: (message) => errors.push(message),
    onAborted: (response) => abortResponses.push(response),
    scrollToBottom: () => scrolls.push(true),
    logger: {
      log() {},
      error() {},
    },
  });

  return {
    abortDeferred,
    abortResponses,
    busyStates,
    controller,
    errors,
    llmDeferred,
    runtimeCalls,
    scrolls,
    store,
    wrap,
  };
};

describe("chatStreamController", () => {
  beforeEach(() => {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
  });

  it("cleans up placeholder and restores state after success", async () => {
    const harness = createHarness();

    assert.equal(harness.controller.start("Follow up?"), true);
    assert.equal(harness.store.getState().streaming, true);
    assert.equal(harness.wrap.children.length, 2);
    assert.equal(typeof harness.runtimeCalls[0].payload.requestId, "string");

    harness.llmDeferred.resolve({
      response: {
        status: "success",
        requestId: harness.runtimeCalls[0].payload.requestId,
        content: "Answer",
      },
    });
    await waitForPromiseHandlers();

    assert.equal(harness.store.getState().streaming, false);
    assert.equal(harness.store.getState().activeStreamContainer, null);
    assert.equal(harness.wrap.children.length, 0);
    assert.deepEqual(harness.busyStates, [true, false]);
    assert.deepEqual(harness.scrolls, [true]);
    assert.deepEqual(harness.store.getState().messages.at(-1), {
      role: "assistant",
      content: "Answer",
      model: "model/a",
    });
  });

  it("cleans up placeholder and reports errors", async () => {
    const harness = createHarness();

    harness.controller.start("Follow up?");
    harness.llmDeferred.resolve({
      response: { status: "error", message: "API failed" },
    });
    await waitForPromiseHandlers();

    assert.equal(harness.store.getState().streaming, false);
    assert.equal(harness.wrap.children.length, 0);
    assert.deepEqual(harness.busyStates, [true, false]);
    assert.deepEqual(harness.errors, ["API failed"]);
    assert.equal(harness.store.getState().messages.length, 1);
  });

  it("cleans up placeholder and restores state after aborted response", async () => {
    const harness = createHarness();

    harness.controller.start("Follow up?");
    harness.llmDeferred.resolve({
      response: { status: "aborted" },
    });
    await waitForPromiseHandlers();

    assert.equal(harness.store.getState().streaming, false);
    assert.equal(harness.wrap.children.length, 0);
    assert.deepEqual(harness.busyStates, [true, false]);
    assert.deepEqual(harness.abortResponses, [{ status: "aborted" }]);
    assert.equal(harness.store.getState().messages.length, 1);
  });

  it("stops an active stream once and ignores late duplicate completions", async () => {
    const harness = createHarness();

    harness.controller.start("Follow up?");

    assert.equal(harness.controller.stop(), true);
    assert.equal(harness.controller.stop(), false);
    assert.equal(harness.store.getState().streaming, false);
    assert.equal(harness.wrap.children.length, 0);
    assert.deepEqual(harness.busyStates, [true, false]);
    assert.equal(
      harness.runtimeCalls.filter((call) => call.action === "abortChatRequest").length,
      1,
    );
    assert.deepEqual(harness.runtimeCalls[1], {
      action: "abortChatRequest",
      payload: { requestId: harness.runtimeCalls[0].payload.requestId },
    });

    harness.abortDeferred.resolve({ response: { status: "aborted" } });
    harness.llmDeferred.resolve({
      response: { status: "success", content: "Late answer" },
    });
    await waitForPromiseHandlers();

    assert.equal(harness.store.getState().messages.length, 1);
    assert.equal(harness.wrap.children.length, 0);
    assert.equal(harness.store.getState().activeStreamContainer, null);
  });
});
