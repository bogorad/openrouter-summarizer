import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createChatStateStore } from "../../js/chat/chatState.js";

describe("chatState", () => {
  it("starts with explicit chat defaults", () => {
    const store = createChatStateStore();
    const state = store.getState();

    assert.deepEqual(state.messages, []);
    assert.deepEqual(state.chatContext, { domSnippet: null, summary: null });
    assert.deepEqual(state.models, []);
    assert.deepEqual(state.language_info, []);
    assert.equal(state.selectedModelId, "");
    assert.equal(state.streaming, false);
    assert.equal(state.activeStreamContainer, null);
    assert.equal(state.modelUsedForSummary, "");
  });

  it("stores chat data through explicit transitions", () => {
    const store = createChatStateStore();

    store.setModels([{ id: "model/a" }]);
    store.setLanguageInfo([{ language_name: "Spanish", svg_path: "flags/es.svg" }]);
    store.setSelectedModelId("model/a");
    store.setChatContext({ domSnippet: "<article>Test</article>", summary: "Summary" });
    store.setModelUsedForSummary("summary/model");
    store.addMessage({ role: "assistant", content: "Summary", model: "summary/model" });
    store.addMessage({ role: "user", content: "Question" });

    const state = store.getState();
    assert.deepEqual(state.models, [{ id: "model/a" }]);
    assert.deepEqual(state.language_info, [
      { language_name: "Spanish", svg_path: "flags/es.svg" },
    ]);
    assert.equal(state.selectedModelId, "model/a");
    assert.deepEqual(state.chatContext, {
      domSnippet: "<article>Test</article>",
      summary: "Summary",
    });
    assert.equal(state.modelUsedForSummary, "summary/model");
    assert.deepEqual(state.messages, [
      { role: "assistant", content: "Summary", model: "summary/model" },
      { role: "user", content: "Question" },
    ]);
  });

  it("tracks and clears streaming placeholders", () => {
    const store = createChatStateStore();
    const wrap = { nodeName: "DIV" };
    const container = { nodeName: "SPAN" };
    const modelLabel = { nodeName: "DIV" };

    const currentModel = store.startStream("model/a");
    store.setActiveStreamPlaceholder({ wrap, container, modelLabel });

    assert.equal(currentModel, "model/a");
    assert.equal(store.getState().streaming, true);
    assert.equal(store.getState().currentStreamModel, "model/a");
    assert.equal(store.getState().activeStreamContainer, container);

    store.clearActiveStreamPlaceholder({ container, modelLabel });
    store.setStreaming(false);

    assert.equal(store.getState().streaming, false);
    assert.equal(store.getState().currentStreamModel, "");
    assert.equal(store.getState().activeStreamWrap, null);
    assert.equal(store.getState().activeStreamContainer, null);
    assert.equal(store.getState().activeStreamModelLabel, null);
  });
});
