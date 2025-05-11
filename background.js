// background.js
import {
  DEFAULT_MODEL_OPTIONS, // Now contains {id: string} only
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_POSTAMBLE_TEXT,
  DEFAULT_FORMAT_INSTRUCTIONS,
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  CHAT_SYSTEM_PROMPT_TEMPLATE,
  CHAT_USER_CONTEXT_TEMPLATE,
  // Constants for new storage keys
  STORAGE_KEY_SUMMARY_MODEL_ID,
  STORAGE_KEY_CHAT_MODEL_ID,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_DEBUG,
  STORAGE_KEY_BULLET_COUNT,
  STORAGE_KEY_LANGUAGE_INFO,
  STORAGE_KEY_MAX_REQUEST_PRICE,
  STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
} from "./constants.js";

console.log(
  `[LLM Background] Service Worker Start (v3.4.4 - Direct Markdown Chat)`,
); // Updated version

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

// Initial debug state load
chrome.storage.sync.get(STORAGE_KEY_DEBUG, (data) => {
  DEBUG = !!data[STORAGE_KEY_DEBUG];
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
    contexts: ["all"],
  });
  // Check API key on install/update
  chrome.storage.sync.get([STORAGE_KEY_API_KEY, STORAGE_KEY_DEBUG], (data) => {
    DEBUG = !!data[STORAGE_KEY_DEBUG];
    if (!data[STORAGE_KEY_API_KEY]) {
      chrome.runtime.openOptionsPage();
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sendToLLM" && tab?.id) {
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

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Update DEBUG state on each message (in case it changed)
  chrome.storage.sync.get(STORAGE_KEY_DEBUG, (result) => {
    DEBUG = !!result[STORAGE_KEY_DEBUG];
    if (DEBUG)
      console.log(
        "[LLM Background] Received message:",
        request.action,
        "from sender:",
        sender,
      );

    // --- getSettings Handler (Updated for Max Request Price) ---
    if (request.action === "getSettings") {
      if (DEBUG) console.log("[LLM Background] Handling getSettings request.");
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
        STORAGE_KEY_MAX_REQUEST_PRICE,
      ];
      chrome.storage.sync.get(keysToFetch, (data) => {
        if (DEBUG)
          console.log("[LLM Background] Storage data retrieved:", {
            ...data,
            [STORAGE_KEY_API_KEY]: data[STORAGE_KEY_API_KEY]
              ? "[API Key Hidden]"
              : undefined,
          });

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
          if (DEBUG)
            console.warn(
              "[LLM Background] Loaded models data is invalid, using defaults.",
            );
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
          if (DEBUG && data[STORAGE_KEY_SUMMARY_MODEL_ID])
            console.warn(
              `[LLM Background] Stored summaryModelId "${data[STORAGE_KEY_SUMMARY_MODEL_ID]}" invalid, defaulting to "${finalSummaryModelId}".`,
            );
        }

        if (
          data[STORAGE_KEY_CHAT_MODEL_ID] &&
          availableModelIds.includes(data[STORAGE_KEY_CHAT_MODEL_ID])
        ) {
          finalChatModelId = data[STORAGE_KEY_CHAT_MODEL_ID];
        } else if (availableModelIds.length > 0) {
          finalChatModelId = availableModelIds[0];
          if (DEBUG && data[STORAGE_KEY_CHAT_MODEL_ID])
            console.warn(
              `[LLM Background] Stored chatModelId "${data[STORAGE_KEY_CHAT_MODEL_ID]}" invalid, defaulting to "${finalChatModelId}".`,
            );
        }

        const settings = {
          apiKey: data[STORAGE_KEY_API_KEY] || "",
          models: loadedModels,
          summaryModelId: finalSummaryModelId,
          chatModelId: finalChatModelId,
          debug: DEBUG,
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
        if (DEBUG)
          console.log("[LLM Background] Sending settings response - OK.", {
            ...settings,
            apiKey: settings.apiKey ? "[Hidden]" : "",
          });
        sendResponse(settings);
      });
      return true;
    }

    // --- getChatContext Handler (Unchanged) ---
    else if (request.action === "getChatContext") {
      if (DEBUG)
        console.log("[LLM Background] Handling getChatContext request.");
      chrome.storage.sync.get(
        [STORAGE_KEY_MODELS, STORAGE_KEY_LANGUAGE_INFO],
        (syncData) => {
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
              if (DEBUG)
                console.warn(
                  "[LLM Background] Loaded models data for chat context is invalid, using defaults.",
                );
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
              debug: DEBUG,
            };
            if (DEBUG)
              console.log(
                "[LLM Background] Sending getChatContext response - OK.",
                responsePayload,
              );
            sendResponse(responsePayload);
          });
        },
      );
      return true;
    }
    // --- getModelPricing Handler for Fetching Model Pricing Data for a Single Model ---
    else if (request.action === "getModelPricing") {
      if (DEBUG)
        console.log(
          "[LLM Background] Handling getModelPricing request for model:",
          request.modelId,
        );
      if (
        !request.modelId ||
        typeof request.modelId !== "string" ||
        request.modelId.trim() === ""
      ) {
        if (DEBUG)
          console.log(
            "[LLM Background] Invalid model ID provided for pricing request.",
          );
        sendResponse({
          status: "error",
          message: "Invalid model ID provided.",
        });
        return true;
      }

      chrome.storage.local.get([STORAGE_KEY_KNOWN_MODELS_AND_PRICES], (cacheData) => {
        const knownModelsAndPrices = cacheData[STORAGE_KEY_KNOWN_MODELS_AND_PRICES] || {};
        const cachedEntry = knownModelsAndPrices[request.modelId];
        const currentTime = Date.now();
        const cacheExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days expiry

        if (
          cachedEntry &&
          currentTime - cachedEntry.timestamp < cacheExpiry
        ) {
          if (DEBUG)
            console.log(
              "[LLM Background] Using cached pricing data for model:",
              request.modelId,
              { pricePerToken: cachedEntry.pricePerToken },
            );
          sendResponse({
            status: "success",
            pricePerToken: cachedEntry.pricePerToken,
          });
        } else {
          if (DEBUG)
            console.log(
              "[LLM Background] No valid cached data found or expired for model:",
              request.modelId,
            );
          sendResponse({
            status: "error",
            message: "Pricing data not available or expired. Please update model data.",
          });
        }
      });
      return true;
    }
    // --- updateKnownModelsAndPricing Handler for Fetching Models with Pricing Data ---
    else if (request.action === "updateKnownModelsAndPricing") {
      if (DEBUG)
        console.log(
          "[LLM Background] Handling updateKnownModelsAndPricing request for all models.",
        );

      chrome.storage.sync.get([STORAGE_KEY_API_KEY], (data) => {
        const apiKey = data[STORAGE_KEY_API_KEY];
        if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
          if (DEBUG)
            console.log(
              "[LLM Background] API key missing for model and pricing request.",
            );
          sendResponse({
            status: "error",
            message: "API key required for model and pricing data.",
          });
          return;
        }

        const apiUrl = `https://openrouter.ai/api/v1/models`;
        if (DEBUG)
          console.log(
            "[LLM Background] Fetching model and pricing data from:",
            apiUrl,
          );

        fetch(apiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
            "X-Title": "OR-Summ",
          },
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            if (DEBUG)
              console.log(
                "[LLM Background] Full Model and Pricing Response Data received.",
              );

            const currentTime = Date.now();
            const knownModelsAndPrices = {};
            let updatedCount = 0;

            data.data.forEach((model) => {
              const pricePerToken = model.pricing?.prompt || 0;
              knownModelsAndPrices[model.id] = {
                id: model.id,
                name: model.name || model.id,
                pricePerToken: pricePerToken,
                timestamp: currentTime,
              };
              updatedCount++;
            });

            chrome.storage.local.set(
              { [STORAGE_KEY_KNOWN_MODELS_AND_PRICES]: knownModelsAndPrices },
              () => {
                if (DEBUG)
                  console.log(
                    `[LLM Background] Updated known models and pricing for ${updatedCount} models.`,
                  );
                sendResponse({
                  status: "success",
                  updated: updatedCount,
                });
              },
            );
          })
          .catch((error) => {
            if (DEBUG)
              console.error(
                "[LLM Background] Error fetching model and pricing data:",
                error,
              );
            sendResponse({ status: "error", message: error.message });
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
              `[LLM Background] Invalid or unavailable model requested for chat: "${request.model}". Available:`,
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
          chrome.storage.session.set({ abortController: controller });

          const payload = {
            model: request.model,
            messages: request.messages,
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
              if (DEBUG)
                console.log(
                  "[LLM Background] Received raw chat response data:",
                  data,
                );

              // Check for API-level error first
              if (data && data.error && data.error.code && data.error.message) {
                const errorMsg = `ERROR: ${data.error.code} ${data.error.message}`;
                console.error(
                  "[LLM Background] API returned an error:",
                  data.error,
                );
                try {
                  sendResponse({ status: "error", message: errorMsg });
                } catch (e) {
                  if (DEBUG)
                    console.warn(
                      "Failed to send API error response:",
                      e.message,
                    );
                }
                chrome.storage.session.remove("abortController");
                return;
              }

              // Extract the direct content string
              const directContent =
                data?.choices?.[0]?.message?.content?.trim();

              if (directContent !== undefined && directContent !== null) {
                if (DEBUG)
                  console.log(
                    "[LLM Background] Extracted direct content:",
                    directContent.substring(0, 100) + "...",
                  );
                // Send back the direct content string
                try {
                  sendResponse({ status: "success", content: directContent });
                } catch (e) {
                  if (DEBUG)
                    console.warn(
                      "Failed to send chat success response:",
                      e.message,
                    );
                }
              } else {
                // Handle cases where content is missing even if API call succeeded
                console.error(
                  "[LLM Background] API success but no content found in response:",
                  data,
                );
                try {
                  sendResponse({
                    status: "error",
                    message: "API success but no content received.",
                  });
                } catch (e) {
                  if (DEBUG)
                    console.warn(
                      "Failed to send no-content error response:",
                      e.message,
                    );
                }
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
                  console.warn(
                    "Failed to send fetch/network error response:",
                    e.message,
                  );
              }
              chrome.storage.session.remove("abortController");
            });
        },
      );
      return true;
    }

    // --- abortChatRequest Handler (Unchanged) ---
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

    // --- setChatContext Handler (Unchanged) ---
    else if (request.action === "setChatContext") {
      if (DEBUG)
        console.log("[LLM Background] Handling setChatContext request.");
      const contextToSave = {
        domSnippet: request.domSnippet,
        summary: request.summary,
        chatTargetLanguage: request.chatTargetLanguage,
        modelUsedForSummary: request.modelUsedForSummary,
      };
      chrome.storage.session.set({ chatContext: contextToSave }, () => {
        if (DEBUG)
          console.log(
            "[LLM Background] Chat context set in session storage:",
            contextToSave,
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

    // --- openChatTab Handler (Unchanged) ---
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
    } else if (request.action === "openOptionsPage") {
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
    } else if (request.action === "requestSummary") {
      if (DEBUG)
        console.log(
          "[LLM Background] Handling requestSummary for ID:",
          request.requestId,
        );
      chrome.storage.sync.get(
        [
          STORAGE_KEY_API_KEY,
          STORAGE_KEY_SUMMARY_MODEL_ID,
          STORAGE_KEY_BULLET_COUNT,
          STORAGE_KEY_LANGUAGE_INFO,
          PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
          PROMPT_STORAGE_KEY_PREAMBLE,
          PROMPT_STORAGE_KEY_POSTAMBLE,
          PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
          STORAGE_KEY_MODELS,
        ],
        (data) => {
          if (DEBUG)
            console.log(
              "[LLM Background] Data retrieved for summary request:",
              {
                ...data,
                [STORAGE_KEY_API_KEY]: data[STORAGE_KEY_API_KEY]
                  ? "[API Key Hidden]"
                  : "undefined",
              },
            );

          const apiKey = data[STORAGE_KEY_API_KEY];
          const summaryModelId = data[STORAGE_KEY_SUMMARY_MODEL_ID];
          const language_info = Array.isArray(data[STORAGE_KEY_LANGUAGE_INFO])
            ? data[STORAGE_KEY_LANGUAGE_INFO]
            : [];
          let models = DEFAULT_MODEL_OPTIONS;
          if (
            Array.isArray(data[STORAGE_KEY_MODELS]) &&
            data[STORAGE_KEY_MODELS].length > 0 &&
            data[STORAGE_KEY_MODELS].every(
              (m) =>
                typeof m === "object" && m !== null && typeof m.id === "string",
            )
          ) {
            models = data[STORAGE_KEY_MODELS].map((m) => ({ id: m.id }));
          }
          const modelIds = models.map((m) => m.id);

          if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
            console.error(
              "[LLM Background] API key is missing or invalid for summary request.",
            );
            const errorMsg =
              "API key is required and must be a non-empty string.";
            sendResponse({ status: "error", message: errorMsg });
            if (sender.tab?.id) {
              chrome.tabs.sendMessage(
                sender.tab.id,
                {
                  action: "summaryResult",
                  requestId: request.requestId,
                  error: errorMsg,
                },
                () => {
                  if (
                    chrome.runtime.lastError &&
                    DEBUG &&
                    !isTabClosedError(chrome.runtime.lastError)
                  )
                    console.error(
                      `[LLM Background] Error sending API key error to tab ${sender.tab.id}: ${chrome.runtime.lastError.message}`,
                    );
                },
              );
            }
            return;
          }
          if (
            !summaryModelId ||
            typeof summaryModelId !== "string" ||
            summaryModelId.trim() === "" ||
            !modelIds.includes(summaryModelId)
          ) {
            console.error(
              `[LLM Background] Default summary model is missing, invalid, or not in configured list. Value: "${summaryModelId}". Available:`,
              modelIds,
            );
            const errorMsg = `Default Summary Model ("${summaryModelId || "None"}") is not selected or is invalid.`;
            sendResponse({ status: "error", message: errorMsg });
            if (sender.tab?.id) {
              chrome.tabs.sendMessage(
                sender.tab.id,
                {
                  action: "summaryResult",
                  requestId: request.requestId,
                  error: errorMsg,
                },
                () => {
                  if (
                    chrome.runtime.lastError &&
                    DEBUG &&
                    !isTabClosedError(chrome.runtime.lastError)
                  )
                    console.error(
                      `[LLM Background] Error sending model error to tab ${sender.tab.id}: ${chrome.runtime.lastError.message}`,
                    );
                },
              );
            }
            return;
          }

          const bulletCount = parseInt(
            data[STORAGE_KEY_BULLET_COUNT] || DEFAULT_BULLET_COUNT,
            10,
          );
          const systemPrompt = getSystemPrompt(
            bulletCount,
            data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] ||
              data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] ||
              DEFAULT_FORMAT_INSTRUCTIONS,
            data[PROMPT_STORAGE_KEY_PREAMBLE] || DEFAULT_PREAMBLE_TEMPLATE,
            data[PROMPT_STORAGE_KEY_POSTAMBLE] || DEFAULT_POSTAMBLE_TEXT,
            data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] ||
              DEFAULT_FORMAT_INSTRUCTIONS,
          );

          // Summary still uses structured output
          const payload = {
            model: summaryModelId,
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
            provider: {
              ignore: ["Chutes"], // Is doesn't respect JSON schema requests.
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
                : response.text().then((text) => {
                    throw new Error(
                      `HTTP error! status: ${response.status} - ${text}`,
                    );
                  }),
            )
            .then((data) => {
              if (DEBUG)
                console.log(
                  "[LLM Background] Received raw summary response data:",
                  data,
                );

              if (data && data.error && data.error.code && data.error.message) {
                const errorMsg = `ERROR: ${data.error.code} ${data.error.message}`;
                console.error(
                  "[LLM Background] API returned an error during summary:",
                  data.error,
                );
                if (sender.tab?.id) {
                  chrome.tabs.sendMessage(
                    sender.tab.id,
                    {
                      action: "summaryResult",
                      requestId: request.requestId,
                      error: errorMsg,
                      language_info: language_info,
                    },
                    () => {
                      if (
                        chrome.runtime.lastError &&
                        DEBUG &&
                        !isTabClosedError(chrome.runtime.lastError)
                      )
                        console.error(
                          `[LLM Background] Error sending API error (summary) to tab ${sender.tab.id}: ${chrome.runtime.lastError.message}`,
                        );
                    },
                  );
                }
                return;
              }

              const modelOutput = data.choices?.[0]?.message?.content?.trim();
              if (!modelOutput) {
                throw new Error("No response content received from LLM.");
              }

              let summaryContent = modelOutput;
              let processedStrings = [];
              // Attempt to parse as JSON, if it fails, extract strings manually
              try {
                const parsedJson = JSON.parse(modelOutput);
                if (Array.isArray(parsedJson)) {
                  processedStrings = normalizeMarkdownInStrings(parsedJson);
                  summaryContent = JSON.stringify(processedStrings); // Use normalized strings
                  if (DEBUG)
                    console.log(
                      "[LLM Background] Response is valid JSON array, normalized markdown.",
                      processedStrings
                    );
                } else {
                  throw new Error("Response is not an array.");
                }
              } catch (parseError) {
                if (DEBUG)
                  console.log(
                    "[LLM Background] JSON parse failed, attempting manual extraction:",
                    parseError.message,
                  );
                // Fallback: Extract strings from malformed JSON
                const extractedStrings = extractStringsFromMalformedJson(modelOutput);
                if (extractedStrings.length > 0) {
                  processedStrings = normalizeMarkdownInStrings(extractedStrings);
                  summaryContent = JSON.stringify(processedStrings);
                  if (DEBUG)
                    console.log(
                      "[LLM Background] Extracted strings from malformed JSON, normalized markdown:",
                      processedStrings,
                    );
                } else {
                  if (DEBUG)
                    console.log(
                      "[LLM Background] No strings extracted, using raw output as fallback.",
                    );
                  processedStrings = normalizeMarkdownInStrings([modelOutput]);
                  summaryContent = JSON.stringify(processedStrings); // Wrap raw output as a single-item array
                }
              }

              const completeResponse = {
                action: "summaryResult",
                requestId: request.requestId,
                summary: summaryContent,
                model: data.model || data.model_id || summaryModelId,
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
                      if (DEBUG)
                        console.log(
                          `[LLM Background] Tab ${sender.tab.id} closed before summary response could be sent.`,
                          chrome.runtime.lastError.message,
                        );
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
                      if (DEBUG)
                        console.log(
                          `[LLM Background] Tab ${sender.tab.id} closed before summary error response could be sent.`,
                          chrome.runtime.lastError.message,
                        );
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

          if (DEBUG)
            console.log(
              "[LLM Background] Sending requestSummary response - OK (processing).",
            );
          sendResponse({ status: "processing" });
        },
      );
      return true;
    }

    // --- Default Handler for Unrecognized Actions ---
    if (DEBUG)
      console.log(
        "[LLM Background] Message handler completed for action:",
        request.action,
        "- No specific handler matched.",
      );
    try {
      sendResponse({ status: "unhandled", action: request.action });
    } catch (e) {
      if (DEBUG)
        console.warn(
          `[LLM Background] Failed to send default response for unhandled action "${request.action}":`,
          e.message,
        );
    }
    return false;
  }); // End storage.sync.get for DEBUG check
  return true; // Keep message listener active for async responses
}); // End chrome.runtime.onMessage.addListener

