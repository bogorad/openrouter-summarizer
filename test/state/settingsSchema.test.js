import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_CHAT_QUICK_PROMPTS,
  DEFAULT_MAX_REQUEST_PRICE,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_SELECTED_CHAT_MODEL_ID,
  DEFAULT_SELECTED_SUMMARY_MODEL_ID,
  DEFAULT_XML_PROMPT_TEMPLATE,
  STORAGE_KEY_BULLET_COUNT,
  STORAGE_KEY_CHAT_MODEL_ID,
  STORAGE_KEY_CHAT_QUICK_PROMPTS,
  STORAGE_KEY_DEBUG,
  STORAGE_KEY_LANGUAGE_INFO,
  STORAGE_KEY_MAX_REQUEST_PRICE,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_PROMPT_TEMPLATE,
  STORAGE_KEY_SUMMARY_MODEL_ID,
} from "../../constants.js";
import {
  DEFAULT_BULLET_COUNT,
  DEFAULT_MAX_PRICE_BEHAVIOR,
  SETTINGS_LIMITS,
  STORAGE_KEY_MAX_PRICE_BEHAVIOR,
  UI_SAFE_SETTINGS_DEFAULTS,
  createDefaultLanguageInfo,
  normalizeChatQuickPrompts,
  normalizeLanguageInfo,
  normalizeMaxPriceBehavior,
  normalizeMaxRequestPrice,
  normalizeModelSelection,
  normalizeSettingsForUi,
} from "../../js/state/settingsSchema.js";

