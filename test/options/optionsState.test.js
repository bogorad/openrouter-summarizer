import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOptionsState,
  parseOptionsPromptTemplate,
} from "../../js/options/optionsState.js";

describe("optionsState", () => {
  it("keeps a defensive snapshot of form state", () => {
    const state = createOptionsState({
      models: [{ id: "model/a" }],
      summaryModelId: "model/a",
      chatModelId: "model/a",
      languages: [{ language_name: "English", svg_path: "flags/us.svg" }],
      quickPrompts: [{ title: "Explain", prompt: "Explain this" }],
      maxRequestPrice: 0.25,
      debug: true,
    });

    const snapshot = state.snapshot();
    snapshot.models[0].id = "changed/model";
    snapshot.languages[0].language_name = "Changed";
    snapshot.quickPrompts[0].title = "Changed";

    assert.equal(state.models[0].id, "model/a");
    assert.equal(state.languages[0].language_name, "English");
    assert.equal(state.quickPrompts[0].title, "Explain");
    assert.equal(state.maxRequestPrice, 0.25);
    assert.equal(state.debug, true);
  });

  it("tracks prompt template parts and replaces only editable content", () => {
    const state = createOptionsState({
      promptTemplate:
        "<prompt>\n<user_formatting>\nold instructions\n</user_formatting>\n</prompt>",
    });

    assert.deepEqual(state.promptParts, {
      prefix: "<prompt>\n<user_formatting>",
      editableContent: "\nold instructions\n",
      suffix: "</user_formatting>\n</prompt>",
    });

    state.setPromptEditableContent("new instructions");

    assert.equal(
      state.promptTemplate,
      "<prompt>\n<user_formatting>\nnew instructions\n</user_formatting>\n</prompt>",
    );
    assert.equal(state.promptParts.editableContent, "\nnew instructions\n");
  });

  it("tracks token input state, capabilities, and saving flags", () => {
    const state = createOptionsState();

    state.setTokens({
      apiKey: "sk-test",
      newsblurToken: "",
      joplinToken: "joplin-test",
    });
    state.setSaving(true);

    assert.deepEqual(state.tokens, {
      apiKey: "sk-test",
      newsblurToken: "",
      joplinToken: "joplin-test",
    });
    assert.deepEqual(state.tokenCapabilities, {
      hasApiKey: true,
      hasNewsblurToken: false,
      hasJoplinToken: true,
    });
    assert.equal(state.dirty, true);
    assert.equal(state.saving, true);

    state.markClean();
    state.setSaving(false);

    assert.equal(state.dirty, false);
    assert.equal(state.saving, false);
  });

  it("parses prompt templates without XML wrapper as editable text", () => {
    assert.deepEqual(parseOptionsPromptTemplate("plain text"), {
      prefix: "",
      editableContent: "plain text",
      suffix: "",
    });
  });
});