// --- Function to Extract Strings from Malformed JSON ---
function extractStringsFromMalformedJson(rawText) {
  // Spec: Extracts strings from a potentially malformed JSON response.
  // Arguments: rawText (string) - The raw response text from the LLM.
  // Returns: Array<string> - An array of extracted strings representing bullet points.
  // Called from: requestSummary handler in background.js when JSON parsing fails.
  // Dependencies: None.
  // State changes: None.
  // Error handling: Returns empty array if no strings are found.
  // Side effects: Logs extraction attempts if DEBUG is enabled.

  if (!rawText || typeof rawText !== 'string') {
    if (DEBUG) console.log("[LLM Background] Invalid input for extraction, returning empty array.");
    return [];
  }

  // Split the text into lines and filter out empty or irrelevant lines
  const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const extracted = [];

  for (let line of lines) {
    // Look for lines that start with a quote or potential bullet marker
    if (line.startsWith('"') || line.startsWith('*') || line.startsWith('-') || line.startsWith('**')) {
      // Remove leading/trailing quotes and commas
      line = line.replace(/^"|"$/g, '').replace(/,$/, '').trim();
      if (line.length > 0) {
        // Only add if there's actual content after cleaning
        extracted.push(line);
      }
    }
  }

  if (DEBUG && extracted.length === 0) {
    console.log("[LLM Background] No valid strings extracted from response.");
  }
  return extracted;
}

