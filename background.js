// background.js
import {
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_POSTAMBLE_TEXT,
  DEFAULT_FORMAT_INSTRUCTIONS,
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  CHAT_SYSTEM_PROMPT_TEMPLATE, // Import new constant
  CHAT_USER_CONTEXT_TEMPLATE, // Import new constant
} from "./constants.js";

console.log(`[LLM Background] Service Worker Start (v3.0.5)`); // Updated version

let DEBUG = false;
const DEFAULT_BULLET_COUNT = "5";
const DEFAULT_DEBUG_MODE = false;

const numToWord = {
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
};

chrome.storage.sync.get("debug", (data) => {
  DEBUG = !!data.debug;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
    contexts: ["all"],
  });
  chrome.storage.sync.get(["apiKey", "debug"], (data) => {
    DEBUG = !!data.debug;
    if (!data.apiKey) {
      chrome.runtime.openOptionsPage();
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sendToLLM" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
  }
});

// Helper to check for common "tab closed" errors
function isTabClosedError(error) {
  if (!error || !error.message) return false;
  return (
    error.message.includes("Receiving end does not exist") ||
    error.message.includes("message channel closed")
  );
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  chrome.storage.sync.get("debug", (result) => {
    DEBUG = !!result.debug;
    if (DEBUG)
      console.log(
        "[LLM Background] Received message:",
        request.action,
        "from sender:",
        sender,
      );

    // --- getSettings Handler ---
    if (request.action === "getSettings") {
      if (DEBUG) console.log("[LLM Background] Handling getSettings request.");
      const keysToFetch = [
        "apiKey",
        "model",
        "models",
        "debug",
        "bulletCount",
        "language_info",
        PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
        PROMPT_STORAGE_KEY_PREAMBLE,
        PROMPT_STORAGE_KEY_POSTAMBLE,
        PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
      ];
      chrome.storage.sync.get(keysToFetch, (data) => {
        if (DEBUG)
          console.log("[LLM Background] Storage data retrieved:", {
            ...data,
            apiKey: data.apiKey ? "[API Key Hidden]" : undefined,
          });
        let loadedModels = DEFAULT_MODEL_OPTIONS;
        if (
          Array.isArray(data.models) &&
          data.models.length > 0 &&
          data.models.every(
            (m) =>
              typeof m === "object" && m !== null && typeof m.id === "string",
          )
        ) {
          loadedModels = data.models.map((m) => ({
            id: m.id,
            label:
              typeof m.label === "string" && m.label.trim() !== ""
                ? m.label
                : m.id,
          }));
        }
        let finalSelectedModel = "";
        const availableModelIds = loadedModels.map((m) => m.id);
        if (data.model && availableModelIds.includes(data.model)) {
          finalSelectedModel = data.model;
        } else if (loadedModels.length > 0) {
          finalSelectedModel = loadedModels[0].id;
        }
        const settings = {
          apiKey: data.apiKey || "",
          model: finalSelectedModel,
          models: loadedModels,
          debug: DEBUG,
          bulletCount: data.bulletCount || DEFAULT_BULLET_COUNT,
          language_info: Array.isArray(data.language_info)
            ? data.language_info
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
        };
        if (DEBUG)
          console.log("[LLM Background] Sending settings response - OK.");
        sendResponse(settings);
      });
      return true;
    }
    // --- getChatContext Handler ---
    else if (request.action === "getChatContext") {
      if (DEBUG)
        console.log("[LLM Background] Handling getChatContext request.");
      chrome.storage.sync.get(["models", "language_info"], (syncData) => {
        // Fetch language_info here
        if (DEBUG)
          console.log(
            "[LLM Background] Sync data for models and language_info:",
            syncData,
          );
        chrome.storage.session.get(["chatContext"], (sessionData) => {
          if (DEBUG)
            console.log(
              "[LLM Background] Session data for chatContext:",
              sessionData,
            );
          const storedContext = sessionData.chatContext || {};
          let modelsToSend = DEFAULT_MODEL_OPTIONS;
          if (
            Array.isArray(syncData.models) &&
            syncData.models.length > 0 &&
            syncData.models.every(
              (m) =>
                typeof m === "object" && m !== null && typeof m.id === "string",
            )
          ) {
            modelsToSend = syncData.models.map((m) => ({
              id: m.id,
              label:
                typeof m.label === "string" && m.label.trim() !== ""
                  ? m.label
                  : m.id,
            }));
          }
          const responsePayload = {
            domSnippet: storedContext.domSnippet,
            summary: storedContext.summary,
            chatTargetLanguage: storedContext.chatTargetLanguage || "",
            modelUsedForSummary: storedContext.modelUsedForSummary || "",
            models: modelsToSend,
            language_info: Array.isArray(syncData.language_info)
              ? syncData.language_info
              : [], // Include language_info
            debug: DEBUG,
          };
          if (DEBUG)
            console.log(
              "[LLM Background] Sending getChatContext response - OK.",
              responsePayload,
            );
          sendResponse(responsePayload);
        });
      });
      return true;
    }
    // --- getLanguageData Handler ---
    // This handler is likely no longer needed as language_info is sent with getChatContext
    // Keeping it for now but might remove later if confirmed unused.
    else if (request.action === "getLanguageData") {
      if (DEBUG)
        console.log(
          "[LLM Background] Handling getLanguageData request (might be deprecated).",
        );
      chrome.storage.sync.get(["language_info"], (data) => {
        if (DEBUG)
          console.log(
            "[LLM Background] Sending getLanguageData response - OK.",
          );
        sendResponse({
          language_info: Array.isArray(data.language_info)
            ? data.language_info
            : [],
        });
      });
      return true;
    }
    // --- llmChatStream Handler ---
    else if (request.action === "llmChatStream") {
      if (DEBUG)
        console.log(
          "[LLM Background] Handling llmChatStream request with messages:",
          request.messages.length,
          "messages.",
        );
      chrome.storage.sync.get(["apiKey", "models"], (storageResult) => {
        const apiKey = storageResult.apiKey;
        const models = storageResult.models || DEFAULT_MODEL_OPTIONS;
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
          sendResponse({ status: "error", message: "Valid model required." });
          return;
        }

        const controller = new AbortController();
        const signal = controller.signal;
        chrome.storage.session.set({ abortController: controller });
        // Note: structured_outputs and response_format might need adjustment based on chat prompt
        const payload = {
          model: request.model,
          messages: request.messages,
          // structured_outputs: "true", // Removed as per chat prompt
          // response_format: { // Removed as per chat prompt
          //   type: "json_schema",
          //   json_schema: {
          //     name: "list_of_strings",
          //     strict: true,
          //     schema: {
          //       type: "array",
          //       items: { type: "string" },
          //       minItems: 1,
          //       maxItems: 9,
          //     },
          //   },
          // },
        };
        if (DEBUG)
          console.log(
            "[LLM Background] Sending payload to OpenRouter for chat:",
            payload,
          );
        fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
            "X-Title": "OR-Summ",
          },
          body: JSON.stringify(payload),
          signal: signal,
        })
          .then((response) =>
            response.ok
              ? response.json()
              : Promise.reject(
                  new Error(`HTTP error! status: ${response.status}`),
                ),
          )
          .then((data) => {
            if (DEBUG)
              console.log(
                "[LLM Background] Received raw chat response data:",
                data,
              ); // Added debug log
            try {
              sendResponse({ status: "success", data });
            } catch (e) {
              if (DEBUG)
                console.warn(
                  "Failed to send chat success response:",
                  e.message,
                );
            }
            chrome.storage.session.remove("abortController");
          })
          .catch((error) => {
            if (error.name !== "AbortError") {
              if (DEBUG)
                console.error(
                  "[LLM Background] Error in fetch for chat:",
                  error,
                );
            } else {
              if (DEBUG) console.log("[LLM Background] Chat fetch aborted.");
            }
            try {
              sendResponse({ status: "error", message: error.message });
            } catch (e) {
              if (DEBUG)
                console.warn("Failed to send chat error response:", e.message);
            }
            chrome.storage.session.remove("abortController");
          });
      });
      return true;
    }
    // --- abortChatRequest Handler ---
    else if (request.action === "abortChatRequest") {
      if (DEBUG) console.log("[LLM Background] Handling abortChatRequest.");
      chrome.storage.session.get("abortController", (data) => {
        const controller = data.abortController;
        if (controller && typeof controller.abort === "function") {
          try {
            controller.abort();
            if (DEBUG) console.log("AbortController triggered abort.");
          } catch (abortError) {
            if (DEBUG) console.error("Error calling abort():", abortError);
          }
          chrome.storage.session.remove("abortController");
          try {
            sendResponse({ status: "aborted" });
          } catch (e) {
            if (DEBUG)
              console.warn("Failed to send abort response:", e.message);
          }
        } else {
          if (DEBUG)
            console.log("No active request or valid controller to abort.");
          try {
            sendResponse({ status: "no active request" });
          } catch (e) {
            if (DEBUG)
              console.warn(
                "Failed to send no active request response:",
                e.message,
              );
          }
        }
      });
      return true;
    }
    // --- setChatContext Handler ---
    else if (request.action === "setChatContext") {
      if (DEBUG)
        console.log("[LLM Background] Handling setChatContext request.");
      chrome.storage.session.set({ chatContext: request }, () => {
        if (DEBUG)
          console.log(
            "[LLM Background] Chat context set in session storage:",
            request,
          );
        try {
          sendResponse({ status: "ok" });
        } catch (e) {
          if (DEBUG)
            console.warn("Failed to send setChatContext response:", e.message);
        }
      });
      return true;
    }
    // --- openChatTab Handler ---
    else if (request.action === "openChatTab") {
      if (DEBUG) console.log("[LLM Background] Handling openChatTab request.");
      chrome.tabs.create(
        { url: chrome.runtime.getURL("chat.html") },
        (newTab) => {
          if (DEBUG)
            console.log("[LLM Background] Chat tab opened:", newTab.id);
          try {
            sendResponse({ status: "opened", tabId: newTab.id });
          } catch (e) {
            if (DEBUG)
              console.warn("Failed to send openChatTab response:", e.message);
          }
        },
      );
      return true;
    }
    // --- openOptionsPage Handler ---
    else if (request.action === "openOptionsPage") {
      if (DEBUG)
        console.log("[LLM Background] Handling openOptionsPage request.");
      chrome.runtime.openOptionsPage();
      if (DEBUG) console.log("[LLM Background] Options page opened.");
      try {
        sendResponse({ status: "options page opened" });
      } catch (e) {
        if (DEBUG)
          console.warn("Failed to send openOptionsPage response:", e.message);
      }
    }
    // --- requestSummary Handler ---
    else if (request.action === "requestSummary") {
      if (DEBUG)
        console.log(
          "[LLM Background] Handling requestSummary for ID:",
          request.requestId,
        );
      chrome.storage.sync.get(
        [
          "apiKey",
          "model",
          "bulletCount",
          "language_info",
          PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
          PROMPT_STORAGE_KEY_PREAMBLE,
          PROMPT_STORAGE_KEY_POSTAMBLE,
          PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
          "models",
        ],
        (data) => {
          // --- ADD DEBUG LOGGING HERE ---
          if (DEBUG) {
            console.log(
              "[LLM Background] Data retrieved for summary request:",
              {
                ...data,
                apiKey: data.apiKey ? "[API Key Hidden]" : "undefined", // Hide key in log
              },
            );
            console.log(
              "[LLM Background] Type of retrieved apiKey:",
              typeof data.apiKey,
            );
          }
          // --- END DEBUG LOGGING ---

          const apiKey = data.apiKey;
          const model = data.model;
          const language_info = Array.isArray(data.language_info)
            ? data.language_info
            : [];
          const models = data.models || DEFAULT_MODEL_OPTIONS;
          const modelIds = models.map((m) => m.id);

          // Validate apiKey
          if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
            console.error(
              "[LLM Background] API key is missing or invalid for summary request. Retrieved value:",
              apiKey,
            ); // Log the problematic value
            // Send error back immediately
            sendResponse({ status: "error", message: "API key required." });
            // Also send error back to the tab via tabs.sendMessage for the summaryResult listener
            if (sender.tab?.id) {
              chrome.tabs.sendMessage(
                sender.tab.id,
                {
                  action: "summaryResult",
                  requestId: request.requestId,
                  error: "API key is required and must be a non-empty string.",
                },
                () => {
                  if (
                    chrome.runtime.lastError &&
                    DEBUG &&
                    !isTabClosedError(chrome.runtime.lastError)
                  ) {
                    console.error(
                      `[LLM Background] Error sending API key error to tab ${sender.tab.id}: ${chrome.runtime.lastError.message}`,
                    );
                  }
                },
              );
            }
            return; // Stop processing
          }
          // Validate model
          if (
            !model ||
            typeof model !== "string" ||
            model.trim() === "" ||
            !modelIds.includes(model)
          ) {
            console.error(
              "[LLM Background] Default model is missing, invalid, or not in configured list for summary request. Retrieved value:",
              model,
            );
            // Send error back immediately
            sendResponse({
              status: "error",
              message: "Default Model is not selected or is invalid.",
            });
            // Also send error back to the tab via tabs.sendMessage for the summaryResult listener
            if (sender.tab?.id) {
              chrome.tabs.sendMessage(
                sender.tab.id,
                {
                  action: "summaryResult",
                  requestId: request.requestId,
                  error: "Default Model is not selected or is invalid.",
                },
                () => {
                  if (
                    chrome.runtime.lastError &&
                    DEBUG &&
                    !isTabClosedError(chrome.runtime.lastError)
                  ) {
                    console.error(
                      `[LLM Background] Error sending model error to tab ${sender.tab.id}: ${chrome.runtime.lastError.message}`,
                    );
                  }
                },
              );
            }
            return; // Stop processing
          }

          // If validation passes, proceed with async fetch...
          const bulletCount = parseInt(
            data.bulletCount || DEFAULT_BULLET_COUNT,
            10,
          );
          // Use the first configured language for the summary prompt, default to English if none configured
          const targetLanguageForPromptGeneration =
            language_info.length > 0 && language_info[0].language_name
              ? language_info[0].language_name
              : "the language of the original article_text"; // Changed default to match original text

          const systemPrompt = getSystemPrompt(
            bulletCount,
            data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] ||
              data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] ||
              DEFAULT_FORMAT_INSTRUCTIONS,
            data[PROMPT_STORAGE_KEY_PREAMBLE] || DEFAULT_PREAMBLE_TEMPLATE,
            data[PROMPT_STORAGE_KEY_POSTAMBLE] || DEFAULT_POSTAMBLE_TEXT,
            data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] ||
              DEFAULT_FORMAT_INSTRUCTIONS,
            targetLanguageForPromptGeneration,
          );
          const payload = {
            model: data.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: request.selectedHtml },
            ],
            structured_outputs: "true",
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "list_of_strings",
                strict: true,
                schema: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 3,
                  maxItems: bulletCount + 1,
                },
              },
            },
          };

          if (DEBUG)
            console.log(
              "[LLM Background] Sending payload to OpenRouter for summary:",
              payload,
            );

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
          })
            .then((response) =>
              response.ok
                ? response.json()
                : Promise.reject(
                    new Error(`HTTP error! status: ${response.status}`),
                  ),
            )
            .then((data) => {
              if (DEBUG)
                console.log(
                  "[LLM Background] Received raw summary response data:",
                  data,
                ); // Added debug log
              const modelOutput = data.choices?.[0]?.message?.content?.trim();
              if (!modelOutput) {
                throw new Error("No response content received from LLM.");
              }
              const completeResponse = {
                action: "summaryResult",
                requestId: request.requestId,
                summary: modelOutput,
                model:
                  data.model || data.model_id || request.model || "Unknown",
                language_info: language_info,
                fullResponse: DEBUG ? data : "[Debug data omitted for brevity]",
              };
              if (DEBUG)
                console.log(
                  "[LLM Background] Complete response being sent to content script:",
                  completeResponse,
                );

              if (sender.tab?.id) {
                chrome.tabs.sendMessage(sender.tab.id, completeResponse, () => {
                  if (chrome.runtime.lastError) {
                    if (isTabClosedError(chrome.runtime.lastError)) {
                      if (DEBUG) {
                        console.log(
                          `[LLM Background] Tab ${sender.tab.id} closed before summary response could be sent.`,
                          chrome.runtime.lastError.message,
                        );
                      }
                    } else {
                      console.error(
                        `[LLM Background] Error sending summary response to tab ${sender.tab.id}:`,
                        chrome.runtime.lastError.message,
                      );
                    }
                  }
                });
              } else {
                if (DEBUG)
                  console.warn(
                    "[LLM Background] No tab ID available to send summary response.",
                  );
              }
            })
            .catch((error) => {
              if (DEBUG)
                console.error(
                  "[LLM Background] Error in fetch for summary:",
                  error,
                );
              const errorResponse = {
                action: "summaryResult",
                requestId: request.requestId,
                error: error.message,
                language_info: language_info,
                fullResponse: DEBUG
                  ? { error: error.message }
                  : "[Debug data omitted for brevity]",
              };
              if (DEBUG)
                console.log(
                  "[LLM Background] Complete error response being sent to content script:",
                  errorResponse,
                );

              if (sender.tab?.id) {
                chrome.tabs.sendMessage(sender.tab.id, errorResponse, () => {
                  if (chrome.runtime.lastError) {
                    if (isTabClosedError(chrome.runtime.lastError)) {
                      if (DEBUG) {
                        console.log(
                          `[LLM Background] Tab ${sender.tab.id} closed before summary error response could be sent.`,
                          chrome.runtime.lastError.message,
                        );
                      }
                    } else {
                      console.error(
                        `[LLM Background] Error sending summary error response to tab ${sender.tab.id}:`,
                        chrome.runtime.lastError.message,
                      );
                    }
                  }
                });
              } else {
                if (DEBUG)
                  console.warn(
                    "[LLM Background] No tab ID available to send summary response.",
                  );
              }
            });

          // Send "processing" response *after* validation passes and fetch is initiated
          if (DEBUG)
            console.log(
              "[LLM Background] Sending requestSummary response - OK (processing).",
            );
          sendResponse({ status: "processing" });
        },
      );
      return true; // Indicate async response WILL be sent later
    }
    // Removed requestTranslation handler

    // If the message action is not recognized by any specific handler,
    // send a default response to prevent the content script from hanging.
    // This is important for robustness, especially if new actions are added later.
    if (DEBUG)
      console.log(
        "[LLM Background] Message handler completed for action:",
        request.action,
        "- No specific handler found, sending default response.",
      );
    // Send a default response for unhandled actions
    try {
      sendResponse({ status: "unhandled", action: request.action });
    } catch (e) {
      if (DEBUG)
        console.warn(
          `[LLM Background] Failed to send default response for unhandled action "${request.action}":`,
          e.message,
        );
    }
    return false; // Indicate no async response will be sent by this path
  });
  return true; // Keep async for listener
});

// --- Prompt Assembly Function ---
function getSystemPrompt(
  bulletCount,
  customFormatInstructions,
  preambleTemplate,
  postambleText,
  defaultFormatInstructions,
  targetLanguage,
) {
  // Use imported constants directly
  const bcNum = Number(bulletCount) || 5;
  const word = numToWord[bcNum] || "five";

  const finalPreamble = (
    preambleTemplate?.trim() ? preambleTemplate : DEFAULT_PREAMBLE_TEMPLATE
  )
    .replace("${bulletWord}", word)
    .replace("US English", targetLanguage); // Use targetLanguage here

  const finalFormatInstructions = customFormatInstructions?.trim()
    ? customFormatInstructions
    : defaultFormatInstructions?.trim()
      ? defaultFormatInstructions
      : DEFAULT_FORMAT_INSTRUCTIONS;
  const finalPostamble = postambleText?.trim()
    ? postambleText
    : DEFAULT_POSTAMBLE_TEXT;

  return `${finalPreamble}\n${finalFormatInstructions}\n${finalPostamble}`;
}
