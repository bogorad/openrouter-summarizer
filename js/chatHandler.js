// js/chatHandler.js
/**
 * @fileoverview Handles LLM chat completion requests and abort functionality.
 * Manages AbortControllers with size limits and automatic cleanup to prevent memory leaks.
 */
import {
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_MODELS,
  DEFAULT_MODEL_OPTIONS,
  MAX_ACTIVE_CONTROLLERS,
  CONTROLLER_TIMEOUT_MS,
  CONTROLLER_CLEANUP_INTERVAL_MS,
} from "../constants.js";
import { decryptSensitiveData } from "./encryption.js";
import { Logger } from "./logger.js";

// In-memory storage for AbortControllers (not serializable, can't use chrome.storage)
const activeControllers = new Map();

/**
 * Safely aborts an AbortController, catching any errors.
 * @param {AbortController} controller - The controller to abort
 * @returns {boolean} True if abort succeeded, false otherwise
 */
const safeAbort = (controller) => {
  try {
    if (controller && typeof controller.abort === "function") {
      controller.abort();
      return true;
    }
  } catch (error) {
    Logger.warn("[LLM Chat Handler]", "Error during abort:", error);
  }
  return false;
};

/**
 * Evicts oldest entries from activeControllers when size limit is reached.
 * Removes approximately 20% of entries to avoid frequent evictions.
 * @param {boolean} DEBUG - Enable debug logging
 */
const evictOldestControllers = (DEBUG = false) => {
  if (activeControllers.size < MAX_ACTIVE_CONTROLLERS) {
    return;
  }

  const evictCount = Math.ceil(MAX_ACTIVE_CONTROLLERS * 0.2);
  const sortedEntries = [...activeControllers.entries()].sort(
    (a, b) => a[1].timestamp - b[1].timestamp
  );

  for (let i = 0; i < evictCount && i < sortedEntries.length; i++) {
    const [requestId, data] = sortedEntries[i];
    safeAbort(data.controller);
    activeControllers.delete(requestId);
    if (DEBUG) {
      Logger.info("[LLM Chat Handler]", `Evicted stale controller ${requestId}`);
    }
  }
};

/**
 * Periodic cleanup of stale controllers as a backup safety mechanism.
 * Removes entries older than CONTROLLER_TIMEOUT_MS.
 */
const cleanupStaleControllers = () => {
  const now = Date.now();
  for (const [requestId, data] of activeControllers.entries()) {
    if (now - data.timestamp > CONTROLLER_TIMEOUT_MS) {
      safeAbort(data.controller);
      activeControllers.delete(requestId);
    }
  }
};

// Start periodic cleanup interval as backup safety mechanism
setInterval(cleanupStaleControllers, CONTROLLER_CLEANUP_INTERVAL_MS);

