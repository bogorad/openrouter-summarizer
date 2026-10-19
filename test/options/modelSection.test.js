import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeModelDefaults,
} from "../../js/options/modelSection.js";
import { createOptionsState } from "../../js/options/optionsState.js";

describe("modelSection", () => {
  it("preserves configured free defaults independently of catalog availability", () => {
    const state = createOptionsState({
      models: [{ id: "fixture/paid" }, { id: "fixture/free:free" }],
      summaryModelId: "fixture/free:free",
      chatModelId: "fixture/free:free",
    });
    assert.equal(normalizeModelDefaults(state), false);
    assert.equal(state.summaryModelId, "fixture/free:free");
    assert.equal(state.chatModelId, "fixture/free:free");
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
