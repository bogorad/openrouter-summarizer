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
  sanitizeLanguageCode,
  LANGUAGE_DETECTION_MODELS,
} from "../constants.js";

import { decryptSensitiveData } from "./encryption.js";
import { isTabClosedError, getSystemPrompt } from "./backgroundUtils.js";
import { ErrorHandler, ErrorSeverity } from "./errorHandler.js";

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
        if (DEBUG) console.log(`[LLM Summary Handler] Language detected using ${model}: ${detectedCode}`);
        return sanitizeLanguageCode(detectedCode, "eng");
      }
    } catch (error) {
      lastError = error;
      if (DEBUG) console.warn(`[LLM Summary Handler] Language detection with ${model} failed:`, error);
      continue; // Try next model
    }
  }

  // All models failed
  console.warn("[LLM Summary Handler] All language detection models failed, using fallback:", lastError);
  return "eng";
};

export async function handleRequestSummary(
  request,
  sender,
  sendResponse,
  DEBUG = false,
) {
  if (DEBUG) {
    console.log(
      "[LLM Summary Handler] Handling requestSummary for ID:",
      request.requestId,
      "with hasNewsblurToken:",
      request.hasNewsblurToken,
    );
  }

  try {
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
      console.error("[LLM Summary Handler] Failed to decrypt API key:", decryptResult.error);
    }
    const apiKey = decryptResult.data;

    if (DEBUG) {
      console.log("[LLM Summary Handler] Data retrieved for summary request:", {
        ...data,
        apiKey: apiKey ? "[API Key Hidden]" : "undefined",
      });
    }
    const summaryModelId = data[STORAGE_KEY_SUMMARY_MODEL_ID];
    const language_info = Array.isArray(data[STORAGE_KEY_LANGUAGE_INFO])
      ? data[STORAGE_KEY_LANGUAGE_INFO]
      : [];
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
    const hasNewsblurTokenStatus = request.hasNewsblurToken || false;

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
      const errorMsg = "API key is required and must be a non-empty string.";
      console.error(
        "[LLM Summary Handler] API key is missing or invalid for summary request.",
      );
      sendResponse({ status: "error", message: errorMsg });
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "summaryResult",
          requestId: request.requestId,
          error: errorMsg,
          language_info: language_info,
          hasNewsblurToken: hasNewsblurTokenStatus,
        });
      }
      return;
    }

    if (
      !summaryModelId ||
      typeof summaryModelId !== "string" ||
      summaryModelId.trim() === "" ||
      !modelIds.includes(summaryModelId)
    ) {
      const errorMsg = `Default Summary Model ("${summaryModelId || "None"}") is not selected or is invalid.`;
      console.error(`[LLM Summary Handler] ${errorMsg} Available:`, modelIds);
      sendResponse({ status: "error", message: errorMsg });
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "summaryResult",
          requestId: request.requestId,
          error: errorMsg,
          language_info: language_info,
          hasNewsblurToken: hasNewsblurTokenStatus,
        });
      }
      return;
    }

    const alwaysUseUsEnglish = data[STORAGE_KEY_ALWAYS_USE_US_ENGLISH] ?? true;
    let targetLanguage;

    if (alwaysUseUsEnglish) {
      targetLanguage = "eng";
      if (DEBUG)
        console.log(
          "[LLM Summary Handler] Using forced US English language setting:",
          targetLanguage,
        );
    } else {
      const snippet = request.selectedHtml.substring(0, 1024);
      if (DEBUG)
        console.log(
          "[LLM Summary Handler] Detecting language for snippet:",
          snippet.substring(0, 80) + "...",
        );
      targetLanguage = await detectLanguage(apiKey, snippet, DEBUG);
      if (DEBUG)
        console.log(
          "[LLM Summary Handler] Detected language code:",
          targetLanguage,
        );
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
        { role: "user", content: request.selectedHtml },
      ],
    };

    if (DEBUG) {
      console.log(
        "[LLM Summary Handler] Sending payload to OpenRouter for summary:",
        payload,
      );
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
          "X-Title": "OR-Summ: Summary",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status} - ${text}`);
    }

    const responseData = await response.json();

    if (DEBUG) {
      console.log(
        "[LLM Summary Handler] Received raw summary response data:",
        responseData,
      );
    }

    if (responseData?.error?.message) {
      const errorMsg = `ERROR: ${responseData.error.message}`;
      console.error(
        "[LLM Summary Handler] API returned an error during summary:",
        responseData.error,
      );
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "summaryResult",
          requestId: request.requestId,
          error: errorMsg,
          language_info: language_info,
          hasNewsblurToken: hasNewsblurTokenStatus,
        });
      }
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
      if (DEBUG)
        console.log(
          "[LLM Summary Handler] Stripped markdown code block wrapper.",
        );
    }

    if (DEBUG) {
      console.log(
        "[LLM Summary Handler] Cleaned summary content:",
        summaryContent.substring(0, 200) + "...",
      );
    }

    if (DEBUG) {
      console.log(
        "[LLM Summary Handler] Received HTML summary content:",
        summaryContent,
      );
    }

    const completeResponse = {
      action: "summaryResult",
      requestId: request.requestId,
      summary: summaryContent,
      model: responseData.model || responseData.model_id || summaryModelId,
      language_info: language_info,
      hasNewsblurToken: hasNewsblurTokenStatus,
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

    if (DEBUG) {
      console.log(
        "[LLM Summary Handler] Sending requestSummary response - OK (processing).",
      );
    }

    sendResponse({ status: "processing" });
  } catch (error) {
    ErrorHandler.handle(error, "handleRequestSummary", ErrorSeverity.FATAL, false);
    sendResponse({ status: "error", message: error.message });
  }
}
