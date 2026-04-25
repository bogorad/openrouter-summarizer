import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import domino from "@mixmark-io/domino";

import {
  createChatControls,
  getLastAssistantTextForTranslation,
} from "../../js/chat/chatControls.js";
import { createChatStateStore } from "../../js/chat/chatState.js";

const installDom = () => {
  const document = domino.createDocument(
    "<!doctype html><html><body><div id=\"flags\"></div><div id=\"prompts\"></div></body></html>",
    "https://reader.example/chat-controls",
  );
  globalThis.window = document.defaultView;
  globalThis.document = document;
  globalThis.Node = domino.impl.Node;
  return document;
};

describe("chatControls", () => {
  let document;

  beforeEach(() => {
    document = installDom();
  });

  afterEach(() => {
    globalThis.window?.close?.();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
  });

  it("extracts the latest assistant text for translation", () => {
    assert.deepEqual(
      getLastAssistantTextForTranslation([
        { role: "assistant", content: "Earlier" },
        { role: "user", content: "Next" },
        { role: "assistant", content: ["One", "Two"] },
      ]),
      { ok: true, text: "One\nTwo" },
    );

    assert.deepEqual(getLastAssistantTextForTranslation([]), {
      ok: false,
      error: "No previous assistant message to translate.",
    });
  });

  it("renders quick prompts and sends their prompt text", () => {
    const sentMessages = [];
    const store = createChatStateStore({
      chatQuickPrompts: [{ title: "Explain", prompt: "Explain this" }],
    });
    const controls = createChatControls({
      languageFlagsContainer: document.getElementById("flags"),
      quickPromptsContainer: document.getElementById("prompts"),
      chatState: store,
      buildTranslationRequest: () => "",
      queueAndSendUserMessage: (message) => sentMessages.push(message),
      showError: () => {},
    });

    controls.renderQuickPromptButtons();
    const button = document.querySelector(".quick-prompt-button");
    assert.equal(button.textContent, "Explain");

    button.click();
    assert.deepEqual(sentMessages, ["Explain this"]);
  });

  it("renders language flags and disables controls while streaming", () => {
    const sentMessages = [];
    const errors = [];
    const store = createChatStateStore({
      language_info: [{ language_name: "Spanish", svg_path: "/es.svg" }],
      messages: [{ role: "assistant", content: "Summary" }],
      chatQuickPrompts: [{ title: "Short", prompt: "Summarize" }],
    });
    const controls = createChatControls({
      languageFlagsContainer: document.getElementById("flags"),
      quickPromptsContainer: document.getElementById("prompts"),
      chatState: store,
      buildTranslationRequest: (language, text) => `${language}: ${text}`,
      queueAndSendUserMessage: (message) => sentMessages.push(message),
      showError: (message) => errors.push(message),
    });

    controls.renderLanguageFlags();
    controls.renderQuickPromptButtons();

    document.querySelector(".language-flag-button").click();
    assert.deepEqual(sentMessages, ["Spanish: Summary"]);

    store.setStreaming(true);
    controls.setBusy(true);
    assert.equal(document.querySelector(".quick-prompt-button").disabled, true);
    document.querySelector(".language-flag-button").click();
    assert.deepEqual(errors, [
      "Chat is busy. Please wait for the current response to finish.",
    ]);
  });
});
