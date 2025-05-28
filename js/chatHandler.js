// js/chatHandler.js
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_MODELS,
  DEFAULT_MODEL_OPTIONS,
} from "../constants.js";

export function handleLlmChatStream(request, sendResponse, DEBUG = false) {
  if (DEBUG) {
    console.log(
      "[LLM Chat Handler] Handling llmChatStream request with messages:",
      request.messages.length,
      "messages.",
    );
  }
  chrome.storage.sync.get(
    [STORAGE_KEY_API_KEY, STORAGE_KEY_MODELS],
    (storageResult) => {
      const apiKey = storageResult[STORAGE_KEY_API_KEY];
      let models = DEFAULT_MODEL_OPTIONS;
      if (
        Array.isArray(storageResult[STORAGE_KEY_MODELS]) &&
        storageResult[STORAGE_KEY_MODELS].length > 0 &&
        storageResult[STORAGE_KEY_MODELS].every(
          (m) =>
            typeof m === "object" && m !== null && typeof m.id === "string",
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
        typeof request.model !== "string" ||
        request.model.trim() === "" ||
        !modelIds.includes(request.model)
      ) {
        console.error(
          `[LLM Chat Handler] Invalid or unavailable model requested for chat: "${request.model}". Available:`,
          modelIds,
        );
        sendResponse({
          status: "error",
          message: `Invalid or unavailable model requested: ${request.model}`,
        });
        return;
      }

      const controller = new AbortController();
      const signal = controller.signal;
      // Storing the controller in session storage to be accessible by abortChatRequest
      chrome.storage.session.set({ chatAbortController: controller });


      const payload = {
        model: request.model,
        messages: request.messages,
      };

      if (DEBUG) {
        console.log(
          "[LLM Chat Handler] Sending payload to OpenRouter for chat:",
          payload,
        );
      }

      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            "https://github.com/bogorad/openrouter-summarizer",
          "X-Title": "OR-Summ",
        },
        body: JSON.stringify(payload),
        signal: signal,
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
          if (DEBUG) {
            console.log(
              "[LLM Chat Handler] Received raw chat response data:",
              data,
            );
          }

          if (data && data.error && data.error.code && data.error.message) {
            const errorMsg = `ERROR: ${data.error.code} ${data.error.message}`;
            console.error(
              "[LLM Chat Handler] API returned an error:",
              data.error,
            );
            try {
              sendResponse({ status: "error", message: errorMsg });
            } catch (e) {
              if (DEBUG) {
                console.warn(
                  "[LLM Chat Handler] Failed to send API error response:",
                  e.message,
                );
              }
            }
            chrome.storage.session.remove("chatAbortController");
            return;
          }

          const directContent =
            data?.choices?.[0]?.message?.content?.trim();

          if (directContent !== undefined && directContent !== null) {
            if (DEBUG) {
              console.log(
                "[LLM Chat Handler] Extracted direct content:",
                directContent.substring(0, 100) + "...",
              );
            }
            try {
              sendResponse({ status: "success", content: directContent });
            } catch (e) {
              if (DEBUG) {
                console.warn(
                  "[LLM Chat Handler] Failed to send chat success response:",
                  e.message,
                );
              }
            }
          } else {
            console.error(
              "[LLM Chat Handler] API success but no content found in response:",
              data,
            );
            try {
              sendResponse({
                status: "error",
                message: "API success but no content received.",
              });
            } catch (e) {
              if (DEBUG) {
                console.warn(
                  "[LLM Chat Handler] Failed to send no-content error response:",
                  e.message,
                );
              }
            }
          }
          chrome.storage.session.remove("chatAbortController");
        })
        .catch((error) => {
          if (error.name !== "AbortError") {
            if (DEBUG) {
              console.error(
                "[LLM Chat Handler] Error in fetch for chat:",
                error,
              );
            }
          } else {
            if (DEBUG) console.log("[LLM Chat Handler] Chat fetch aborted.");
          }
          try {
            sendResponse({ status: "error", message: error.message });
          } catch (e) {
            if (DEBUG) {
              console.warn(
                "[LLM Chat Handler] Failed to send fetch/network error response:",
                e.message,
              );
            }
          }
          chrome.storage.session.remove("chatAbortController");
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
        if (DEBUG) console.log("[LLM Chat Handler] AbortController triggered abort.");
      } catch (abortError) {
        if (DEBUG) console.error("[LLM Chat Handler] Error calling abort():", abortError);
      }
      chrome.storage.session.remove("chatAbortController");
      try {
        sendResponse({ status: "aborted" });
      } catch (e) {
        if (DEBUG) {
          console.warn("[LLM Chat Handler] Failed to send abort response:", e.message);
        }
      }
    } else {
      if (DEBUG) {
        console.log("[LLM Chat Handler] No active request or valid controller to abort.");
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