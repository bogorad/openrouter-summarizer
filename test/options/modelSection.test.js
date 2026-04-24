import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getBaseModelId,
  normalizeModelDefaults,
} from "../../js/options/modelSection.js";
import { createOptionsState } from "../../js/options/optionsState.js";

describe("modelSection", () => {
  it("strips OpenRouter model variant suffixes", () => {
    assert.equal(getBaseModelId("openai/gpt-4o:online"), "openai/gpt-4o");
    assert.equal(getBaseModelId(" anthropic/claude-3.5-sonnet "), "anthropic/claude-3.5-sonnet");
    assert.equal(getBaseModelId(""), "");
  });

  it("normalizes invalid summary and chat defaults to the first configured model", () => {
    const state = createOptionsState({
      models: [{ id: "" }, { id: "openai/gpt-4o" }],
      summaryModelId: "missing/summary",
      chatModelId: "missing/chat",
    });

    const changed = normalizeModelDefaults(state);

    assert.equal(changed, true);
    assert.equal(state.summaryModelId, "openai/gpt-4o");
    assert.equal(state.chatModelId, "openai/gpt-4o");
  });
});