// --- Function to Normalize Markdown in Strings ---
function normalizeMarkdownInStrings(strings) {
  // Spec: Normalizes markdown syntax in an array of strings to ensure consistent rendering.
  // Arguments: strings (Array<string>) - Array of strings from JSON or extracted content.
  // Returns: Array<string> - Array of strings with normalized markdown.
  // Called from: requestSummary handler in background.js after JSON parsing or extraction.
  // Dependencies: None.
  // State changes: None.
  // Error handling: Returns unchanged strings if no normalization needed.
  // Side effects: Logs normalization changes if DEBUG is enabled.

  if (!Array.isArray(strings)) {
    if (DEBUG) console.log("[LLM Background] Invalid input for markdown normalization, returning empty array.");
    return [];
  }

  const normalized = strings.map((str, index) => {
    if (typeof str !== 'string' || str.trim() === '') {
      return str; // Skip non-string or empty entries
    }

    let normalizedStr = str.trim();
    
    // Normalize bold markdown at the start of bullet points or around common headers
    // Replace single or triple asterisks with double asterisks for bold
    // Target patterns like "*Text:*" or "***Text:**" at the start or within common bullet structures
    if (normalizedStr.match(/^(\*|\*{3})([A-Za-z\s][^:]*:)/)) {
      normalizedStr = normalizedStr.replace(/^(\*|\*{3})/, '**');
      if (DEBUG) console.log(`[LLM Background] Normalized markdown bold at start for string ${index}: "${normalizedStr.substring(0, 50)}..."`);
    } else if (normalizedStr.match(/^(\*|\*{3})(Summarizer\s+Insight:)/i)) {
      normalizedStr = normalizedStr.replace(/^(\*|\*{3})/, '**');
      if (DEBUG) console.log(`[LLM Background] Normalized markdown bold for Summarizer Insight in string ${index}: "${normalizedStr.substring(0, 50)}..."`);
    }

    // If no bold markdown is detected at the start, and it looks like a bullet point without proper formatting,
    // consider adding a default bold prefix if appropriate
    if (!normalizedStr.startsWith('**') && !normalizedStr.startsWith('- ') && !normalizedStr.startsWith('* ')) {
      if (normalizedStr.includes(':')) {
        const parts = normalizedStr.split(':', 2);
        if (parts[0].trim().length > 0 && parts[0].trim().length < 50) { // Reasonable length for a header
          normalizedStr = `**${parts[0].trim()}:** ${parts[1].trim()}`;
          if (DEBUG) console.log(`[LLM Background] Added default bold markdown for header in string ${index}: "${normalizedStr.substring(0, 50)}..."`);
        }
      }
    }

    return normalizedStr;
  });

  return normalized; // Return the array of normalized strings
}

// --- Prompt Assembly Function (Unchanged) ---
function getSystemPrompt(
  bulletCount,
  customFormatInstructions,
  preambleTemplate,
  postambleText,
  defaultFormatInstructions,
) {
  const bcNum = Number(bulletCount) || 5;
  const word = numToWord[bcNum] || "five";
  const finalPreamble = (
    preambleTemplate?.trim() ? preambleTemplate : DEFAULT_PREAMBLE_TEMPLATE
  ).replace("${bulletWord}", word);
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
