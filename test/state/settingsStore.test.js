import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  DEFAULT_CHAT_QUICK_PROMPTS,
  DEFAULT_MAX_REQUEST_PRICE,
  DEFAULT_MODEL_OPTIONS,
  STORAGE_KEY_ALWAYS_USE_US_ENGLISH,
  STORAGE_KEY_BULLET_COUNT,
  STORAGE_KEY_CHAT_MODEL_ID,
  STORAGE_KEY_CHAT_QUICK_PROMPTS,
  STORAGE_KEY_DEBUG,
  STORAGE_KEY_LANGUAGE_INFO,
  STORAGE_KEY_MAX_REQUEST_PRICE,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED,
  STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE,
  STORAGE_KEY_PROMPT_TEMPLATE,
  STORAGE_KEY_SUMMARY_MODEL_ID,
} from "../../constants.js";
import { installChromeMock, resetChromeMock } from "../helpers/chromeMock.js";
import {
  STORAGE_KEY_MAX_PRICE_BEHAVIOR,
  UI_SAFE_SETTINGS_DEFAULTS,
} from "../../js/state/settingsSchema.js";
import {
  loadSettings,
  loadSettingsForUi,
  migrateSettings,
  normalizeStoredSettings,
  saveSettings,
} from "../../js/state/settingsStore.js";

