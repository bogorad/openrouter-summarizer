// js/chatHandler.js
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_MODELS,
  DEFAULT_MODEL_OPTIONS,
} from "../constants.js";

export function handleLlmChatStream(request, sendResponse, DEBUG = false) {
  if (DEBUG) {
    console.log(
      "[LLM Chat Handler] Received llmChatStream request:",
      // Mask API key for security
      { ...request, messages: "[MESSAGES]" },
    );
  }

  chrome.storage.sync.get(
    [STORAGE_KEY_API_KEY, STORAGE_KEY_MODELS],
    (storageResult) => {
      const apiKey = storageResult[STORAGE_KEY_API_KEY];
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
      // Storing the controller in session storage to be accessible by abortChatRequest
      chrome.storage.session.set({ chatAbortController: controller });

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
          if (data.error) {
            const errorMsg = data.error.message || "Unknown API error.";
            sendResponse({ status: "error", message: errorMsg });
            return;
          }

          if (DEBUG)
            console.warn(
              "[LLM Chat Handler] Non-streaming response received, which is unexpected. Processing direct content.",
            );

          // Clean up the abort controller from session storage on successful completion
          chrome.storage.session.remove("chatAbortController");

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
          // Clean up the abort controller from session storage on error
          chrome.storage.session.remove("chatAbortController");

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
  chrome.storage.session.get("chatAbortController", (data) => {
    // The controller is stored directly, not as a property of an object.
    const controller = data.chatAbortController;

    // Check if controller exists and has an abort method
    if (controller && typeof controller.abort === "function") {
      try {
        controller.abort();
        if (DEBUG)
          console.log("[LLM Chat Handler] AbortController triggered abort.");
      } catch (abortError) {
        if (DEBUG)
          console.error(
            "[LLM Chat Handler] Error calling abort():",
            abortError,
          );
      }
      chrome.storage.session.remove("chatAbortController");
      try {
        sendResponse({ status: "aborted" });
      } catch (e) {
        if (DEBUG) {
          console.warn(
            "[LLM Chat Handler] Failed to send abort response:",
            e.message,
          );
        }
      }
    } else {
      if (DEBUG) {
        console.log(
          "[LLM Chat Handler] No active request or valid controller to abort.",
        );
      }
      try {
        sendResponse({ status: "no active request" });
      } catch (e) {
        if (DEBUG) {
          console.warn(
            "[LLM Chat Handler] Failed to send no active request response:",
            e.message,
          );
        }
      }
    }
  });
}
