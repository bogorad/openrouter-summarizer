// js/summaryHandler.js
import {
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_SUMMARY_MODEL_ID,
  STORAGE_KEY_BULLET_COUNT,
  STORAGE_KEY_LANGUAGE_INFO,
  STORAGE_KEY_PROMPT_TEMPLATE,
  STORAGE_KEY_ALWAYS_USE_US_ENGLISH,
  STORAGE_KEY_MODELS,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_XML_PROMPT_TEMPLATE,
  OPENROUTER_API_URL,
  REQUEST_TIMEOUT,
  SUMMARY_MAX_CONTENT_SIZE,
  sanitizeLanguageCode,
  LANGUAGE_DETECTION_MODELS,
} from "../constants.js";

import { decryptSensitiveData } from "./encryption.js";
import { isTabClosedError, getSystemPrompt } from "./backgroundUtils.js";
import { ErrorHandler, ErrorSeverity } from "./errorHandler.js";
import { Logger } from "./logger.js";

const SUMMARY_TIMEOUT_MESSAGE = "Summary request timed out. Please try again.";

const createAbortController = (timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return { controller, timeoutId };
};

const validateSelectedHtml = (selectedHtml) => {
  if (typeof selectedHtml !== "string") {
    return {
      valid: false,
      message: "Selected content must be a string.",
    };
  }

  if (selectedHtml.trim() === "") {
    return {
      valid: false,
      message: "Selected content is empty.",
    };
  }

  if (selectedHtml.length > SUMMARY_MAX_CONTENT_SIZE) {
    return {
      valid: false,
      message: `Selected content exceeds maximum size of ${SUMMARY_MAX_CONTENT_SIZE / 1024}KB.`,
    };
  }

  return { valid: true };
};

const createSummaryErrorMessage = (error) => {
  if (error?.name === "AbortError") {
    return SUMMARY_TIMEOUT_MESSAGE;
  }

  return error?.message || "Summary request failed.";
};

const sendSummaryResultToTab = (sender, message, DEBUG = false) => {
  if (!sender.tab?.id) {
    if (DEBUG) {
      Logger.warn("[LLM Summary Handler]", "No tab ID available to send summary response.");
    }
    return;
  }

  chrome.tabs.sendMessage(sender.tab.id, message, () => {
    if (!chrome.runtime.lastError) return;

    if (isTabClosedError(chrome.runtime.lastError)) {
      if (DEBUG) {
        Logger.info("[LLM Summary Handler]",
          `Tab ${sender.tab.id} closed before summary response could be sent.`,
          chrome.runtime.lastError.message,
        );
      }
      return;
    }

    Logger.error("[LLM Summary Handler]",
      `Error sending summary response to tab ${sender.tab.id}:`,
      chrome.runtime.lastError.message,
    );
  });
};