describe("settingsStore", () => {
  let chromeMock;

  beforeEach(() => {
    chromeMock = installChromeMock();
    resetChromeMock(chromeMock);
  });

  it("loads complete normalized defaults from empty sync storage", async () => {
    const settings = await loadSettings({ chromeApi: chromeMock });

    assert.deepEqual(settings[STORAGE_KEY_MODELS], DEFAULT_MODEL_OPTIONS);
    assert.equal(
      settings[STORAGE_KEY_SUMMARY_MODEL_ID],
      DEFAULT_MODEL_OPTIONS[0].id,
    );
    assert.equal(
      settings[STORAGE_KEY_CHAT_MODEL_ID],
      DEFAULT_MODEL_OPTIONS[0].id,
    );
    assert.equal(settings[STORAGE_KEY_DEBUG], false);
    assert.equal(settings[STORAGE_KEY_BULLET_COUNT], "5");
    assert.deepEqual(settings[STORAGE_KEY_LANGUAGE_INFO], []);
    assert.equal(
      settings[STORAGE_KEY_MAX_REQUEST_PRICE],
      DEFAULT_MAX_REQUEST_PRICE,
    );
    assert.equal(settings[STORAGE_KEY_MAX_PRICE_BEHAVIOR], "truncate");
    assert.deepEqual(
      settings[STORAGE_KEY_CHAT_QUICK_PROMPTS],
      DEFAULT_CHAT_QUICK_PROMPTS,
    );
    assert.equal(settings[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED], false);
    assert.equal(settings[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE], "");
  });

  it("normalizes legacy models, invalid selections, and language alias values", () => {
    const settings = normalizeStoredSettings({
      [STORAGE_KEY_MODELS]: ["model/a", { id: " model/b " }, { id: "" }],
      [STORAGE_KEY_SUMMARY_MODEL_ID]: "model/missing",
      [STORAGE_KEY_CHAT_MODEL_ID]: "model/b",
      languageInfo: [
        { language_name: " Hebrew ", svg_path: " flags/he.svg " },
        { language_name: "", svg_path: "flags/empty.svg" },
      ],
    });

    assert.deepEqual(settings[STORAGE_KEY_MODELS], [
      { id: "model/a" },
      { id: "model/b" },
    ]);
    assert.equal(settings[STORAGE_KEY_SUMMARY_MODEL_ID], "model/a");
    assert.equal(settings[STORAGE_KEY_CHAT_MODEL_ID], "model/b");
    assert.deepEqual(settings[STORAGE_KEY_LANGUAGE_INFO], [
      { language_name: "Hebrew", svg_path: "flags/he.svg" },
    ]);
  });

  it("migrates invalid stored values by writing only normalized changes", async () => {
    chromeMock.__mock.setStorageArea("sync", {
      [STORAGE_KEY_MODELS]: [{ id: "model/a" }],
      [STORAGE_KEY_SUMMARY_MODEL_ID]: "missing/model",
      [STORAGE_KEY_CHAT_MODEL_ID]: "model/a",
      [STORAGE_KEY_MAX_REQUEST_PRICE]: "-0.2",
      [STORAGE_KEY_MAX_PRICE_BEHAVIOR]: "halt",
      [STORAGE_KEY_CHAT_QUICK_PROMPTS]: [{ title: "", prompt: "" }],
      [STORAGE_KEY_ALWAYS_USE_US_ENGLISH]: false,
      [STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED]: "true",
      [STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE]: 42,
    });

    const result = await migrateSettings({ chromeApi: chromeMock });
    const syncStore = chromeMock.__mock.getStorageArea("sync");

    assert.equal(result.changed, true);
    assert.equal(result.settings[STORAGE_KEY_SUMMARY_MODEL_ID], "model/a");
    assert.equal(
      result.settings[STORAGE_KEY_MAX_REQUEST_PRICE],
      DEFAULT_MAX_REQUEST_PRICE,
    );
    assert.equal(result.settings[STORAGE_KEY_MAX_PRICE_BEHAVIOR], "truncate");
    assert.deepEqual(
      result.settings[STORAGE_KEY_CHAT_QUICK_PROMPTS],
      DEFAULT_CHAT_QUICK_PROMPTS,
    );
    assert.equal(result.settings[STORAGE_KEY_ALWAYS_USE_US_ENGLISH], false);
    assert.equal(
      result.settings[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED],
      false,
    );
    assert.equal(
      result.settings[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE],
      "",
    );
    assert.equal(syncStore[STORAGE_KEY_SUMMARY_MODEL_ID], "model/a");
    assert.equal(syncStore[STORAGE_KEY_MAX_PRICE_BEHAVIOR], "truncate");
    assert.deepEqual(
      syncStore[STORAGE_KEY_CHAT_QUICK_PROMPTS],
      DEFAULT_CHAT_QUICK_PROMPTS,
    );
    assert.equal(syncStore[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED], false);
    assert.equal(syncStore[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE], "");
  });

  it("saves partial settings after merging and normalizing current storage", async () => {
    chromeMock.__mock.setStorageArea("sync", {
      [STORAGE_KEY_MODELS]: [{ id: "model/a" }, { id: "model/b" }],
      [STORAGE_KEY_SUMMARY_MODEL_ID]: "model/a",
      [STORAGE_KEY_CHAT_MODEL_ID]: "model/a",
    });

    const saved = await saveSettings(
      {
        [STORAGE_KEY_CHAT_MODEL_ID]: "model/b",
        [STORAGE_KEY_MAX_REQUEST_PRICE]: "0.42",
        [STORAGE_KEY_PROMPT_TEMPLATE]: " Updated prompt ",
        [STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED]: true,
        [STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE]:
          " LLM (@LLMNAME@) says: ",
      },
      { chromeApi: chromeMock },
    );
    const syncStore = chromeMock.__mock.getStorageArea("sync");

    assert.equal(saved[STORAGE_KEY_SUMMARY_MODEL_ID], "model/a");
    assert.equal(saved[STORAGE_KEY_CHAT_MODEL_ID], "model/b");
    assert.equal(saved[STORAGE_KEY_MAX_REQUEST_PRICE], 0.42);
    assert.equal(saved[STORAGE_KEY_PROMPT_TEMPLATE], " Updated prompt ");
    assert.equal(saved[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED], true);
    assert.equal(
      saved[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE],
      "LLM (@LLMNAME@) says:",
    );
    assert.equal(syncStore[STORAGE_KEY_CHAT_MODEL_ID], "model/b");
    assert.equal(syncStore[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED], true);
    assert.equal(
      syncStore[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE],
      "LLM (@LLMNAME@) says:",
    );
  });

  it("round-trips saved NewsBlur share preface settings through sync storage", async () => {
    await saveSettings(
      {
        [STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED]: true,
        [STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE]:
          "LLM (@LLMNAME@) says:",
      },
      { chromeApi: chromeMock },
    );

    const settings = await loadSettings({ chromeApi: chromeMock });

    assert.equal(settings[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED], true);
    assert.equal(
      settings[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE],
      "LLM (@LLMNAME@) says:",
    );
  });

  it("returns UI-safe settings with capability flags only", async () => {
    const settings = await loadSettingsForUi({
      chromeApi: chromeMock,
      capabilities: {
        hasApiKey: true,
        hasNewsblurToken: false,
        hasJoplinToken: true,
      },
    });

    assert.equal(settings.hasApiKey, true);
    assert.equal(settings.hasNewsblurToken, false);
    assert.equal(settings.hasJoplinToken, true);
    assert.equal("apiKey" in settings, false);
    assert.equal("newsblurToken" in settings, false);
    assert.equal("joplinToken" in settings, false);
    assert.deepEqual(settings.models, UI_SAFE_SETTINGS_DEFAULTS.models);
  });
});
