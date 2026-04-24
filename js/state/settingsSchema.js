/**
 * @fileoverview Central schema for settings storage keys, defaults, and
 * normalization helpers.
 *
 * This module is intentionally side-effect free. It does not read from Chrome
 * storage and does not expose raw secret values in UI-safe defaults.
 */

import {
  DEFAULT_BULLET_COUNT_NUM,
  DEFAULT_CHAT_QUICK_PROMPTS,
  DEFAULT_DEBUG_MODE,
  DEFAULT_MAX_REQUEST_PRICE,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_PREPOPULATE_LANGUAGES,
  DEFAULT_SELECTED_CHAT_MODEL_ID,
  DEFAULT_SELECTED_SUMMARY_MODEL_ID,
  DEFAULT_XML_PROMPT_TEMPLATE,
  FALLBACK_SVG_PATH,
  STORAGE_KEY_ALSO_SEND_TO_JOPLIN,
  STORAGE_KEY_ALWAYS_USE_US_ENGLISH,
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_BULLET_COUNT,
  STORAGE_KEY_CHAT_MODEL_ID,
  STORAGE_KEY_CHAT_QUICK_PROMPTS,
  STORAGE_KEY_DEBUG,
  STORAGE_KEY_JOPLIN_TOKEN,
  STORAGE_KEY_JOPLIN_TOKEN_LOCAL,
  STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
  STORAGE_KEY_LANGUAGE_INFO,
  STORAGE_KEY_MAX_REQUEST_PRICE,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_NEWSBLUR_TOKEN,
  STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
  STORAGE_KEY_PROMPT_TEMPLATE,
  STORAGE_KEY_SUMMARY_MODEL_ID,
} from "../../constants.js";

export const STORAGE_KEY_MAX_PRICE_BEHAVIOR = "maxPriceBehavior";
export const STORAGE_KEY_MODEL_PRICING_CACHE = "modelPricingCache";
export const STORAGE_KEY_LAST_ACTIVE_TAB = "lastActiveTab";
export const STORAGE_KEY_ERROR_LOG = "errorLog";
export const STORAGE_KEY_ENCRYPTION_KEY = "encryptionKey_v1";
export const STORAGE_KEY_LAST_JOPLIN_NOTEBOOK_ID = "lastUsedJoplinNotebookId";
export const STORAGE_KEY_LAST_JOPLIN_NOTEBOOK_NAME = "lastUsedJoplinNotebookName";
export const STORAGE_KEY_CHAT_CONTEXT = "chatContext";
export const STORAGE_KEY_CURRENT_CHAT_REQUEST_ID = "currentChatRequestId";

export const DEFAULT_BULLET_COUNT = String(DEFAULT_BULLET_COUNT_NUM);
export const DEFAULT_MAX_PRICE_BEHAVIOR = "truncate";
export const DEFAULT_ALWAYS_USE_US_ENGLISH = true;
export const DEFAULT_ALSO_SEND_TO_JOPLIN = false;
export const DEFAULT_LANGUAGE_INFO = [];
export const DEFAULT_LAST_ACTIVE_TAB = "summary-tab";

export const SETTINGS_LIMITS = Object.freeze({
  maxModels: 10,
  maxLanguages: 5,
  maxChatQuickPrompts: 10,
  minMaxRequestPrice: 0,
});

export const VALID_BULLET_COUNTS = Object.freeze(["3", "4", "5", "6", "7", "8"]);
export const VALID_MAX_PRICE_BEHAVIORS = Object.freeze(["truncate", "fail"]);

export const SYNC_STORAGE_KEYS = Object.freeze([
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_NEWSBLUR_TOKEN,
  STORAGE_KEY_JOPLIN_TOKEN,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_SUMMARY_MODEL_ID,
  STORAGE_KEY_CHAT_MODEL_ID,
  STORAGE_KEY_DEBUG,
  STORAGE_KEY_BULLET_COUNT,
  STORAGE_KEY_LANGUAGE_INFO,
  STORAGE_KEY_MAX_REQUEST_PRICE,
  STORAGE_KEY_MAX_PRICE_BEHAVIOR,
  STORAGE_KEY_CHAT_QUICK_PROMPTS,
  STORAGE_KEY_PROMPT_TEMPLATE,
  STORAGE_KEY_ALWAYS_USE_US_ENGLISH,
  STORAGE_KEY_ALSO_SEND_TO_JOPLIN,
]);

