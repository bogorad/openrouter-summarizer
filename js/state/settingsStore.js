/**
 * @fileoverview Settings storage wrapper for Chrome storage areas.
 *
 * This module centralizes load, save, default fill, and migration behavior for
 * non-secret extension settings. Callers can inject a Chrome-like object in
 * tests; production calls default to globalThis.chrome when it exists.
 */

import {
  STORAGE_KEY_ALSO_SEND_TO_JOPLIN,
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
import {
  LOCAL_STORAGE_KEYS,
  SESSION_STORAGE_KEYS,
  STORAGE_KEYS_BY_AREA,
  SYNC_STORAGE_KEYS,
  STORAGE_KEY_MAX_PRICE_BEHAVIOR,
  UI_SAFE_SETTINGS_DEFAULTS,
  normalizeBulletCount,
  normalizeChatQuickPrompts,
  normalizeDebug,
  normalizeLanguageInfo,
  normalizeMaxPriceBehavior,
  normalizeMaxRequestPrice,
  normalizeModelSelection,
  normalizeNewsblurSharePrefaceEnabled,
  normalizeNewsblurSharePrefaceTemplate,
  normalizeSettingsForUi,
} from "./settingsSchema.js";

export const SETTINGS_STORAGE_AREA_SYNC = "sync";
export const SETTINGS_STORAGE_AREA_LOCAL = "local";
export const SETTINGS_STORAGE_AREA_SESSION = "session";

const DEFAULT_STORAGE_AREA = SETTINGS_STORAGE_AREA_SYNC;
const STORAGE_KEY_ALIASES = Object.freeze({
  languageInfo: STORAGE_KEY_LANGUAGE_INFO,
});
const SYNC_STORAGE_LOAD_KEYS = Object.freeze([
  ...SYNC_STORAGE_KEYS,
  ...Object.keys(STORAGE_KEY_ALIASES),
]);

/**
 * Loads normalized non-secret settings from chrome.storage.sync.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome-like API for tests.
 * @returns {Promise<object>} Normalized settings keyed by storage key.
 */
export const loadSettings = async ({ chromeApi = getChromeApi() } = {}) => {
  const storedSettings = await getFromStorageArea(
    chromeApi,
    DEFAULT_STORAGE_AREA,
    SYNC_STORAGE_LOAD_KEYS,
  );

  return normalizeStoredSettings(storedSettings);
};

/**
 * Loads settings for UI consumers without exposing raw secret values.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome-like API for tests.
 * @param {object} options.capabilities - Optional secret capability flags.
 * @returns {Promise<object>} UI-safe settings view.
 */
export const loadSettingsForUi = async ({
  chromeApi = getChromeApi(),
  capabilities = {},
} = {}) => {
  const storedSettings = await loadSettings({ chromeApi });

  return {
    ...normalizeSettingsForUi(storedSettings),
    hasApiKey: capabilities.hasApiKey === true,
    hasNewsblurToken: capabilities.hasNewsblurToken === true,
    hasJoplinToken: capabilities.hasJoplinToken === true,
  };
};

/**
 * Saves a partial settings object after merging with current stored settings.
 * @param {object} partialSettings - Storage-keyed settings to save.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome-like API for tests.
 * @returns {Promise<object>} Normalized settings that were written.
 */
export const saveSettings = async (
  partialSettings = {},
  { chromeApi = getChromeApi() } = {},
) => {
  const storedSettings = await getFromStorageArea(
    chromeApi,
    DEFAULT_STORAGE_AREA,
    SYNC_STORAGE_LOAD_KEYS,
  );
  const normalizedSettings = normalizeStoredSettings({
    ...storedSettings,
    ...mapAliases(partialSettings),
  });

  await setInStorageArea(chromeApi, DEFAULT_STORAGE_AREA, normalizedSettings);
  return normalizedSettings;
};

/**
 * Fills missing sync defaults and normalizes invalid persisted values.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome-like API for tests.
 * @returns {Promise<object>} Migration result and normalized settings.
 */
export const migrateSettings = async ({ chromeApi = getChromeApi() } = {}) => {
  const storedSettings = await getFromStorageArea(
    chromeApi,
    DEFAULT_STORAGE_AREA,
    SYNC_STORAGE_LOAD_KEYS,
  );
  const normalizedSettings = normalizeStoredSettings(storedSettings);
  const settingsToWrite = pickChangedSettings(storedSettings, normalizedSettings);

  if (Object.keys(settingsToWrite).length > 0) {
    await setInStorageArea(chromeApi, DEFAULT_STORAGE_AREA, settingsToWrite);
  }

  return {
    changed: Object.keys(settingsToWrite).length > 0,
    migratedKeys: Object.keys(settingsToWrite),
    settings: normalizedSettings,
  };
};

/**
 * Reads arbitrary known keys from one Chrome storage area.
 * @param {string} areaName - sync, local, or session.
 * @param {string|string[]=} keys - Keys to load. Defaults to all known keys.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome-like API for tests.
 * @returns {Promise<object>} Stored values, or empty object when unavailable.
 */
export const loadStorageArea = async (
  areaName,
  keys = STORAGE_KEYS_BY_AREA[areaName],
  { chromeApi = getChromeApi() } = {},
) => {
  return getFromStorageArea(chromeApi, areaName, keys);
};

/**
 * Writes values to one Chrome storage area.
 * @param {string} areaName - sync, local, or session.
 * @param {object} values - Values to write.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome-like API for tests.
 * @returns {Promise<object>} Values written.
 */
export const saveStorageArea = async (
  areaName,
  values = {},
  { chromeApi = getChromeApi() } = {},
) => {
  await setInStorageArea(chromeApi, areaName, values);
  return values;
};

/**
 * Normalizes a storage-keyed settings object using the centralized schema.
 * @param {object} storedSettings - Raw stored settings.
 * @returns {object} Complete storage-keyed normalized settings.
 */
export const normalizeStoredSettings = (storedSettings = {}) => {
  const settings = coerceLegacySettings(mapAliases(storedSettings));
  const modelSelection = normalizeModelSelection({
    models: settings[STORAGE_KEY_MODELS],
    summaryModelId: settings[STORAGE_KEY_SUMMARY_MODEL_ID],
    chatModelId: settings[STORAGE_KEY_CHAT_MODEL_ID],
  });

  return {
    [STORAGE_KEY_MODELS]: modelSelection.models,
    [STORAGE_KEY_SUMMARY_MODEL_ID]: modelSelection.summaryModelId,
    [STORAGE_KEY_CHAT_MODEL_ID]: modelSelection.chatModelId,
    [STORAGE_KEY_DEBUG]: normalizeDebug(settings[STORAGE_KEY_DEBUG]),
    [STORAGE_KEY_BULLET_COUNT]: normalizeBulletCount(
      settings[STORAGE_KEY_BULLET_COUNT],
    ),
    [STORAGE_KEY_LANGUAGE_INFO]: normalizeLanguageInfo(
      settings[STORAGE_KEY_LANGUAGE_INFO],
    ),
    [STORAGE_KEY_MAX_REQUEST_PRICE]: normalizeMaxRequestPrice(
      settings[STORAGE_KEY_MAX_REQUEST_PRICE],
    ),
    [STORAGE_KEY_MAX_PRICE_BEHAVIOR]: normalizeMaxPriceBehavior(
      settings[STORAGE_KEY_MAX_PRICE_BEHAVIOR],
    ),
    [STORAGE_KEY_CHAT_QUICK_PROMPTS]: normalizeChatQuickPrompts(
      settings[STORAGE_KEY_CHAT_QUICK_PROMPTS],
    ),
    [STORAGE_KEY_PROMPT_TEMPLATE]: normalizePromptTemplate(
      settings[STORAGE_KEY_PROMPT_TEMPLATE],
    ),
    [STORAGE_KEY_ALWAYS_USE_US_ENGLISH]:
      settings[STORAGE_KEY_ALWAYS_USE_US_ENGLISH] ??
      UI_SAFE_SETTINGS_DEFAULTS.alwaysUseUsEnglish,
    [STORAGE_KEY_ALSO_SEND_TO_JOPLIN]:
      settings[STORAGE_KEY_ALSO_SEND_TO_JOPLIN] ??
      UI_SAFE_SETTINGS_DEFAULTS.alsoSendToJoplin,
    [STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED]:
      normalizeNewsblurSharePrefaceEnabled(
        settings[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED],
      ),
    [STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE]:
      normalizeNewsblurSharePrefaceTemplate(
        settings[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE],
      ),
  };
};

const normalizePromptTemplate = (promptTemplate) => {
  if (typeof promptTemplate !== "string" || promptTemplate.trim() === "") {
    return UI_SAFE_SETTINGS_DEFAULTS.promptTemplate;
  }

  return promptTemplate;
};

const getFromStorageArea = async (chromeApi, areaName, keys) => {
  const storageArea = getStorageArea(chromeApi, areaName);
  if (!storageArea?.get) {
    return {};
  }

  const result = await storageArea.get(keys);
  throwIfLastError(chromeApi);
  return result || {};
};

const setInStorageArea = async (chromeApi, areaName, values) => {
  const storageArea = getStorageArea(chromeApi, areaName);
  if (!storageArea?.set) {
    return;
  }

  await storageArea.set(values);
  throwIfLastError(chromeApi);
};

const getStorageArea = (chromeApi, areaName) => {
  if (!isKnownStorageArea(areaName)) {
    throw new Error(`Unknown storage area: ${areaName}`);
  }

  return chromeApi?.storage?.[areaName] || null;
};

const isKnownStorageArea = (areaName) => {
  return [
    SETTINGS_STORAGE_AREA_SYNC,
    SETTINGS_STORAGE_AREA_LOCAL,
    SETTINGS_STORAGE_AREA_SESSION,
  ].includes(areaName);
};

const getChromeApi = () => {
  return typeof globalThis.chrome === "object" ? globalThis.chrome : null;
};

const throwIfLastError = (chromeApi) => {
  const lastError = chromeApi?.runtime?.lastError;
  if (lastError) {
    throw new Error(lastError.message || String(lastError));
  }
};

const mapAliases = (settings = {}) => {
  return Object.entries(settings).reduce((mappedSettings, [key, value]) => {
    mappedSettings[STORAGE_KEY_ALIASES[key] || key] = value;
    return mappedSettings;
  }, {});
};

const coerceLegacySettings = (settings) => {
  const coercedSettings = { ...settings };
  const models = coercedSettings[STORAGE_KEY_MODELS];

  if (
    Array.isArray(models) &&
    models.some((model) => typeof model === "string")
  ) {
    coercedSettings[STORAGE_KEY_MODELS] = models.map((model) => {
      return typeof model === "string" ? { id: model } : model;
    });
  }

  return coercedSettings;
};

const pickChangedSettings = (storedSettings, normalizedSettings) => {
  return Object.entries(normalizedSettings).reduce(
    (changedSettings, [key, value]) => {
      if (!hasEqualValue(storedSettings[key], value)) {
        changedSettings[key] = value;
      }

      return changedSettings;
    },
    {},
  );
};

const hasEqualValue = (left, right) => {
  return JSON.stringify(left) === JSON.stringify(right);
};

export const SETTINGS_STORE_KEYS = Object.freeze({
  sync: SYNC_STORAGE_KEYS,
  local: LOCAL_STORAGE_KEYS,
  session: SESSION_STORAGE_KEYS,
});
