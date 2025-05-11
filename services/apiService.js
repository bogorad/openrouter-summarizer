// services/apiService.js
import {
  OPENROUTER_API_URL,
  MAX_RETRIES,
  RETRY_DELAY,
  ERROR_NO_API_KEY,
  ERROR_NO_MODEL,
  ERROR_NETWORK,
  ERROR_TIMEOUT,
  ERROR_RATE_LIMIT,
  ERROR_API_KEY_INVALID,
  ERROR_CONTENT_FILTERED,
  ERROR_BAD_REQUEST,
  ERROR_SERVER_ERROR,
  ERROR_UNKNOWN,
} from "../constants.js";
import { getSettings } from "./settingsService.js";
import { logDebug, logError } from "../utils/errorHandling.js";

/**
 * Process API error response
 * @param {Error} error - Error object
 * @returns {Object} Formatted error response
 */
function processApiError(error) {
  let errorMessage = ERROR_UNKNOWN;
  let errorCode = "unknown_error";

  if (error.message.includes("timeout")) {
    errorMessage = ERROR_TIMEOUT;
    errorCode = "timeout";
  } else if (error.message.includes("rate limit")) {
    errorMessage = ERROR_RATE_LIMIT;
    errorCode = "rate_limit";
  } else if (error.message.includes("401")) {
    errorMessage = ERROR_API_KEY_INVALID;
    errorCode = "invalid_api_key";
  } else if (error.message.includes("400")) {
    errorMessage = ERROR_BAD_REQUEST;
    errorCode = "bad_request";
  } else if (error.message.includes("429")) {
    errorMessage = ERROR_RATE_LIMIT;
    errorCode = "rate_limit";
  } else if (error.message.match(/5\d\d/)) {
    errorMessage = ERROR_SERVER_ERROR;
    errorCode = "server_error";
  } else if (error.message.includes("content_filter")) {
    errorMessage = ERROR_CONTENT_FILTERED;
    errorCode = "content_filtered";
  } else if (error.message.includes("network") || error.message.includes("fetch")) {
    errorMessage = ERROR_NETWORK;
    errorCode = "network_error";
  }

  return {
    status: "error",
    message: errorMessage,
    code: errorCode,
    originalError: error.message,
  };
}

/**
 * Send chat request to OpenRouter
 * @param {Array} messages - Chat messages
 * @param {string} model - Model ID
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise<Object>} Chat response
 */
export async function sendChatRequest(messages, model, signal) {
  try {
    const settings = await getSettings();
    const apiKey = settings.apiKey;
    
    if (!apiKey) {
      throw new Error(ERROR_NO_API_KEY);
    }
    
    if (!model) {
      throw new Error(ERROR_NO_MODEL);
    }
    
    const payload = {
      model: model,
      messages: messages,
    };
    
    logDebug("Sending payload to OpenRouter for chat", payload);
    
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
        "X-Title": "OR-Summ",
      },
      body: JSON.stringify(payload),
      signal: signal,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    logDebug("Received raw chat response data", data);
    
    // Check for API-level error
    if (data && data.error && data.error.code && data.error.message) {
      throw new Error(`API error: ${data.error.code} - ${data.error.message}`);
    }
    
    return data;
  } catch (error) {
    logError("API request failed", error);
    throw error;
  }
}

/**
 * Send summary request to OpenRouter
 * @param {string} html - HTML content to summarize
 * @param {string} prompt - Prompt template
 * @param {string} model - Model ID
 * @returns {Promise<Object>} Summary response
 */
export async function sendSummaryRequest(html, prompt, model) {
  try {
    const settings = await getSettings();
    const apiKey = settings.apiKey;
    
    if (!apiKey) {
      throw new Error(ERROR_NO_API_KEY);
    }
    
    if (!model) {
      throw new Error(ERROR_NO_MODEL);
    }
    
    const messages = [
      { role: "system", content: prompt },
      { role: "user", content: html },
    ];
    
    const payload = {
      model: model,
      messages: messages,
    };
    
    logDebug("Sending payload to OpenRouter for summary", {
      model,
      promptLength: prompt.length,
      htmlLength: html.length,
    });
    
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
        "X-Title": "OR-Summ",
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    logDebug("Received raw summary response data", data);
    
    // Check for API-level error
    if (data && data.error && data.error.code && data.error.message) {
      throw new Error(`API error: ${data.error.code} - ${data.error.message}`);
    }
    
    return {
      status: "success",
      response: data.choices[0].message.content,
      model: model,
    };
  } catch (error) {
    logError("Summary request failed", error);
    return processApiError(error);
  }
}
