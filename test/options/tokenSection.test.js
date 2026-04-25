import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createOptionsState } from "../../js/options/optionsState.js";
import { createOptionsTokenSection } from "../../js/options/tokenSection.js";

const createInput = (id, value = "", placeholder = "") => {
  const attributes = new Map();
  const listeners = new Map();
  return {
    id,
    value,
    placeholder,
    title: "",
    validityMessage: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent(type) {
      listeners.get(type)?.({ target: this });
    },
    setAttribute(name, nextValue) {
      attributes.set(name, nextValue);
    },
    getAttribute(name) {
      return attributes.get(name) || null;
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    setCustomValidity(message) {
      this.validityMessage = message;
    },
  };
};

describe("tokenSection", () => {
  it("keeps existing token UI state and marks a field invalid on decrypt failure", async () => {
    const state = createOptionsState({
      tokens: {
        apiKey: "existing-api-key",
        newsblurToken: "existing-newsblur-token",
        joplinToken: "existing-joplin-token",
      },
    });
    const apiKeyInput = createInput("apiKey", "", "sk-or-v1-...");
    const newsblurTokenInput = createInput(
      "newsblurToken",
      "",
      "NewsBlur token",
    );
    const joplinTokenInput = createInput(
      "joplinToken",
      "",
      "Joplin API Token",
    );
    const originalConsoleError = console.error;
    console.error = () => {};
    let section;

    try {
      section = createOptionsTokenSection({
        apiKeyInput,
        newsblurTokenInput,
        joplinTokenInput,
        state,
        loadOpenRouterApiKeyFn: async () => ({
          success: false,
          data: "",
          error: "Invalid encrypted token payload.",
        }),
        loadNewsblurTokenFn: async () => ({
          success: true,
          data: "",
          error: null,
        }),
        loadJoplinTokenFn: async () => ({
          success: true,
          data: "loaded-joplin-token",
          error: null,
        }),
      });

      await section.loadTokens();
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(state.tokens.apiKey, "existing-api-key");
    assert.equal(apiKeyInput.value, "existing-api-key");
    assert.equal(apiKeyInput.getAttribute("aria-invalid"), "true");
    assert.match(apiKeyInput.placeholder, /could not be decrypted/);
    assert.match(apiKeyInput.validityMessage, /could not be decrypted/);
    assert.equal(apiKeyInput.title, "Invalid encrypted token payload.");

    assert.equal(state.tokens.newsblurToken, "");
    assert.equal(newsblurTokenInput.value, "");
    assert.equal(newsblurTokenInput.getAttribute("aria-invalid"), null);
    assert.equal(newsblurTokenInput.placeholder, "NewsBlur token");

    assert.equal(state.tokens.joplinToken, "loaded-joplin-token");
    assert.equal(joplinTokenInput.value, "loaded-joplin-token");
    assert.equal(joplinTokenInput.getAttribute("aria-invalid"), null);

    section.attach();
    apiKeyInput.value = "replacement-api-key";
    apiKeyInput.dispatchEvent("input");

    assert.equal(apiKeyInput.getAttribute("aria-invalid"), null);
    assert.equal(apiKeyInput.placeholder, "sk-or-v1-...");
    assert.equal(apiKeyInput.validityMessage, "");
  });
});