export const LOCAL_STORAGE_KEYS = Object.freeze([
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
  STORAGE_KEY_JOPLIN_TOKEN_LOCAL,
  STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
  STORAGE_KEY_MODEL_PRICING_CACHE,
  STORAGE_KEY_LAST_ACTIVE_TAB,
  STORAGE_KEY_ERROR_LOG,
  STORAGE_KEY_ENCRYPTION_KEY,
  STORAGE_KEY_LAST_JOPLIN_NOTEBOOK_ID,
  STORAGE_KEY_LAST_JOPLIN_NOTEBOOK_NAME,
]);

export const SESSION_STORAGE_KEYS = Object.freeze([
  STORAGE_KEY_CHAT_CONTEXT,
  STORAGE_KEY_CURRENT_CHAT_REQUEST_ID,
]);

export const STORAGE_KEYS_BY_AREA = Object.freeze({
  sync: SYNC_STORAGE_KEYS,
  local: LOCAL_STORAGE_KEYS,
  session: SESSION_STORAGE_KEYS,
});

export const UI_SAFE_SETTINGS_DEFAULTS = Object.freeze({
  hasApiKey: false,
  hasNewsblurToken: false,
  hasJoplinToken: false,
  models: cloneModelOptions(DEFAULT_MODEL_OPTIONS),
  summaryModelId: DEFAULT_SELECTED_SUMMARY_MODEL_ID,
  chatModelId: DEFAULT_SELECTED_CHAT_MODEL_ID,
  debug: DEFAULT_DEBUG_MODE,
  bulletCount: DEFAULT_BULLET_COUNT,
  language_info: DEFAULT_LANGUAGE_INFO,
  maxRequestPrice: DEFAULT_MAX_REQUEST_PRICE,
  maxPriceBehavior: DEFAULT_MAX_PRICE_BEHAVIOR,
  chatQuickPrompts: cloneQuickPrompts(DEFAULT_CHAT_QUICK_PROMPTS),
  promptTemplate: DEFAULT_XML_PROMPT_TEMPLATE,
  alwaysUseUsEnglish: DEFAULT_ALWAYS_USE_US_ENGLISH,
  alsoSendToJoplin: DEFAULT_ALSO_SEND_TO_JOPLIN,
});

export const normalizeDebug = (value) => value === true;

export const normalizeBulletCount = (value, fallback = DEFAULT_BULLET_COUNT) => {
  const normalized = typeof value === "number" ? String(value) : value;
  return VALID_BULLET_COUNTS.includes(normalized) ? normalized : fallback;
};

export const normalizeMaxRequestPrice = (
  value,
  fallback = DEFAULT_MAX_REQUEST_PRICE,
) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= SETTINGS_LIMITS.minMaxRequestPrice) {
    return fallback;
  }
  return parsed;
};

export const normalizeMaxPriceBehavior = (
  value,
  fallback = DEFAULT_MAX_PRICE_BEHAVIOR,
) => {
  return VALID_MAX_PRICE_BEHAVIORS.includes(value) ? value : fallback;
};

export const normalizeModels = (
  models,
  fallback = DEFAULT_MODEL_OPTIONS,
  maxModels = SETTINGS_LIMITS.maxModels,
) => {
  const source = Array.isArray(models) && models.length > 0 ? models : fallback;
  const normalized = source
    .map((model) => {
      const id = typeof model?.id === "string" ? model.id.trim() : "";
      return id === "" ? null : { id };
    })
    .filter((model) => model !== null)
    .slice(0, maxModels);

  if (normalized.length > 0) {
    return normalized;
  }

  return cloneModelOptions(fallback).slice(0, maxModels);
};

export const normalizeSelectedModelId = (
  modelId,
  models,
  fallback = DEFAULT_SELECTED_SUMMARY_MODEL_ID,
) => {
  const availableModelIds = normalizeModels(models).map((model) => model.id);
  if (typeof modelId === "string" && availableModelIds.includes(modelId)) {
    return modelId;
  }
  if (availableModelIds.length > 0) {
    return availableModelIds[0];
  }
  return fallback;
};

export const normalizeModelSelection = ({
  models,
  summaryModelId,
  chatModelId,
} = {}) => {
  const normalizedModels = normalizeModels(models);
  return {
    models: normalizedModels,
    summaryModelId: normalizeSelectedModelId(
      summaryModelId,
      normalizedModels,
      DEFAULT_SELECTED_SUMMARY_MODEL_ID,
    ),
    chatModelId: normalizeSelectedModelId(
      chatModelId,
      normalizedModels,
      DEFAULT_SELECTED_CHAT_MODEL_ID,
    ),
  };
};