export function handleLlmChatCompletion(request, sendResponse, DEBUG = false) {
  if (DEBUG) {
    Logger.info("[LLM Chat Handler]", "Received direct chat completion request:",
      // Mask API key for security
      { ...request, messages: "[MESSAGES]" },
    );
  }

  chrome.storage.sync.get(
    [STORAGE_KEY_MODELS],
    async (storageResult) => {
      // Get encrypted API key from local storage and decrypt it
      const localData = await chrome.storage.local.get([STORAGE_KEY_API_KEY_LOCAL]);
      const encryptedApiKey = localData[STORAGE_KEY_API_KEY_LOCAL];
      const decryptResult = await decryptSensitiveData(encryptedApiKey);
      if (!decryptResult.success) {
        Logger.error("[LLM Chat Handler]", "Failed to decrypt API key:", decryptResult.error);
      }
      const apiKey = decryptResult.data;

      let models = [];
      if (
        Array.isArray(storageResult[STORAGE_KEY_MODELS]) &&
        storageResult[STORAGE_KEY_MODELS].length > 0 &&
        storageResult[STORAGE_KEY_MODELS].every(
          (m) => typeof m === "object" && m.id,
        )
      ) {
        models = storageResult[STORAGE_KEY_MODELS].map((m) => ({
          id: m.id,
        }));
      }
      const modelIds = models.map((m) => m.id);

      if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
        sendResponse({ status: "error", message: "API key required." });
        return;
      }

      if (
        !request.model ||
        request.model.trim() === "" ||
        !modelIds.includes(request.model)
      ) {
        const errorMsg = `Invalid or missing model ID: '${request.model}'. Please select a valid model in options.`;
        Logger.error("[LLM Chat Handler]", "Aborting chat request due to invalid model.");
        sendResponse({
          status: "error",
          message: errorMsg,
        });
        return;
      }

      const payload = {
        model: request.model,
        messages: request.messages,
        stream: false,
        max_tokens: 4096, // Added max_tokens parameter
      };

      const controller = new AbortController();

      const requestId =
        typeof request.requestId === "string" && request.requestId.trim() !== ""
          ? request.requestId.trim()
          : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Evict oldest controllers if at size limit before adding new one
      evictOldestControllers(DEBUG);

      // Store controller in memory map
      activeControllers.set(requestId, {
        controller,
        timestamp: Date.now(),
        model: request.model
      });

      // Set up automatic cleanup after timeout (prevent memory leaks)
      setTimeout(() => {
        if (activeControllers.has(requestId)) {
          const data = activeControllers.get(requestId);
          safeAbort(data.controller);
          activeControllers.delete(requestId);
          if (DEBUG) Logger.info("[LLM Chat Handler]", `Auto-cleaned stale request ${requestId}`);
        }
      }, CONTROLLER_TIMEOUT_MS);

      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
          "X-Title": "OR-Summ: Chat",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
        .then((response) =>
          response.ok
            ? response.json()
            : response.text().then((text) => {
                throw new Error(
                  `HTTP error! status: ${response.status} - ${text}`,
                );
              }),
        )
        .then((data) => {
          // Clean up controller on completion
          activeControllers.delete(requestId);

          if (data.error) {
            const errorMsg = data.error.message || "Unknown API error.";
            sendResponse({ status: "error", message: errorMsg });
            return;
          }

          if (DEBUG)
            Logger.info("[LLM Chat Handler]", "Direct chat completion response received.");

          const directContent = data?.choices?.[0]?.message?.content?.trim();
          if (directContent) {
            if (DEBUG)
              Logger.info("[LLM Chat Handler]", "Success with direct content:",
                directContent.substring(0, 100) + "...",
                "Model:",
                data.model,
              );
            sendResponse({
              status: "success",
              responseType: "completion",
              requestId,
              content: directContent,
            });
          } else {
            sendResponse({
              status: "error",
              message: "No content in response.",
            });
          }
        })
        .catch((error) => {
          // Clean up controller on error
          activeControllers.delete(requestId);

          if (error.name === "AbortError") {
            Logger.debug("[LLM Chat Handler]", "Chat fetch aborted.");
            sendResponse({ status: "aborted" });
          } else {
            Logger.error("[LLM Chat Handler]", "Fetch error:", error);
            sendResponse({ status: "error", message: error.message });
          }
        });
    },
  );
}

// Legacy action bridge: the runtime action is still named llmChatStream.
export const handleLlmChatStream = handleLlmChatCompletion;

/**
  * Handles abort request for an active chat request.
  * @param {object} request - Runtime request containing the requestId to abort.
 * @param {Function} sendResponse - Callback to send response
 * @param {boolean} DEBUG - Enable debug logging
 * @returns {boolean} True to keep message channel open
 */
export function handleAbortChatRequest(request, sendResponse, DEBUG = false) {
  Logger.debug("[LLM Chat Handler]", "Handling abortChatRequest.");
  const requestId = request?.requestId;
  if (!requestId) {
    sendResponse({
      status: "error",
      message: "Missing chat request id.",
    });
    return true;
  }

  const requestData = activeControllers.get(requestId);
  if (requestData && requestData.controller) {
    const aborted = safeAbort(requestData.controller);
    activeControllers.delete(requestId);
    if (DEBUG) {
      Logger.info("[LLM Chat Handler]", "AbortController triggered abort.");
    }
    sendResponse({
      status: aborted ? "aborted" : "error",
      requestId,
      message: aborted ? undefined : "Failed to abort request",
    });
    return true;
  }

  if (DEBUG) {
    Logger.info("[LLM Chat Handler]", "No active request or valid controller to abort.");
  }
  sendResponse({ status: "no active request", requestId });
  return true; // Keep message channel open
}
