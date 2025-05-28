// js/summaryHandler.js
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_SUMMARY_MODEL_ID,
  STORAGE_KEY_BULLET_COUNT,
  STORAGE_KEY_LANGUAGE_INFO,
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  STORAGE_KEY_MODELS,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_BULLET_COUNT_NUM, // Use the correct constant for the number
  DEFAULT_FORMAT_INSTRUCTIONS, // Assuming this is also in constants.js
  DEFAULT_PREAMBLE_TEMPLATE, // Assuming this is also in constants.js
  DEFAULT_POSTAMBLE_TEXT, // Assuming this is also in constants.js
} from "../constants.js";

import {
  isTabClosedError,
  extractStringsFromMalformedJson,
  normalizeMarkdownInStrings,
  getSystemPrompt,
} from "./backgroundUtils.js"; // Utilities are now in a separate file

export function handleRequestSummary(request, sender, sendResponse, DEBUG = false) {
  if (DEBUG) {
    console.log(
      "[LLM Summary Handler] Handling requestSummary for ID:",
      request.requestId,
      "with hasNewsblurToken:",
      request.hasNewsblurToken, // Log the received token status
    );
  }
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
      if (DEBUG) {
        console.log(
          "[LLM Summary Handler] Data retrieved for summary request:",
          {
            ...data,
            [STORAGE_KEY_API_KEY]: data[STORAGE_KEY_API_KEY]
              ? "[API Key Hidden]"
              : "undefined",
          },
        );
      }

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

      // Extract hasNewsblurToken from the request (passed by pageInteraction.js)
      const hasNewsblurTokenStatus = request.hasNewsblurToken || false;

      if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
        console.error(
          "[LLM Summary Handler] API key is missing or invalid for summary request.",
        );
        const errorMsg =
          "API key is required and must be a non-empty string.";
        sendResponse({ status: "error", message: errorMsg }); // Send response to original caller
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(
            sender.tab.id,
            {
              action: "summaryResult",
              requestId: request.requestId,
              error: errorMsg,
              language_info: language_info,
              hasNewsblurToken: hasNewsblurTokenStatus, // Pass NewsBlur token status on error
            },
            () => {
              if (
                chrome.runtime.lastError &&
                DEBUG &&
                !isTabClosedError(chrome.runtime.lastError)
              ) {
                console.error(
                  `[LLM Summary Handler] Error sending API key error to tab ${sender.tab.id}: ${chrome.runtime.lastError.message}`,
                );
              }
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
          `[LLM Summary Handler] Default summary model is missing, invalid, or not in configured list. Value: "${summaryModelId}". Available:`,
          modelIds,
        );
        const errorMsg = `Default Summary Model ("${summaryModelId || "None"}") is not selected or is invalid.`;
        sendResponse({ status: "error", message: errorMsg }); // Send response to original caller
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(
            sender.tab.id,
            {
              action: "summaryResult",
              requestId: request.requestId,
              error: errorMsg,
              language_info: language_info,
              hasNewsblurToken: hasNewsblurTokenStatus, // Pass NewsBlur token status on error
            },
            () => {
              if (
                chrome.runtime.lastError &&
                DEBUG &&
                !isTabClosedError(chrome.runtime.lastError)
              ) {
                console.error(
                  `[LLM Summary Handler] Error sending model error to tab ${sender.tab.id}: ${chrome.runtime.lastError.message}`,
                );
              }
            },
          );
        }
        return;
      }

      const bulletCount = parseInt(
        data[STORAGE_KEY_BULLET_COUNT] || DEFAULT_BULLET_COUNT_NUM,
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
          ignore: ["Chutes"],
        },
      };

      if (DEBUG) {
        console.log(
          "[LLM Summary Handler] Sending payload to OpenRouter for summary:",
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
        .then((responseData) => { // Renamed 'data' to 'responseData' to avoid conflict
          if (DEBUG) {
            console.log(
              "[LLM Summary Handler] Received raw summary response data:",
              responseData,
            );
          }

          if (responseData && responseData.error && responseData.error.code && responseData.error.message) {
            const errorMsg = `ERROR: ${responseData.error.code} ${responseData.error.message}`;
            console.error(
              "[LLM Summary Handler] API returned an error during summary:",
              responseData.error,
            );
            if (sender.tab?.id) {
              chrome.tabs.sendMessage(
                sender.tab.id,
                {
                  action: "summaryResult",
                  requestId: request.requestId,
                  error: errorMsg,
                  language_info: language_info,
                  hasNewsblurToken: hasNewsblurTokenStatus, // Pass NewsBlur token status on API error
                },
                () => {
                  if (
                    chrome.runtime.lastError &&
                    DEBUG &&
                    !isTabClosedError(chrome.runtime.lastError)
                  ) {
                    console.error(
                      `[LLM Summary Handler] Error sending API error (summary) to tab ${sender.tab.id}: ${chrome.runtime.lastError.message}`,
                    );
                  }
                },
              );
            }
            return;
          }

          const modelOutput = responseData.choices?.[0]?.message?.content?.trim();
          if (!modelOutput) {
            throw new Error("No response content received from LLM.");
          }

          let summaryContent = modelOutput;
          let processedStrings = [];
          try {
            const parsedJson = JSON.parse(modelOutput);
            if (Array.isArray(parsedJson)) {
              processedStrings = normalizeMarkdownInStrings(parsedJson, DEBUG);
              summaryContent = JSON.stringify(processedStrings);
              if (DEBUG) {
                console.log(
                  "[LLM Summary Handler] Response is valid JSON array, normalized markdown.",
                  processedStrings,
                );
              }
            } else {
              throw new Error("Response is not an array.");
            }
          } catch (parseError) {
            if (DEBUG) {
              console.log(
                "[LLM Summary Handler] JSON parse failed, attempting manual extraction:",
                parseError.message,
              );
            }
            const extractedStrings = extractStringsFromMalformedJson(modelOutput, DEBUG);
            if (extractedStrings.length > 0) {
              processedStrings = normalizeMarkdownInStrings(extractedStrings, DEBUG);
              summaryContent = JSON.stringify(processedStrings);
              if (DEBUG) {
                console.log(
                  "[LLM Summary Handler] Extracted strings from malformed JSON, normalized markdown:",
                  processedStrings,
                );
              }
            } else {
              if (DEBUG) {
                console.log(
                  "[LLM Summary Handler] No strings extracted, using raw output as fallback.",
                );
              }
              processedStrings = normalizeMarkdownInStrings([modelOutput], DEBUG);
              summaryContent = JSON.stringify(processedStrings);
            }
          }

          const completeResponse = {
            action: "summaryResult",
            requestId: request.requestId,
            summary: summaryContent,
            model: responseData.model || responseData.model_id || summaryModelId,
            language_info: language_info,
            hasNewsblurToken: hasNewsblurTokenStatus, // Pass NewsBlur token status on success
            fullResponse: DEBUG ? responseData : "[Debug data omitted for brevity]",
          };
          if (DEBUG) {
            console.log(
              "[LLM Summary Handler] Complete response being sent to content script:",
              completeResponse,
            );
          }

          if (sender.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, completeResponse, () => {
              if (chrome.runtime.lastError) {
                if (isTabClosedError(chrome.runtime.lastError)) {
                  if (DEBUG) {
                    console.log(
                      `[LLM Summary Handler] Tab ${sender.tab.id} closed before summary response could be sent.`,
                      chrome.runtime.lastError.message,
                    );
                  }
                } else {
                  console.error(
                    `[LLM Summary Handler] Error sending summary response to tab ${sender.tab.id}:`,
                    chrome.runtime.lastError.message,
                  );
                }
              }
            });
          } else {
            if (DEBUG) {
              console.warn(
                "[LLM Summary Handler] No tab ID available to send summary response.",
              );
            }
          }
        })
        .catch((error) => {
          if (DEBUG) {
            console.error(
              "[LLM Summary Handler] Error in fetch for summary:",
              error,
            );
          }
          const errorResponse = {
            action: "summaryResult",
            requestId: request.requestId,
            error: error.message,
            language_info: language_info,
            hasNewsblurToken: hasNewsblurTokenStatus, // Pass Newsblur token status on error
            fullResponse: DEBUG
              ? { error: error.message }
              : "[Debug data omitted for brevity]",
          };
          if (DEBUG) {
            console.log(
              "[LLM Summary Handler] Complete error response being sent to content script:",
              errorResponse,
            );
          }

          if (sender.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, errorResponse, () => {
              if (chrome.runtime.lastError) {
                if (isTabClosedError(chrome.runtime.lastError)) {
                  if (DEBUG) {
                    console.log(
                      `[LLM Summary Handler] Tab ${sender.tab.id} closed before summary error response could be sent.`,
                      chrome.runtime.lastError.message,
                    );
                  }
                } else {
                  console.error(
                    `[LLM Summary Handler] Error sending summary error response to tab ${sender.tab.id}:`,
                    chrome.runtime.lastError.message,
                  );
                }
              }
            });
          } else {
            if (DEBUG) {
              console.warn(
                "[LLM Summary Handler] No tab ID available to send summary response.",
              );
            }
          }
        });

      if (DEBUG) {
        console.log(
          "[LLM Summary Handler] Sending requestSummary response - OK (processing).",
        );
      }
      // Send initial response to the original caller indicating processing has started
      sendResponse({ status: "processing" });
    },
  );
}