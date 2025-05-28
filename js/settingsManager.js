// js/settingsManager.js
import {
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_POSTAMBLE_TEXT,
  DEFAULT_FORMAT_INSTRUCTIONS,
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  STORAGE_KEY_SUMMARY_MODEL_ID,
  STORAGE_KEY_CHAT_MODEL_ID,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_DEBUG,
  STORAGE_KEY_BULLET_COUNT,
  STORAGE_KEY_LANGUAGE_INFO,
  STORAGE_KEY_MAX_REQUEST_PRICE,
  // DEFAULT_MAX_REQUEST_PRICE, // This is defined in background.js, consider passing or importing if needed globally
  // DEFAULT_BULLET_COUNT, // This is defined in background.js
} from "../constants.js";

// These were originally in background.js, if they are truly global defaults,
// they might better reside in constants.js or be passed as parameters.
// For now, defining them here if settingsManager needs them independently.
// However, background.js still defines DEFAULT_MAX_REQUEST_PRICE and DEFAULT_BULLET_COUNT.
// This might lead to duplication if not handled carefully.
// It's better if these defaults are sourced from a single place (e.g. constants.js or passed by the caller).

// const LOCAL_DEFAULT_BULLET_COUNT = "5"; // Example if it were needed here
// const LOCAL_DEFAULT_MAX_REQUEST_PRICE = 0.001; // Example

export function handleGetSettings(sendResponse, DEBUG, currentGlobalDefaults) {
  if (DEBUG) console.log("[LLM Settings Manager] Handling getSettings request.");
  const keysToFetch = [
    STORAGE_KEY_API_KEY,
    STORAGE_KEY_MODELS,
    STORAGE_KEY_SUMMARY_MODEL_ID,
    STORAGE_KEY_CHAT_MODEL_ID,
    STORAGE_KEY_DEBUG, // Though DEBUG is passed, fetching it ensures consistency if changed elsewhere
    STORAGE_KEY_BULLET_COUNT,
    STORAGE_KEY_LANGUAGE_INFO,
    STORAGE_KEY_MAX_REQUEST_PRICE,
    PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
    PROMPT_STORAGE_KEY_PREAMBLE,
    PROMPT_STORAGE_KEY_POSTAMBLE,
    PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  ];
  chrome.storage.sync.get(keysToFetch, (data) => {
    if (DEBUG) {
      console.log("[LLM Settings Manager] Storage data retrieved:", {
        ...data,
        [STORAGE_KEY_API_KEY]: data[STORAGE_KEY_API_KEY]
          ? "[API Key Hidden]"
          : undefined,
      });
    }

    let loadedModels = DEFAULT_MODEL_OPTIONS;
    if (
      Array.isArray(data[STORAGE_KEY_MODELS]) &&
      data[STORAGE_KEY_MODELS].length > 0 &&
      data[STORAGE_KEY_MODELS].every(
        (m) =>
          typeof m === "object" && m !== null && typeof m.id === "string",
      )
    ) {
      loadedModels = data[STORAGE_KEY_MODELS].map((m) => ({ id: m.id }));
    } else if (data[STORAGE_KEY_MODELS]) {
      if (DEBUG) {
        console.warn(
          "[LLM Settings Manager] Loaded models data is invalid, using defaults.",
        );
      }
    }

    const availableModelIds = loadedModels.map((m) => m.id);
    let finalSummaryModelId = "";
    let finalChatModelId = "";

    if (
      data[STORAGE_KEY_SUMMARY_MODEL_ID] &&
      availableModelIds.includes(data[STORAGE_KEY_SUMMARY_MODEL_ID])
    ) {
      finalSummaryModelId = data[STORAGE_KEY_SUMMARY_MODEL_ID];
    } else if (availableModelIds.length > 0) {
      finalSummaryModelId = availableModelIds[0];
      if (DEBUG && data[STORAGE_KEY_SUMMARY_MODEL_ID]) {
        console.warn(
          `[LLM Settings Manager] Stored summaryModelId "${data[STORAGE_KEY_SUMMARY_MODEL_ID]}" invalid, defaulting to "${finalSummaryModelId}".`,
        );
      }
    }

    if (
      data[STORAGE_KEY_CHAT_MODEL_ID] &&
      availableModelIds.includes(data[STORAGE_KEY_CHAT_MODEL_ID])
    ) {
      finalChatModelId = data[STORAGE_KEY_CHAT_MODEL_ID];
    } else if (availableModelIds.length > 0) {
      finalChatModelId = availableModelIds[0];
      if (DEBUG && data[STORAGE_KEY_CHAT_MODEL_ID]) {
        console.warn(
          `[LLM Settings Manager] Stored chatModelId "${data[STORAGE_KEY_CHAT_MODEL_ID]}" invalid, defaulting to "${finalChatModelId}".`,
        );
      }
    }

    const settings = {
      apiKey: data[STORAGE_KEY_API_KEY] || "",
      models: loadedModels,
      summaryModelId: finalSummaryModelId,
      chatModelId: finalChatModelId,
      debug: !!data[STORAGE_KEY_DEBUG], // Use fetched debug state
      bulletCount: data[STORAGE_KEY_BULLET_COUNT] || currentGlobalDefaults.DEFAULT_BULLET_COUNT,
      language_info: Array.isArray(data[STORAGE_KEY_LANGUAGE_INFO])
        ? data[STORAGE_KEY_LANGUAGE_INFO]
        : [],
      [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]:
        data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] ||
        data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] ||
        DEFAULT_FORMAT_INSTRUCTIONS,
      [PROMPT_STORAGE_KEY_PREAMBLE]:
        data[PROMPT_STORAGE_KEY_PREAMBLE] || DEFAULT_PREAMBLE_TEMPLATE,
      [PROMPT_STORAGE_KEY_POSTAMBLE]:
        data[PROMPT_STORAGE_KEY_POSTAMBLE] || DEFAULT_POSTAMBLE_TEXT,
      [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]:
        data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] ||
        DEFAULT_FORMAT_INSTRUCTIONS,
      maxRequestPrice:
        data[STORAGE_KEY_MAX_REQUEST_PRICE] || currentGlobalDefaults.DEFAULT_MAX_REQUEST_PRICE,
    };
    if (DEBUG) {
      console.log("[LLM Settings Manager] Sending settings response - OK.", {
        ...settings,
        apiKey: settings.apiKey ? "[Hidden]" : "",
      });
    }
    sendResponse(settings);
  });
}