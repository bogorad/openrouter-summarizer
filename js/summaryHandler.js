// js/summaryHandler.js
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_SUMMARY_MODEL_ID,
  STORAGE_KEY_BULLET_COUNT,
  STORAGE_KEY_LANGUAGE_INFO,
  STORAGE_KEY_PROMPT_TEMPLATE,
  STORAGE_KEY_ALWAYS_USE_US_ENGLISH,
  STORAGE_KEY_MODELS,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_XML_PROMPT_TEMPLATE,
  OPENROUTER_API_URL,
} from "../constants.js";

import { isTabClosedError, getSystemPrompt } from "./backgroundUtils.js";

// Helper function to detect language of content
async function detectLanguage(apiKey, contentSnippet, DEBUG = false) {
  try {
    const payload = {
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "user",
          content: `Determine the language of this fragment. If you can not determine the language, the fallback language is US English. Respond with a "ISO 639-2" code, provide only three characters. You are forbidden from responding with anything else!!!\n\n---\n\n${contentSnippet}`,
        },
      ],
    };

    if (DEBUG)
      console.log(
        "[LLM Summary Handler] Sending language detection API request with payload:",
        payload,
      );

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
        "X-Title": "OR-Summary",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn(
        `[LLM Summary Handler] Language detection API error: ${response.status}`,
      );
      return "eng"; // ISO 639-2 code for English
    }

    const responseData = await response.json();
    if (DEBUG)
      console.log(
        "[LLM Summary Handler] Language detection API response:",
        responseData,
      );

    if (responseData.choices && responseData.choices.length > 0) {
      const detectedCode = responseData.choices[0].message.content.trim();
      if (DEBUG)
        console.log(
          "[LLM Summary Handler] Raw detected language code:",
          detectedCode,
        );

      // Ensure we have a valid 3-character code, fallback to English if not
      const finalCode = detectedCode.length === 3 ? detectedCode : "eng";
      if (DEBUG)
        console.log(
          "[LLM Summary Handler] Final language code after validation:",
          finalCode,
        );
      return finalCode;
    } else {
      console.warn(
        "[LLM Summary Handler] No language detection response received",
      );
      return "eng"; // ISO 639-2 code for English
    }
  } catch (error) {
    console.warn("[LLM Summary Handler] Language detection failed:", error);
    return "eng"; // ISO 639-2 code for English
  }
}

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
      STORAGE_KEY_API_KEY,
      STORAGE_KEY_SUMMARY_MODEL_ID,
      STORAGE_KEY_BULLET_COUNT,
      STORAGE_KEY_LANGUAGE_INFO,
      STORAGE_KEY_PROMPT_TEMPLATE,
      STORAGE_KEY_ALWAYS_USE_US_ENGLISH,
      STORAGE_KEY_MODELS,
    ]);

    if (DEBUG) {
      console.log("[LLM Summary Handler] Data retrieved for summary request:", {
        ...data,
        [STORAGE_KEY_API_KEY]: data[STORAGE_KEY_API_KEY]
          ? "[API Key Hidden]"
          : "undefined",
      });
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
    console.error(
      "[LLM Summary Handler] Error in handleRequestSummary:",
      error,
    );
    sendResponse({ status: "error", message: error.message });
  }
}