export const normalizeLanguageInfo = (
  languageInfo,
  fallback = DEFAULT_LANGUAGE_INFO,
  maxLanguages = SETTINGS_LIMITS.maxLanguages,
) => {
  const source = Array.isArray(languageInfo) && languageInfo.length > 0
    ? languageInfo
    : fallback;

  return source
    .map((language) => {
      const languageName =
        typeof language?.language_name === "string"
          ? language.language_name.trim()
          : "";
      const svgPath =
        typeof language?.svg_path === "string" ? language.svg_path.trim() : "";

      if (languageName === "") {
        return null;
      }

      return {
        language_name: languageName,
        svg_path: svgPath,
      };
    })
    .filter((language) => language !== null)
    .slice(0, maxLanguages);
};

export const createDefaultLanguageInfo = (
  languages = [],
  resolveUrl = (path) => path,
) => {
  return DEFAULT_PREPOPULATE_LANGUAGES.map((languageName) => {
    const language = Array.isArray(languages)
      ? languages.find((item) => item?.name === languageName)
      : null;
    const code = typeof language?.code === "string"
      ? language.code.toLowerCase()
      : null;
    const svgPath = code ? `country-flags/svg/${code}.svg` : FALLBACK_SVG_PATH;

    return {
      language_name: languageName,
      svg_path: resolveUrl(svgPath),
    };
  });
};

export const normalizeChatQuickPrompts = (
  quickPrompts,
  fallback = DEFAULT_CHAT_QUICK_PROMPTS,
  maxPrompts = SETTINGS_LIMITS.maxChatQuickPrompts,
) => {
  const source = Array.isArray(quickPrompts) && quickPrompts.length > 0
    ? quickPrompts
    : fallback;
  const normalized = source
    .map((item) => {
      const title = typeof item?.title === "string" ? item.title.trim() : "";
      const prompt = typeof item?.prompt === "string" ? item.prompt.trim() : "";
      if (title === "" || prompt === "") {
        return null;
      }
      return { title, prompt };
    })
    .filter((item) => item !== null)
    .slice(0, maxPrompts);

  if (normalized.length > 0) {
    return normalized;
  }

  return cloneQuickPrompts(fallback).slice(0, maxPrompts);
};

export const normalizeSettingsForUi = (storedSettings = {}) => {
  const modelSelection = normalizeModelSelection({
    models: storedSettings[STORAGE_KEY_MODELS],
    summaryModelId: storedSettings[STORAGE_KEY_SUMMARY_MODEL_ID],
    chatModelId: storedSettings[STORAGE_KEY_CHAT_MODEL_ID],
  });

  return {
    ...UI_SAFE_SETTINGS_DEFAULTS,
    ...modelSelection,
    debug: normalizeDebug(storedSettings[STORAGE_KEY_DEBUG]),
    bulletCount: normalizeBulletCount(storedSettings[STORAGE_KEY_BULLET_COUNT]),
    language_info: normalizeLanguageInfo(storedSettings[STORAGE_KEY_LANGUAGE_INFO]),
    maxRequestPrice: normalizeMaxRequestPrice(
      storedSettings[STORAGE_KEY_MAX_REQUEST_PRICE],
    ),
    maxPriceBehavior: normalizeMaxPriceBehavior(
      storedSettings[STORAGE_KEY_MAX_PRICE_BEHAVIOR],
    ),
    chatQuickPrompts: normalizeChatQuickPrompts(
      storedSettings[STORAGE_KEY_CHAT_QUICK_PROMPTS],
    ),
    promptTemplate:
      typeof storedSettings[STORAGE_KEY_PROMPT_TEMPLATE] === "string" &&
      storedSettings[STORAGE_KEY_PROMPT_TEMPLATE].trim() !== ""
        ? storedSettings[STORAGE_KEY_PROMPT_TEMPLATE]
        : DEFAULT_XML_PROMPT_TEMPLATE,
    alwaysUseUsEnglish:
      storedSettings[STORAGE_KEY_ALWAYS_USE_US_ENGLISH] ??
      DEFAULT_ALWAYS_USE_US_ENGLISH,
    alsoSendToJoplin:
      storedSettings[STORAGE_KEY_ALSO_SEND_TO_JOPLIN] ??
      DEFAULT_ALSO_SEND_TO_JOPLIN,
  };
};

function cloneModelOptions(models) {
  return models.map((model) => ({ id: model.id }));
}

function cloneQuickPrompts(prompts) {
  return prompts.map((item) => ({
    title: item.title,
    prompt: item.prompt,
  }));
}
