import {
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_POSTAMBLE_TEXT,
  DEFAULT_FORMAT_INSTRUCTIONS,
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
} from "./constants.js";

console.log(`[LLM Background] Service Worker Start (v2.40.11)`);

let DEBUG = false;
const DEFAULT_BULLET_COUNT = "5";
const DEFAULT_DEBUG_MODE = false;

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
            : (() => {
                console.error(
                  "[LLM Background] language_info is not an array:",
                  data.language_info,
                );
                throw new Error("language_info must be an array.");
              })(),
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
      return true; // Ensure this is returned if needed for async
    } else if (request.action === "getChatContext") {
      if (DEBUG)
        console.log("[LLM Background] Handling getChatContext request.");
      chrome.storage.sync.get(["models"], (syncData) => {
        if (DEBUG)
          console.log("[LLM Background] Sync data for models:", syncData);
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
          if (DEBUG)
            console.log(
              "[LLM Background] Sending getChatContext response - OK.",
            );
          sendResponse({
            domSnippet: storedContext.domSnippet,
            summary: storedContext.summary,
            chatTargetLanguage: storedContext.chatTargetLanguage || "",
            models: modelsToSend,
            debug: DEBUG,
          });
        });
      });
      return true;
    } else if (request.action === "getLanguageData") {
      if (DEBUG)
        console.log("[LLM Background] Handling getLanguageData request.");
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
    } else if (request.action === "llmChatStream") {
      if (DEBUG)
        console.log(
          "[LLM Background] Handling llmChatStream request with messages:",
          request.messages.length,
          "messages.",
        );
      chrome.storage.sync.get(["apiKey", "models"], (storageResult) => {
        if (DEBUG)
          console.log("[LLM Background] Retrieved from storage for chat:", {
            apiKey: storageResult.apiKey ? "[API Key Hidden]" : "undefined",
            models: storageResult.models,
          });
        const apiKey = storageResult.apiKey;
        const models = storageResult.models || DEFAULT_MODEL_OPTIONS;
        const modelIds = models.map((m) => m.id);

        // Validate apiKey
        if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
          console.error(
            "[LLM Background] API key is missing or invalid in storage.",
          );
          if (DEBUG)
            console.log(
              "[LLM Background] Sending llmChatStream response - ERROR: API key missing.",
            );
          sendResponse({
            status: "error",
            message: "API key is required and must be a non-empty string.",
          });
          return;
        }
        // Validate model
        if (
          !request.model ||
          typeof request.model !== "string" ||
          request.model.trim() === "" ||
          !modelIds.includes(request.model)
        ) {
          console.error(
            "[LLM Background] Model is missing, invalid, or not in configured list for chat request.",
          );
          if (DEBUG)
            console.log(
              "[LLM Background] Sending llmChatStream response - ERROR: Model invalid.",
            );
          sendResponse({
            status: "error",
            message:
              "A valid model ID must be provided and must be in the configured list.",
          });
          return;
        }

        const controller = new AbortController();
        const signal = controller.signal;
        // Store the controller for potential abort
        chrome.storage.session.set({ abortController: controller }, () => {
          if (DEBUG)
            console.log(
              "[LLM Background] AbortController stored for potential abort.",
            );
        });
        const payload = {
          model: request.model,
          messages: request.messages,
          structured_outputs: "true",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "list_of_strings",
              strict: true,
              schema: {
                type: "array",
                items: {
                  type: "string",
                },
                minItems: 1,
                maxItems: 9,
              },
            },
          },
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
          .then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            if (DEBUG)
              console.log(
                "[LLM Background] Fetch response data for chat:",
                data,
              );
            try {
              if (DEBUG)
                console.log(
                  "[LLM Background] Sending llmChatStream response - OK.",
                );
              sendResponse({ status: "success", data });
            } catch (e) {
              if (DEBUG)
                console.warn(
                  "[LLM Background] Failed to send response, receiving end may no longer exist:",
                  e.message,
                );
            }
            // Clear the controller after successful response
            chrome.storage.session.remove("abortController", () => {
              if (DEBUG)
                console.log(
                  "[LLM Background] AbortController cleared after successful response.",
                );
            });
          })
          .catch((error) => {
            if (DEBUG)
              console.error("[LLM Background] Error in fetch for chat:", error);
            try {
              if (DEBUG)
                console.log(
                  "[LLM Background] Sending llmChatStream response - ERROR: Fetch failed.",
                );
              sendResponse({ status: "error", message: error.message });
            } catch (e) {
              if (DEBUG)
                console.warn(
                  "[LLM Background] Failed to send error response, receiving end may no longer exist:",
                  e.message,
                );
            }
            // Clear the controller on error
            chrome.storage.session.remove("abortController", () => {
              if (DEBUG)
                console.log(
                  "[LLM Background] AbortController cleared after error.",
                );
            });
          });
      });
      if (DEBUG)
        console.log("[LLM Background] llmChatStream processing initiated.");
      return true;
    } else if (request.action === "abortChatRequest") {
      if (DEBUG) console.log("[LLM Background] Handling abortChatRequest.");
      chrome.storage.session.get("abortController", (data) => {
        const controller = data.abortController;
        if (controller) {
          controller.abort();
          if (DEBUG)
            console.log("[LLM Background] AbortController triggered abort.");
          chrome.storage.session.remove("abortController", () => {
            if (DEBUG)
              console.log(
                "[LLM Background] AbortController cleared after abort.",
              );
          });
          try {
            if (DEBUG)
              console.log(
                "[LLM Background] Sending abortChatRequest response - OK.",
              );
            sendResponse({ status: "aborted" });
          } catch (e) {
            if (DEBUG)
              console.warn(
                "[LLM Background] Failed to send abort response, receiving end may no longer exist:",
                e.message,
              );
          }
        } else {
          if (DEBUG)
            console.log("[LLM Background] No active request to abort.");
          try {
            if (DEBUG)
              console.log(
                "[LLM Background] Sending abortChatRequest response - ERROR: No active request.",
              );
            sendResponse({ status: "no active request" });
          } catch (e) {
            if (DEBUG)
              console.warn(
                "[LLM Background] Failed to send no active request response, receiving end may no longer exist:",
                e.message,
              );
          }
        }
      });
      return true;
    } else if (request.action === "setChatContext") {
      if (DEBUG)
        console.log("[LLM Background] Handling setChatContext request.");
      chrome.storage.session.set({ chatContext: request }, () => {
        if (DEBUG)
          console.log("[LLM Background] Chat context set in session storage.");
        try {
          if (DEBUG)
            console.log(
              "[LLM Background] Sending setChatContext response - OK.",
            );
          sendResponse({ status: "ok" });
        } catch (e) {
          if (DEBUG)
            console.warn(
              "[LLM Background] Failed to send setChatContext response, receiving end may no longer exist:",
              e.message,
            );
        }
      });
      return true;
    } else if (request.action === "openChatTab") {
      if (DEBUG) console.log("[LLM Background] Handling openChatTab request.");
      chrome.tabs.create(
        { url: chrome.runtime.getURL("chat.html") },
        (newTab) => {
          if (DEBUG)
            console.log("[LLM Background] Chat tab opened:", newTab.id);
          try {
            if (DEBUG)
              console.log(
                "[LLM Background] Sending openChatTab response - OK.",
              );
            sendResponse({ status: "opened", tabId: newTab.id });
          } catch (e) {
            if (DEBUG)
              console.warn(
                "[LLM Background] Failed to send openChatTab response, receiving end may no longer exist:",
                e.message,
              );
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
        if (DEBUG)
          console.log(
            "[LLM Background] Sending openOptionsPage response - OK.",
          );
        sendResponse({ status: "options page opened" });
      } catch (e) {
        if (DEBUG)
          console.warn(
            "[LLM Background] Failed to send openOptionsPage response, receiving end may no longer exist:",
            e.message,
          );
      }
    } else if (request.action === "requestSummary") {
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
          if (DEBUG)
            console.log(
              "[LLM Background] Retrieved settings for summary request:",
              {
                ...data,
                apiKey: data.apiKey ? "[API Key Hidden]" : "undefined",
              },
            );
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
              "[LLM Background] API key is missing or invalid for summary request.",
            );
            chrome.tabs
              .sendMessage(sender.tab?.id, {
                action: "summaryResult",
                requestId: request.requestId,
                error: "API key is required and must be a non-empty string.",
              })
              .catch((e) => {
                if (DEBUG)
                  console.warn(
                    "[LLM Background] Failed to send summary error response, tab may no longer exist:",
                    e.message,
                  );
              });
            if (DEBUG)
              console.log(
                "[LLM Background] Sending requestSummary response - ERROR: API key missing.",
              );
            sendResponse({
              status: "error",
              message: "API key missing or invalid.",
            });
            return;
          }
          // Validate model
          if (
            !model ||
            typeof model !== "string" ||
            model.trim() === "" ||
            !modelIds.includes(model)
          ) {
            console.error(
              "[LLM Background] Model is missing, invalid, or not in configured list for summary request.",
            );
            chrome.tabs
              .sendMessage(sender.tab?.id, {
                action: "summaryResult",
                requestId: request.requestId,
                error: "Default Model is not selected or is invalid.",
              })
              .catch((e) => {
                if (DEBUG)
                  console.warn(
                    "[LLM Background] Failed to send summary error response, tab may no longer exist:",
                    e.message,
                  );
              });
            if (DEBUG)
              console.log(
                "[LLM Background] Sending requestSummary response - ERROR: Model invalid.",
              );
            sendResponse({
              status: "error",
              message: "Model not selected or invalid.",
            });
            return;
          }

          const bulletCount = parseInt(
            data.bulletCount || DEFAULT_BULLET_COUNT,
            10,
          );
          // Use the first language from language_info as the target language for summary
          const targetLanguageForSummary =
            language_info.length > 0 && language_info[0].language_name
              ? language_info[0].language_name
              : "English";

          const systemPrompt = getSystemPrompt(
            bulletCount,
            data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] ||
              data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] ||
              DEFAULT_FORMAT_INSTRUCTIONS,
            data[PROMPT_STORAGE_KEY_PREAMBLE] || DEFAULT_PREAMBLE_TEMPLATE,
            data[PROMPT_STORAGE_KEY_POSTAMBLE] || DEFAULT_POSTAMBLE_TEXT,
            data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] ||
              DEFAULT_FORMAT_INSTRUCTIONS,
            targetLanguageForSummary,
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
                  items: {
                    type: "string",
                  },
                  minItems: 3, // Fixed minimum for summaries
                  maxItems: bulletCount + 1, // User setting plus buffer of 1
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
            .then((response) => {
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              return response.json();
            })
            .then((data) => {
              if (DEBUG)
                console.log(
                  "[LLM Background] Fetch response data for summary:",
                  data,
                );
              const modelOutput = data.choices?.[0]?.message?.content?.trim();
              if (!modelOutput) {
                throw new Error("No response content received from LLM.");
              }
              // Prepare the complete response to send back to the content script
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
              // Send the result back to the requesting tab with language_info
              if (sender.tab?.id) {
                chrome.tabs.sendMessage(sender.tab.id, completeResponse, (response) => {
                  if (chrome.runtime.lastError) {
                    if (DEBUG)
                      console.warn(
                        "[LLM Background] Failed to send summary response, tab may no longer exist:",
                        chrome.runtime.lastError.message,
                      );
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
                fullResponse: DEBUG ? data : "[Debug data omitted for brevity]",
              };
              if (DEBUG)
                console.log(
                  "[LLM Background] Complete error response being sent to content script:",
                  errorResponse,
                );
              if (sender.tab?.id) {
                chrome.tabs.sendMessage(sender.tab.id, errorResponse, (response) => {
                  if (chrome.runtime.lastError) {
                    if (DEBUG)
                      console.warn(
                        "[LLM Background] Failed to send summary error response, tab may no longer exist:",
                        chrome.runtime.lastError.message,
                      );
                  }
                });
              } else {
                if (DEBUG)
                  console.warn(
                    "[LLM Background] No tab ID available to send summary error response.",
                  );
              }
            });
          if (DEBUG)
            console.log(
              "[LLM Background] Sending requestSummary response - OK.",
            );
          sendResponse({ status: "processing" });
        },
      );
      return true;
    } else if (request.action === "healthCheck") {
      if (DEBUG) console.log("[LLM Background] Handling healthCheck request.");
      chrome.storage.sync.get(["apiKey", "model", "models"], (data) => {
        const apiKey = data.apiKey;
        const model = data.model;
        const models = data.models || DEFAULT_MODEL_OPTIONS;
        const modelIds = models.map((m) => m.id);

        if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
          if (DEBUG)
            console.log(
              "[LLM Background] Sending healthCheck response - ERROR: API key missing.",
            );
          sendResponse({
            status: "error",
            message: "API key is not configured.",
          });
          return;
        }
        if (
          !model ||
          typeof model !== "string" ||
          model.trim() === "" ||
          !modelIds.includes(model)
        ) {
          if (DEBUG)
            console.log(
              "[LLM Background] Sending healthCheck response - ERROR: Model not selected or invalid.",
            );
          sendResponse({
            status: "error",
            message: "Default model is not selected or is invalid.",
          });
          return;
        }
        if (DEBUG)
          console.log("[LLM Background] Sending healthCheck response - OK.");
        sendResponse({ status: "ok" });
      });
      return true;
    }
    if (DEBUG)
      console.log(
        "[LLM Background] Message handler completed for action:",
        request.action,
      );
  });
  return true;
});

// --- Prompt Assembly Function (Copied from pageInteraction.js for use in summary requests) ---
const numToWord = {
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
};

function getSystemPrompt(
  bulletCount,
  customFormatInstructions,
  preambleTemplate,
  postambleText,
  defaultFormatInstructions,
  targetLanguage,
) {
  const bcNum = Number(bulletCount) || 5;
  const word = numToWord[bcNum] || "five";

  // Use provided values or fall back to defaults from constants
  const finalPreamble = (
    preambleTemplate?.trim() ? preambleTemplate : DEFAULT_PREAMBLE_TEMPLATE
  )
    .replace("${bulletWord}", word)
    .replace("US English", targetLanguage);
  // Use custom instructions from config, fallback to default instructions from config, fallback to hardcoded default
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