describe("settingsSchema", () => {
  it("returns UI-safe defaults without exposing secrets", () => {
    assert.deepEqual(UI_SAFE_SETTINGS_DEFAULTS.models, DEFAULT_MODEL_OPTIONS);
    assert.equal(
      UI_SAFE_SETTINGS_DEFAULTS.summaryModelId,
      DEFAULT_SELECTED_SUMMARY_MODEL_ID,
    );
    assert.equal(
      UI_SAFE_SETTINGS_DEFAULTS.chatModelId,
      DEFAULT_SELECTED_CHAT_MODEL_ID,
    );
    assert.equal(UI_SAFE_SETTINGS_DEFAULTS.bulletCount, DEFAULT_BULLET_COUNT);
    assert.equal(
      UI_SAFE_SETTINGS_DEFAULTS.maxRequestPrice,
      DEFAULT_MAX_REQUEST_PRICE,
    );
    assert.equal(
      UI_SAFE_SETTINGS_DEFAULTS.maxPriceBehavior,
      DEFAULT_MAX_PRICE_BEHAVIOR,
    );
    assert.deepEqual(
      UI_SAFE_SETTINGS_DEFAULTS.chatQuickPrompts,
      DEFAULT_CHAT_QUICK_PROMPTS,
    );
    assert.equal(
      UI_SAFE_SETTINGS_DEFAULTS.promptTemplate,
      DEFAULT_XML_PROMPT_TEMPLATE,
    );
    assert.equal(UI_SAFE_SETTINGS_DEFAULTS.hasApiKey, false);
    assert.equal(UI_SAFE_SETTINGS_DEFAULTS.hasNewsblurToken, false);
    assert.equal(UI_SAFE_SETTINGS_DEFAULTS.hasJoplinToken, false);
    assert.equal("apiKey" in UI_SAFE_SETTINGS_DEFAULTS, false);
    assert.equal("newsblurToken" in UI_SAFE_SETTINGS_DEFAULTS, false);
    assert.equal("joplinToken" in UI_SAFE_SETTINGS_DEFAULTS, false);
  });

  it("falls back invalid selected models to the first available model", () => {
    const models = [{ id: "valid/summary" }, { id: "valid/chat" }];
    const result = normalizeModelSelection({
      models,
      summaryModelId: "missing/summary",
      chatModelId: "missing/chat",
    });

    assert.deepEqual(result.models, models);
    assert.equal(result.summaryModelId, "valid/summary");
    assert.equal(result.chatModelId, "valid/summary");
  });

  it("normalizes invalid languages and can build default language entries", () => {
    const languageInfo = normalizeLanguageInfo([
      { language_name: " Spanish ", svg_path: " flags/es.svg " },
      { language_name: " ", svg_path: "flags/empty.svg" },
      { svg_path: "flags/missing-name.svg" },
    ]);

    assert.deepEqual(languageInfo, [
      { language_name: "Spanish", svg_path: "flags/es.svg" },
    ]);

    const defaultLanguages = createDefaultLanguageInfo(
      [{ name: "Spanish", code: "SPA" }],
      (path) => `chrome://${path}`,
    );

    assert.equal(defaultLanguages.length, 4);
    assert.deepEqual(defaultLanguages[1], {
      language_name: "Spanish",
      svg_path: "chrome://country-flags/svg/spa.svg",
    });
  });

  it("falls back invalid max price values and preserves valid behavior", () => {
    assert.equal(normalizeMaxRequestPrice("not-a-number"), DEFAULT_MAX_REQUEST_PRICE);
    assert.equal(normalizeMaxRequestPrice("-1"), DEFAULT_MAX_REQUEST_PRICE);
    assert.equal(normalizeMaxRequestPrice("0"), DEFAULT_MAX_REQUEST_PRICE);
    assert.equal(normalizeMaxRequestPrice("0.25"), 0.25);
    assert.equal(normalizeMaxPriceBehavior("halt"), DEFAULT_MAX_PRICE_BEHAVIOR);
    assert.equal(normalizeMaxPriceBehavior("fail"), "fail");
  });

  it("normalizes quick prompts and falls back when all entries are invalid", () => {
    const quickPrompts = normalizeChatQuickPrompts([
      { title: " Explain ", prompt: " Summarize simply. " },
      { title: "", prompt: "No title" },
      { title: "No prompt", prompt: "" },
    ]);

    assert.deepEqual(quickPrompts, [
      { title: "Explain", prompt: "Summarize simply." },
    ]);

    assert.deepEqual(
      normalizeChatQuickPrompts([{ title: "", prompt: "" }]),
      DEFAULT_CHAT_QUICK_PROMPTS,
    );

    const manyPrompts = Array.from({ length: SETTINGS_LIMITS.maxChatQuickPrompts + 1 }, (_, index) => ({
      title: `Prompt ${index}`,
      prompt: `Body ${index}`,
    }));

    assert.equal(
      normalizeChatQuickPrompts(manyPrompts).length,
      SETTINGS_LIMITS.maxChatQuickPrompts,
    );
  });

  it("normalizes a storage-keyed settings object for UI consumers", () => {
    const settings = normalizeSettingsForUi({
      [STORAGE_KEY_MODELS]: [{ id: "model/a" }],
      [STORAGE_KEY_SUMMARY_MODEL_ID]: "model/missing",
      [STORAGE_KEY_CHAT_MODEL_ID]: "model/a",
      [STORAGE_KEY_DEBUG]: "true",
      [STORAGE_KEY_BULLET_COUNT]: 99,
      [STORAGE_KEY_LANGUAGE_INFO]: [{ language_name: "French", svg_path: "" }],
      [STORAGE_KEY_MAX_REQUEST_PRICE]: "0.5",
      [STORAGE_KEY_MAX_PRICE_BEHAVIOR]: "fail",
      [STORAGE_KEY_CHAT_QUICK_PROMPTS]: [
        { title: "Next", prompt: "What follows?" },
      ],
      [STORAGE_KEY_PROMPT_TEMPLATE]: "Custom prompt",
    });

    assert.equal(settings.summaryModelId, "model/a");
    assert.equal(settings.chatModelId, "model/a");
    assert.equal(settings.debug, false);
    assert.equal(settings.bulletCount, DEFAULT_BULLET_COUNT);
    assert.deepEqual(settings.language_info, [
      { language_name: "French", svg_path: "" },
    ]);
    assert.equal(settings.maxRequestPrice, 0.5);
    assert.equal(settings.maxPriceBehavior, "fail");
    assert.deepEqual(settings.chatQuickPrompts, [
      { title: "Next", prompt: "What follows?" },
    ]);
    assert.equal(settings.promptTemplate, "Custom prompt");
  });
});
