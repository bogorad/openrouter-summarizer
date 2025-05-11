// services/settingsService.js
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_SUMMARY_MODEL_ID,
  STORAGE_KEY_CHAT_MODEL_ID,
  STORAGE_KEY_DEBUG,
  STORAGE_KEY_BULLET_COUNT,
  STORAGE_KEY_LANGUAGE_INFO,
  STORAGE_KEY_MAX_REQUEST_PRICE,
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_BULLET_COUNT,
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_POSTAMBLE_TEXT,
  DEFAULT_FORMAT_INSTRUCTIONS,
  DEFAULT_MAX_REQUEST_PRICE,
} from "../constants.js";

import { logDebug, sanitizeForLogging } from "../utils/errorHandling.js";

/**
 * Get all settings from storage
 * @returns {Promise<Object>} Settings object
 */
export function getSettings() {
  const keysToFetch = [
    STORAGE_KEY_API_KEY,
    STORAGE_KEY_MODELS,
    STORAGE_KEY_SUMMARY_MODEL_ID,
    STORAGE_KEY_CHAT_MODEL_ID,
    STORAGE_KEY_DEBUG,
    STORAGE_KEY_BULLET_COUNT,
    STORAGE_KEY_LANGUAGE_INFO,
    STORAGE_KEY_MAX_REQUEST_PRICE,
    PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
    PROMPT_STORAGE_KEY_PREAMBLE,
    PROMPT_STORAGE_KEY_POSTAMBLE,
    PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  ];

  return new Promise((resolve) => {
    chrome.storage.sync.get(keysToFetch, (data) => {
      logDebug("Storage data retrieved", sanitizeForLogging(data));

      let loadedModels = DEFAULT_MODEL_OPTIONS;
      if (
        Array.isArray(data[STORAGE_KEY_MODELS]) &&
        data[STORAGE_KEY_MODELS].length > 0 &&
        data[STORAGE_KEY_MODELS].every(
          (m) => typeof m === "object" && m !== null && typeof m.id === "string"
        )
      ) {
        loadedModels = data[STORAGE_KEY_MODELS].map((m) => ({ id: m.id }));
      } else if (data[STORAGE_KEY_MODELS]) {
        logDebug("Loaded models data is invalid, using defaults");
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
        if (data[STORAGE_KEY_SUMMARY_MODEL_ID]) {
          logDebug(
            `Stored summaryModelId "${data[STORAGE_KEY_SUMMARY_MODEL_ID]}" invalid, defaulting to "${finalSummaryModelId}"`
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
        if (data[STORAGE_KEY_CHAT_MODEL_ID]) {
          logDebug(
            `Stored chatModelId "${data[STORAGE_KEY_CHAT_MODEL_ID]}" invalid, defaulting to "${finalChatModelId}"`
          );
        }
      }

      const settings = {
        apiKey: data[STORAGE_KEY_API_KEY] || "",
        models: loadedModels,
        summaryModelId: finalSummaryModelId,
        chatModelId: finalChatModelId,
        debug: !!data[STORAGE_KEY_DEBUG],
        bulletCount: data[STORAGE_KEY_BULLET_COUNT] || DEFAULT_BULLET_COUNT,
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
          data[STORAGE_KEY_MAX_REQUEST_PRICE] || DEFAULT_MAX_REQUEST_PRICE,
      };

      logDebug("Sending settings response - OK", sanitizeForLogging(settings));
      resolve(settings);
    });
  });
}

/**
 * Get chat context from storage
 * @returns {Promise<Object>} Chat context object
 */
export function getChatContext() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      [STORAGE_KEY_MODELS, STORAGE_KEY_LANGUAGE_INFO, STORAGE_KEY_DEBUG],
      (syncData) => {
        logDebug("Sync data for models and language_info", syncData);
        
        chrome.storage.session.get(["chatContext"], (sessionData) => {
          logDebug("Session data for chatContext", sessionData);
          const storedContext = sessionData.chatContext || {};

          let modelsToSend = DEFAULT_MODEL_OPTIONS;
          if (
            Array.isArray(syncData[STORAGE_KEY_MODELS]) &&
            syncData[STORAGE_KEY_MODELS].length > 0 &&
            syncData[STORAGE_KEY_MODELS].every(
              (m) =>
                typeof m === "object" &&
                m !== null &&
                typeof m.id === "string"
            )
          ) {
            modelsToSend = syncData[STORAGE_KEY_MODELS].map((m) => ({
              id: m.id,
            }));
          } else if (syncData[STORAGE_KEY_MODELS]) {
            logDebug("Loaded models data for chat context is invalid, using defaults");
          }

          const responsePayload = {
            domSnippet: storedContext.domSnippet,
            summary: storedContext.summary,
            chatTargetLanguage: storedContext.chatTargetLanguage || "",
            modelUsedForSummary: storedContext.modelUsedForSummary || "",
            models: modelsToSend,
            language_info: Array.isArray(syncData[STORAGE_KEY_LANGUAGE_INFO])
              ? syncData[STORAGE_KEY_LANGUAGE_INFO]
              : [],
            debug: !!syncData[STORAGE_KEY_DEBUG],
          };
          
          logDebug("Sending getChatContext response - OK", responsePayload);
          resolve(responsePayload);
        });
      }
    );
  });
}

/**
 * Save chat context to session storage
 * @param {Object} context - Chat context to save
 * @returns {Promise<void>}
 */
export function saveChatContext(context) {
  return new Promise((resolve) => {
    chrome.storage.session.set({ chatContext: context }, () => {
      logDebug("Chat context saved", context);
      resolve();
    });
  });
}