// Helper function to detect language of content
const detectLanguage = async (apiKey, contentSnippet, DEBUG = false) => {
  const models = LANGUAGE_DETECTION_MODELS;
  let lastError = null;

  for (const model of models) {
    try {
      const payload = {
        model: model,
        messages: [{
          role: "user",
          content: `Determine the language that this fragment is written in.
          If you cannot determine the language, the fallback language is US English.
          Respond with ONLY a valid ISO 639-2 three-letter language code (e.g., "eng", "spa", "fra").
          Do not include any other text, punctuation, or explanation.

          Fragment:\n${contentSnippet}`
        }]
      };

      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
          "X-Title": "OR-Summ: Language Detection"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Model ${model} failed: ${response.status}`);
      }

      const responseData = await response.json();
      const detectedCode = responseData.choices?.[0]?.message?.content?.trim();

      if (detectedCode && /^[a-z]{3}$/.test(detectedCode)) {
        Logger.debug("[LLM Summary Handler]", `Language detected using ${model}: ${detectedCode}`);
        return sanitizeLanguageCode(detectedCode, "eng");
      }
    } catch (error) {
      lastError = error;
      Logger.debug("[LLM Summary Handler]", `Language detection with ${model} failed:`, error);
      continue; // Try next model
    }
  }

  // All models failed
  Logger.warn("[LLM Summary Handler]", "All language detection models failed, using fallback:", lastError);
  return "eng";
};

export async function handleRequestSummary(
  request,
  sender,
  sendResponse,
  DEBUG = false,
) {
  const requestId = request?.requestId;
  const language_info = [];
  let hasNewsblurTokenStatus = false;

  if (DEBUG) {
    Logger.info("[LLM Summary Handler]", "Handling requestSummary for ID:",
      requestId,
      "with hasNewsblurToken:",
      request?.hasNewsblurToken,
    );
  }

  try {
    hasNewsblurTokenStatus = request.hasNewsblurToken || false;
    const validation = validateSelectedHtml(request.selectedHtml);
    if (!validation.valid) {
      Logger.error("[LLM Summary Handler]", validation.message);
      sendResponse({ status: "error", message: validation.message });
      sendSummaryResultToTab(sender, {
        action: "summaryResult",
        requestId,
        error: validation.message,
        language_info,
        hasNewsblurToken: hasNewsblurTokenStatus,
      }, DEBUG);
      return;
    }

    const selectedHtml = request.selectedHtml;
    const data = await chrome.storage.sync.get([
      STORAGE_KEY_SUMMARY_MODEL_ID,
      STORAGE_KEY_BULLET_COUNT,
      STORAGE_KEY_LANGUAGE_INFO,
      STORAGE_KEY_PROMPT_TEMPLATE,
      STORAGE_KEY_ALWAYS_USE_US_ENGLISH,
      STORAGE_KEY_MODELS,
    ]);

    // Get encrypted API key from local storage and decrypt it
    const localData = await chrome.storage.local.get([STORAGE_KEY_API_KEY_LOCAL]);
    const encryptedApiKey = localData[STORAGE_KEY_API_KEY_LOCAL];
    const decryptResult = await decryptSensitiveData(encryptedApiKey);
    if (!decryptResult.success) {
      const errorMsg = "Stored API key could not be decrypted. Re-enter the API key in options.";
      Logger.error("[LLM Summary Handler]", "Failed to decrypt API key:", decryptResult.error);
      sendResponse({ status: "error", message: errorMsg });
      sendSummaryResultToTab(sender, {
        action: "summaryResult",
        requestId,
        error: errorMsg,
        language_info,
        hasNewsblurToken: hasNewsblurTokenStatus,
      }, DEBUG);
      return;
    }
    const apiKey = decryptResult.data;

    if (DEBUG) {
      Logger.info("[LLM Summary Handler]", "Data retrieved for summary request:", {
        ...data,
        apiKey: apiKey ? "[API Key Hidden]" : "undefined",
      });
    }
    const summaryModelId = data[STORAGE_KEY_SUMMARY_MODEL_ID];
    const storedLanguageInfo = Array.isArray(data[STORAGE_KEY_LANGUAGE_INFO])
      ? data[STORAGE_KEY_LANGUAGE_INFO]
      : [];
    language_info.splice(0, language_info.length, ...storedLanguageInfo);
    let models = DEFAULT_MODEL_OPTIONS;
    if (
      Array.isArray(data[STORAGE_KEY_MODELS]) &&
      data[STORAGE_KEY_MODELS].length > 0 &&
      data[STORAGE_KEY_MODELS].every(
        (m) => typeof m === "object" && m !== null && typeof m.id === "string",
      )
    ) {
      models = data[STORAGE_KEY_MODELS].map((m) => ({ id: m.id }));
    }
    const modelIds = models.map((m) => m.id);

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
      const errorMsg = "API key is required and must be a non-empty string.";
      Logger.error("[LLM Summary Handler]", "API key is missing or invalid for summary request.");
      sendResponse({ status: "error", message: errorMsg });
      sendSummaryResultToTab(sender, {
        action: "summaryResult",
        requestId,
        error: errorMsg,
        language_info: language_info,
        hasNewsblurToken: hasNewsblurTokenStatus,
      }, DEBUG);
      return;
    }

    if (
      !summaryModelId ||
      typeof summaryModelId !== "string" ||
      summaryModelId.trim() === "" ||
      !modelIds.includes(summaryModelId)
    ) {
      const errorMsg = `Default Summary Model ("${summaryModelId || "None"}") is not selected or is invalid.`;
      Logger.error("[LLM Summary Handler]", `${errorMsg} Available:`, modelIds);
      sendResponse({ status: "error", message: errorMsg });
      sendSummaryResultToTab(sender, {
        action: "summaryResult",
        requestId,
        error: errorMsg,
        language_info: language_info,
        hasNewsblurToken: hasNewsblurTokenStatus,
      }, DEBUG);
      return;
    }

    const alwaysUseUsEnglish = data[STORAGE_KEY_ALWAYS_USE_US_ENGLISH] ?? true;
    let targetLanguage;

    if (alwaysUseUsEnglish) {
      targetLanguage = "eng";
      Logger.debug("[LLM Summary Handler]", "Using forced US English language setting:", targetLanguage);
    } else {
      const snippet = selectedHtml.substring(0, 1024);
      Logger.debug("[LLM Summary Handler]", "Detecting language for snippet:", snippet.substring(0, 80) + "...");
      targetLanguage = await detectLanguage(apiKey, snippet, DEBUG);
      Logger.debug("[LLM Summary Handler]", "Detected language code:", targetLanguage);
    }

    const promptTemplate =
      data[STORAGE_KEY_PROMPT_TEMPLATE] || DEFAULT_XML_PROMPT_TEMPLATE;
    const bulletCount = data[STORAGE_KEY_BULLET_COUNT] || "5";
    const systemPrompt = getSystemPrompt(
      promptTemplate,
      targetLanguage,
      bulletCount,
    );

    const payload = {
      model: summaryModelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: selectedHtml },
      ],
    };

    if (DEBUG) {
      Logger.info("[LLM Summary Handler]", "Sending summary request to OpenRouter:", {
        requestId,
        model: summaryModelId,
        selectedHtmlLength: selectedHtml.length,
      });
    }

    const { controller, timeoutId } = createAbortController(REQUEST_TIMEOUT);
    let response;
    try {
      response = await fetch(
        OPENROUTER_API_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
            "X-Title": "OR-Summ: Summary",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status} - ${text}`);
    }

    const responseData = await response.json();

    Logger.debug("[LLM Summary Handler]", "Received summary response metadata:", {
      requestId,
      model: responseData.model || responseData.model_id || summaryModelId,
      choiceCount: Array.isArray(responseData.choices) ? responseData.choices.length : 0,
    });

    if (responseData?.error?.message) {
      const errorMsg = `ERROR: ${responseData.error.message}`;
      Logger.error("[LLM Summary Handler]", "API returned an error during summary:", responseData.error);
      sendSummaryResultToTab(sender, {
        action: "summaryResult",
        requestId,
        error: errorMsg,
        language_info: language_info,
        hasNewsblurToken: hasNewsblurTokenStatus,
      }, DEBUG);
      sendResponse({ status: "error", message: errorMsg });
      return;
    }

    const modelOutput = responseData.choices?.[0]?.message?.content?.trim();
    if (!modelOutput) {
      throw new Error("No response content received from LLM.");
    }

    // Strip markdown code blocks if present before sending to content script
    let summaryContent = modelOutput.trim();

    // Handle any markdown code block fences (e.g., ```html, ```json, ```)
    if (summaryContent.startsWith("```")) {
      summaryContent = summaryContent
        .replace(/^```[a-z]*\s*/, "")
        .replace(/\s*```$/, "")
        .trim();
      Logger.debug("[LLM Summary Handler]", "Stripped markdown code block wrapper.");
    }

    if (DEBUG) {
      Logger.info("[LLM Summary Handler]", "Cleaned summary content:", summaryContent.substring(0, 200) + "...");
    }

    const completeResponse = {
      action: "summaryResult",
      requestId,
      summary: summaryContent,
      model: responseData.model || responseData.model_id || summaryModelId,
      language_info: language_info,
      hasNewsblurToken: hasNewsblurTokenStatus,
    };

    if (DEBUG) {
      Logger.info("[LLM Summary Handler]", "Sending summary response to content script:", {
        requestId: completeResponse.requestId,
        model: completeResponse.model,
        summaryLength: summaryContent.length,
      });
    }

    sendSummaryResultToTab(sender, completeResponse, DEBUG);

    if (DEBUG) {
      Logger.info("[LLM Summary Handler]", "Sending requestSummary response - OK (processing).");
    }

    sendResponse({ status: "processing" });
  } catch (error) {
    const errorMsg = createSummaryErrorMessage(error);
    ErrorHandler.handle(error, "handleRequestSummary", ErrorSeverity.FATAL, false);
    sendSummaryResultToTab(sender, {
      action: "summaryResult",
      requestId,
      error: errorMsg,
      language_info,
      hasNewsblurToken: hasNewsblurTokenStatus,
    }, DEBUG);
    sendResponse({ status: "error", message: errorMsg });
  }
}
