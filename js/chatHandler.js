// js/chatHandler.js
import {
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_MODELS,
  DEFAULT_MODEL_OPTIONS,
} from "../constants.js";
import { decryptSensitiveData } from "./encryption.js";

// In-memory storage for AbortControllers (not serializable, can't use chrome.storage)
const activeControllers = new Map();

export function handleLlmChatStream(request, sendResponse, DEBUG = false) {
  if (DEBUG) {
    console.log(
      "[LLM Chat Handler] Received llmChatStream request:",
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
        console.error("[LLM Chat Handler] Failed to decrypt API key:", decryptResult.error);
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
        console.error(
          "[LLM Chat Handler] Aborting chat request due to invalid model.",
        );
        sendResponse({
          status: "error",
          message: errorMsg,
        });
        return;
      }

      const payload = {
        model: request.model,
        messages: request.messages,
        max_tokens: 4096, // Added max_tokens parameter
      };

      const controller = new AbortController();

      // Generate unique request ID
      const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Store controller in memory map
      activeControllers.set(requestId, {
        controller,
        timestamp: Date.now(),
        model: request.model
      });

      // Set up automatic cleanup after 60 seconds (prevent memory leaks)
      setTimeout(() => {
        if (activeControllers.has(requestId)) {
          activeControllers.get(requestId).controller.abort();
          activeControllers.delete(requestId);
          if (DEBUG) console.log(`[LLM Chat Handler] Auto-cleaned stale request ${requestId}`);
        }
      }, 60000);

      // Store only requestId in session storage for abort lookup
      chrome.storage.session.set({ currentChatRequestId: requestId });

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
            console.warn(
              "[LLM Chat Handler] Non-streaming response received, which is unexpected. Processing direct content.",
            );

          // Clean up the request ID from session storage on successful completion
          chrome.storage.session.remove("currentChatRequestId");

          const directContent = data?.choices?.[0]?.message?.content?.trim();
          if (directContent) {
            if (DEBUG)
              console.log(
                "[LLM Chat Handler] Success with direct content:",
                directContent.substring(0, 100) + "...",
                "Model:",
                data.model,
              );
            sendResponse({ status: "success", content: directContent });
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

          // Clean up the request ID from session storage on error
          chrome.storage.session.remove("currentChatRequestId");

          if (error.name === "AbortError") {
            if (DEBUG) console.log("[LLM Chat Handler] Chat fetch aborted.");
            sendResponse({ status: "aborted" });
          } else {
            console.error("[LLM Chat Handler] Fetch error:", error);
            sendResponse({ status: "error", message: error.message });
          }
        });
    },
  );
}

export function handleAbortChatRequest(sendResponse, DEBUG = false) {
  if (DEBUG) console.log("[LLM Chat Handler] Handling abortChatRequest.");
  chrome.storage.session.get("currentChatRequestId", (data) => {
    const requestId = data.currentChatRequestId;
    const requestData = activeControllers.get(requestId);

    if (requestData && requestData.controller && typeof requestData.controller.abort === "function") {
      try {
        requestData.controller.abort();
        activeControllers.delete(requestId);
        chrome.storage.session.remove("currentChatRequestId");
        if (DEBUG)
          console.log("[LLM Chat Handler] AbortController triggered abort.");
        sendResponse({ status: "aborted" });
      } catch (abortError) {
        console.error("[LLM Chat Handler] Error calling abort():", abortError);
        sendResponse({ status: "error", message: "Failed to abort request" });
      }
    } else {
      if (DEBUG) {
        console.log(
          "[LLM Chat Handler] No active request or valid controller to abort.",
        );
      }
      sendResponse({ status: "no active request" });
    }
  });
  return true; // Keep message channel open
}
