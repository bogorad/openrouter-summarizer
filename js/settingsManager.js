// js/settingsManager.js
import {
  DEFAULT_MODEL_OPTIONS,
  STORAGE_KEY_SUMMARY_MODEL_ID,
  STORAGE_KEY_CHAT_MODEL_ID,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
  STORAGE_KEY_DEBUG,
  STORAGE_KEY_BULLET_COUNT,
  STORAGE_KEY_LANGUAGE_INFO,
  STORAGE_KEY_MAX_REQUEST_PRICE,
} from "../constants.js";
import * as constants from "../constants.js"; // Import all constants as an object
import { decryptSensitiveData } from "./encryption.js";

// These were originally in background.js, if they are truly global defaults,
// they might better reside in constants.js or be passed as parameters.
// For now, defining them here if settingsManager needs them independently.
// However, background.js still defines DEFAULT_MAX_REQUEST_PRICE and DEFAULT_BULLET_COUNT.
// This might lead to duplication if not handled carefully.
// It's better if these defaults are sourced from a single place (e.g. constants.js or passed by the caller).

// const LOCAL_DEFAULT_BULLET_COUNT = "5"; // Example if it were needed here
// const LOCAL_DEFAULT_MAX_REQUEST_PRICE = 0.001; // Example


export async function handleGetSettings(sendResponse, DEBUG, currentGlobalDefaults) {
  if (DEBUG) console.log("[LLM Settings Manager] handleGetSettings: Request received. Fetching keys...");
  const keysToFetch = [
    STORAGE_KEY_MODELS,
    STORAGE_KEY_SUMMARY_MODEL_ID,
    STORAGE_KEY_CHAT_MODEL_ID,
    STORAGE_KEY_DEBUG,
    STORAGE_KEY_BULLET_COUNT,
    STORAGE_KEY_LANGUAGE_INFO,
    STORAGE_KEY_MAX_REQUEST_PRICE,
  ];

  chrome.storage.sync.get(keysToFetch, async (data) => {
    try {
      if (chrome.runtime.lastError) {
        throw new Error(`Storage error: ${chrome.runtime.lastError.message}`);
      }

      // Get encrypted tokens from local storage and decrypt them
      const localData = await chrome.storage.local.get([
        STORAGE_KEY_API_KEY_LOCAL,
        STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
      ]);
      const encryptedApiKey = localData[STORAGE_KEY_API_KEY_LOCAL];
      const encryptedNewsblurToken = localData[STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL];
      const apiKeyResult = await decryptSensitiveData(encryptedApiKey);
      if (!apiKeyResult.success) {
        console.error("[LLM Settings Manager] Failed to decrypt API key:", apiKeyResult.error);
      }
      const apiKey = apiKeyResult.data;

      const newsblurResult = await decryptSensitiveData(encryptedNewsblurToken);
      if (!newsblurResult.success) {
        console.error("[LLM Settings Manager] Failed to decrypt NewsBlur token:", newsblurResult.error);
      }
      const newsblurToken = newsblurResult.data;

      if (DEBUG) {
        console.log("[LLM Settings Manager] handleGetSettings: Storage data retrieved.", {
          ...data,
          apiKey: apiKey ? "[API Key Hidden]" : undefined,
          newsblurToken: newsblurToken ? "[NewsBlur Token Hidden]" : undefined,
          // Explicitly log raw storage data for exhaustive debugging
          rawAllData: { ...data, apiKey: '[REDACTED]', newsblurToken: '[REDACTED]' }
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
      } else if (data[STORAGE_KEY_MODELS]) { // Check if it exists but is invalid
        if (DEBUG) {
          console.warn(
            "[LLM Settings Manager] handleGetSettings: Loaded models data is invalid, using defaults.",
            { invalidModelsData: data[STORAGE_KEY_MODELS] }
          );
        }
      }
    
      const availableModelIds = loadedModels.map((m) => m.id);
      if (DEBUG) {
        console.log("[LLM Settings Manager] Available model IDs (from loadedModels):", availableModelIds);
      }

      // Initialize with definitive defaults before checking storage.
      // This ensures a model is always selected even if storage is empty or invalid.
      let finalSummaryModelId = constants.DEFAULT_SELECTED_SUMMARY_MODEL_ID;
      let finalChatModelId = constants.DEFAULT_SELECTED_CHAT_MODEL_ID;
    
      if (
        data[STORAGE_KEY_SUMMARY_MODEL_ID] &&
        availableModelIds.includes(data[STORAGE_KEY_SUMMARY_MODEL_ID])
      ) {
        finalSummaryModelId = data[STORAGE_KEY_SUMMARY_MODEL_ID];
        if (DEBUG) console.log("[LLM Settings Manager] Using stored summaryModelId:", finalSummaryModelId);
      } else if (availableModelIds.length > 0) {
        finalSummaryModelId = availableModelIds[0];
        if (DEBUG) { // Only log if DEBUG is true and there was an attempt to get a stored value
          console.warn(
            `[LLM Settings Manager] handleGetSettings: Stored summaryModelId "${data[STORAGE_KEY_SUMMARY_MODEL_ID]}" invalid or not found in available models, defaulting to "${finalSummaryModelId}".`,
            { rawStorageValue: data[STORAGE_KEY_SUMMARY_MODEL_ID], availableModels: availableModelIds }
          );
        }
      } else { // Fallback if no available models
        if (DEBUG) {
          console.warn("[LLM Settings Manager] No available models to set summaryModelId, using hardcoded default from constants:", constants.DEFAULT_SELECTED_SUMMARY_MODEL_ID);
        }
        finalSummaryModelId = constants.DEFAULT_SELECTED_SUMMARY_MODEL_ID;
      }

      if (
        data[STORAGE_KEY_CHAT_MODEL_ID] &&
        availableModelIds.includes(data[STORAGE_KEY_CHAT_MODEL_ID])
      ) {
        finalChatModelId = data[STORAGE_KEY_CHAT_MODEL_ID];
        if (DEBUG) console.log("[LLM Settings Manager] Using stored chatModelId:", finalChatModelId);
      } else if (availableModelIds.length > 0) {
        finalChatModelId = availableModelIds[0];
        if (DEBUG) { // Only log if DEBUG is true and there was an attempt to get a stored value
          console.warn(
            `[LLM Settings Manager] handleGetSettings: Stored chatModelId "${data[STORAGE_KEY_CHAT_MODEL_ID]}" invalid or not found in available models, defaulting to "${finalChatModelId}".`,
            { rawStorageValue: data[STORAGE_KEY_CHAT_MODEL_ID], availableModels: availableModelIds }
          );
        }
      } else { // Fallback if no available models
        if (DEBUG) {
          console.warn("[LLM Settings Manager] No available models to set chatModelId, using hardcoded default from constants:", constants.DEFAULT_SELECTED_CHAT_MODEL_ID);
        }
        finalChatModelId = constants.DEFAULT_SELECTED_CHAT_MODEL_ID;
      }

      const settings = {
        apiKey: apiKey,
        models: loadedModels,
        summaryModelId: finalSummaryModelId,
        chatModelId: finalChatModelId,
        debug: !!data[STORAGE_KEY_DEBUG],
        bulletCount: data[STORAGE_KEY_BULLET_COUNT] || currentGlobalDefaults.DEFAULT_BULLET_COUNT,
        language_info: Array.isArray(data[STORAGE_KEY_LANGUAGE_INFO])
          ? data[STORAGE_KEY_LANGUAGE_INFO]
          : [],
        maxRequestPrice:
          data[STORAGE_KEY_MAX_REQUEST_PRICE] || currentGlobalDefaults.DEFAULT_MAX_REQUEST_PRICE,
        newsblurToken: newsblurToken,
      };
      if (DEBUG) {
        console.log("[LLM Settings Manager] handleGetSettings: Sending settings response - OK.", {
          ...settings,
          apiKey: settings.apiKey ? "[Hidden]" : "",
          newsblurToken: settings.newsblurToken ? "[Hidden]" : "", // Ensure sensitive tokens are hidden
          // Dump all final settings variables for debugging
          summaryModelId: settings.summaryModelId, // Explicitly list for clarity
          chatModelId: settings.chatModelId,     // Explicitly list for clarity
          allOtherSettings: (function(s) { const {apiKey, newsblurToken, summaryModelId, chatModelId, ...rest} = s; return rest; })(settings), // Dump remaining settings
        });
      }
      sendResponse(settings);
    } catch (error) {
      console.error("[LLM Settings Manager] handleGetSettings: Error during settings processing:", error);
      sendResponse({
        status: "error",
        message: `Failed to load settings: ${error.message}`,
        errorDetails: error.toString(),
      });
    }
  });
}