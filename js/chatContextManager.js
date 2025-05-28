// js/chatContextManager.js
import {
  STORAGE_KEY_MODELS,
  STORAGE_KEY_LANGUAGE_INFO,
  DEFAULT_MODEL_OPTIONS,
} from "../constants.js";

export function handleGetChatContext(sendResponse, DEBUG = false) {
  if (DEBUG) console.log("[LLM Chat Context Manager] Handling getChatContext request.");
  chrome.storage.sync.get(
    [STORAGE_KEY_MODELS, STORAGE_KEY_LANGUAGE_INFO],
    (syncData) => {
      if (DEBUG) {
        console.log(
          "[LLM Chat Context Manager] Sync data for models and language_info:",
          syncData,
        );
      }
      chrome.storage.session.get(["chatContext"], (sessionData) => {
        if (DEBUG) {
          console.log(
            "[LLM Chat Context Manager] Session data for chatContext:",
            sessionData,
          );
        }
        const storedContext = sessionData.chatContext || {};

        let modelsToSend = DEFAULT_MODEL_OPTIONS;
        if (
          Array.isArray(syncData[STORAGE_KEY_MODELS]) &&
          syncData[STORAGE_KEY_MODELS].length > 0 &&
          syncData[STORAGE_KEY_MODELS].every(
            (m) =>
              typeof m === "object" &&
              m !== null &&
              typeof m.id === "string",
          )
        ) {
          modelsToSend = syncData[STORAGE_KEY_MODELS].map((m) => ({
            id: m.id,
          }));
        } else if (syncData[STORAGE_KEY_MODELS]) {
          if (DEBUG) {
            console.warn(
              "[LLM Chat Context Manager] Loaded models data for chat context is invalid, using defaults.",
            );
          }
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
          debug: DEBUG, // Pass the current DEBUG state
        };
        if (DEBUG) {
          console.log(
            "[LLM Chat Context Manager] Sending getChatContext response - OK.",
            responsePayload,
          );
        }
        sendResponse(responsePayload);
      });
    },
  );
}

export function handleSetChatContext(request, sendResponse, DEBUG = false) {
  if (DEBUG) console.log("[LLM Chat Context Manager] Handling setChatContext request.");
  const contextToSave = {
    domSnippet: request.domSnippet,
    summary: request.summary,
    chatTargetLanguage: request.chatTargetLanguage,
    modelUsedForSummary: request.modelUsedForSummary,
  };
  chrome.storage.session.set({ chatContext: contextToSave }, () => {
    if (DEBUG) {
      console.log(
        "[LLM Chat Context Manager] Chat context set in session storage:",
        contextToSave,
      );
    }
    try {
      sendResponse({ status: "ok" });
    } catch (e) {
      if (DEBUG) {
        console.warn("[LLM Chat Context Manager] Failed to send setChatContext response:", e.message);
      }
    }
  });
}