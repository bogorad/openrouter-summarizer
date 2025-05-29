// background.js
import {
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
  // STORAGE_KEY_KNOWN_MODELS_AND_PRICES, // No longer directly used in background.js
  // Assuming these will be added to constants.js, defining them here for now
  // MAX_PRICING_RETRIES,
  // PRICING_RETRY_DELAY_MS,
} from "./constants.js";
import * as constants from "./constants.js"; // Import all constants as an object to resolve potential redeclaration issues

import {
  isTabClosedError,
  extractStringsFromMalformedJson,
  normalizeMarkdownInStrings,
  getSystemPrompt,
} from "./js/backgroundUtils.js";
import {
  handleGetModelPricing,
  handleUpdateKnownModelsAndPricing,
} from "./js/pricingService.js";
import {
  handleLlmChatStream,
  handleAbortChatRequest,
} from "./js/chatHandler.js";
import { handleRequestSummary } from "./js/summaryHandler.js";
import { handleGetSettings } from "./js/settingsManager.js";
import {
  handleGetChatContext,
  handleSetChatContext,
} from "./js/chatContextManager.js";
import { handleOpenChatTab, handleOpenOptionsPage } from "./js/uiActions.js";

console.log(
  `[LLM Background] Service Worker Start (v3.4.7 - Pricing Retry Logic)`,
); // Updated version

let DEBUG = false;
const DEFAULT_BULLET_COUNT = "5";
const DEFAULT_DEBUG_MODE = false;

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
  // On install/update, set initial default values if not already set
  chrome.storage.sync.get(
    [
      STORAGE_KEY_API_KEY,
      STORAGE_KEY_DEBUG,
      STORAGE_KEY_SUMMARY_MODEL_ID,
      STORAGE_KEY_CHAT_MODEL_ID,
      STORAGE_KEY_BULLET_COUNT,
      STORAGE_KEY_MAX_REQUEST_PRICE,
    ],
    (data) => {
      DEBUG = !!data[STORAGE_KEY_DEBUG]; // Update DEBUG status from settings
      const initialSettings = {};
      if (!data[STORAGE_KEY_API_KEY]) {
        chrome.runtime.openOptionsPage(); // Open options page if API key is missing
      }
      if (DEBUG) {
        console.log(
          "[LLM Background] Checking initial settings on install/update.",
        );
      }
      if (!data[STORAGE_KEY_SUMMARY_MODEL_ID]) {
        initialSettings[STORAGE_KEY_SUMMARY_MODEL_ID] =
          constants.DEFAULT_SELECTED_SUMMARY_MODEL_ID;
      }
      if (!data[STORAGE_KEY_CHAT_MODEL_ID]) {
        initialSettings[STORAGE_KEY_CHAT_MODEL_ID] =
          constants.DEFAULT_SELECTED_CHAT_MODEL_ID;
      }
      if (data[STORAGE_KEY_BULLET_COUNT] === undefined) {
        initialSettings[STORAGE_KEY_BULLET_COUNT] =
          constants.DEFAULT_BULLET_COUNT_NUM.toString(); // Store as string as expected by UI
      }
      if (data[STORAGE_KEY_MAX_REQUEST_PRICE] === undefined) {
        initialSettings[STORAGE_KEY_MAX_REQUEST_PRICE] =
          constants.DEFAULT_MAX_REQUEST_PRICE;
      }
      // Only set if there are new initial settings to save
      if (Object.keys(initialSettings).length > 0) {
        chrome.storage.sync.set(initialSettings, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[LLM Background] Error setting initial storage values:",
              chrome.runtime.lastError,
              initialSettings,
            );
          } else if (DEBUG) {
            // Only log success if DEBUG is true
            console.log(
              "[LLM Background] Initial default settings applied:",
              initialSettings,
            );
          }
        });
      }
    },
  );
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sendToLLM" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
  }
});

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Always return true to indicate an asynchronous response will be sent.
  // The actual response will be sent by the internal async handler.
  handleAsyncMessage(request, sender, sendResponse);
  return true;
});

// New async function to handle all messages and ensure sendResponse is called
async function handleAsyncMessage(request, sender, sendResponse) {
  try {
    // Dynamically load DEBUG state (safer and consistent)
    const result = await chrome.storage.sync.get("debug");
    DEBUG = !!result.debug;

    if (DEBUG)
      console.log(
        "[LLM Background] Received message:",
        request.action,
        "from sender:",
        sender,
      );

    // This object maps message actions to their corresponding handler functions.
    // Each handler must ensure it calls sendResponse.
    const messageHandlers = {
      getSettings: async () => {
        const currentGlobalDefaults = {
          DEFAULT_BULLET_COUNT,
          DEFAULT_MAX_REQUEST_PRICE: constants.DEFAULT_MAX_REQUEST_PRICE,
        }; // Use constants.DEFAULT_MAX_REQUEST_PRICE
        // handleGetSettings already calls sendResponse internally
        if (DEBUG) {
          console.log(
            "[LLM Background] Calling handleGetSettings with global defaults:",
            currentGlobalDefaults,
          );
        }
        handleGetSettings(sendResponse, DEBUG, currentGlobalDefaults);
      },
      getChatContext: async () => handleGetChatContext(sendResponse, DEBUG),
      getModelPricing: async () =>
        handleGetModelPricing(request, sendResponse, DEBUG),
      updateKnownModelsAndPricing: async () =>
        handleUpdateKnownModelsAndPricing(sendResponse, DEBUG),
      llmChatStream: async () =>
        handleLlmChatStream(request, sendResponse, DEBUG),
      abortChatRequest: async () => handleAbortChatRequest(sendResponse, DEBUG),
      setChatContext: async () =>
        handleSetChatContext(request, sendResponse, DEBUG),
      openChatTab: async () => handleOpenChatTab(sendResponse, DEBUG),
      openOptionsPage: async () => {
        // openOptionsPage is usually fire-and-forget; no explicit sendResponse needed for content scripts.
        // It's a synchronous UI action. For robustness, we will send a minimal response.
        handleOpenOptionsPage(sendResponse, DEBUG);
        // sendResponse is handled by handleOpenOptionsPage indirectly,
        // or not strictly required for this fire-and-forget UI action
        // if only the background script cares about the result.
        // For pageInteraction scripts that await, handleOpenOptionsPage actually sends a response,
        // so this line can be removed to avoid double-response issues.
      },
      requestSummary: async () =>
        handleRequestSummary(request, sender, sendResponse, DEBUG),
      getNewsblurToken: async () => {
        try {
          const tokenResult = await chrome.storage.sync.get(
            constants.STORAGE_KEY_NEWSBLUR_TOKEN,
          );
          const token = tokenResult[constants.STORAGE_KEY_NEWSBLUR_TOKEN] || "";
          sendResponse({ status: "success", token: token });
        } catch (e) {
          console.error("[LLM Background] Error getting NewsBlur token:", e);
          sendResponse({
            status: "error",
            message: `Failed to get NewsBlur token: ${e.message}`,
          });
        }
      },
      shareToNewsblur: async () => {
        if (DEBUG)
          console.log(
            "[LLM Background] Received shareToNewsblur request:",
            request.options,
          );
        try {
          const apiResult = await shareToNewsblurAPI(request.options, DEBUG); // Pass DEBUG to shareToNewsblurAPI
          sendResponse({ status: "success", result: apiResult });
        } catch (error) {
          // This error is caught from shareToNewsblurAPI throwing it, or an unexpected error before that.
          console.info(
            "[LLM Background] shareToNewsblur handler caught an error:",
            error,
          ); // Unconditional info log
          sendResponse({
            status: "error",
            message: error.message,
            error: error,
          });
        }
      },
    };

    const handler = messageHandlers[request.action];
    if (handler) {
      await handler(); // Await the specific message handler
    } else {
      // Handle unrecognized actions
      if (DEBUG)
        console.log("[LLM Background] Unrecognized action:", request.action);
      sendResponse({
        status: "error",
        message: `Unhandled action: ${request.action}`,
      });
    }
  } catch (error) {
    // Catch-all for any uncaught errors during message processing
    console.info(
      `[LLM Background] Uncaught error in handleAsyncMessage for action ${request.action}:`,
      error,
    ); // Unconditional info log
    // Ensure sendResponse is called even on unexpected errors
    try {
      sendResponse({
        status: "error",
        message: `An unexpected error occurred: ${error.message}`,
      });
    } catch (e) {
      console.warn(
        "[LLM Background] Could not send error response: Channel already closed or other issue.",
        e,
      );
    }
  }
}

// --- NewsBlur API Function (Copied from prompt) ---
// This function performs the actual sharing to NewsBlur.
// It is now an async function because it uses fetch.
async function shareToNewsblurAPI(options, DEBUG_API) {
  // Added DEBUG_API parameter
  let token = options.token;
  if (!token) {
    const tokenResult = await chrome.storage.sync.get(
      constants.STORAGE_KEY_NEWSBLUR_TOKEN,
    );
    token = tokenResult[constants.STORAGE_KEY_NEWSBLUR_TOKEN] || ""; // Fallback to hardcoded if not in storage
  }
  const domain = options.domain || "www.newsblur.com";
  const apiUrl = `https://${domain}/api/share_story/${token}`;

  const payload = new URLSearchParams();
  payload.append("story_url", options.story_url);
  payload.append("title", options.title);
  payload.append("content", options.content);
  payload.append("comments", options.comments);

  if (options.feed_id) {
    payload.append("feed_id", options.feed_id);
  }
  if (options.rss_url) {
    payload.append("rss_url", options.rss_url);
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      let errorText = `HTTP error! status: ${response.status}`;
      let responseBody = "";

      // Handle 502 specifically: treat as success and return
      if (response.status === 502) {
        try {
          responseBody = await response.text();
        } catch (e) {
          console.info("[LLM NewsBlur] Failed to read 502 response body:", e); // Info log
        }
        console.info(
          `[LLM NewsBlur] NewsBlur API returned 502 (Normal). Treating as success. Raw response: ${responseBody}`,
        ); // Info log
        return {
          code: 0,
          message: `NewsBlur API 502 received, treated as success: ${responseBody}`,
        };
      }

      // Existing logic for other non-OK responses (now logged as info)
      try {
        responseBody = await response.text(); // Read raw text from response
        errorText += ` - ${responseBody}`; // Append raw body to error message
        // Try to parse as JSON if it looks like it, for more structured info
        try {
          const errorData = JSON.parse(responseBody);
          errorText += ` (Parsed JSON: ${JSON.stringify(errorData.message || errorData.errors || errorData)})`;
        } catch (parseError) {
          // If not JSON, the raw text is already appended.
          if (DEBUG_API)
            console.warn(
              "[LLM NewsBlur] Failed to parse NewsBlur error response as JSON.",
              parseError,
            );
        }
      } catch (e) {
        errorText += ` - Failed to read response body: ${e.message}`; // Fallback if body can't be read
      }
      console.info(
        "[LLM NewsBlur] NewsBlur API non-OK response (error):",
        response.status,
        responseBody,
      ); // Changed to console.info
      throw new Error(errorText); // Still throw for other errors
    }

    const result = await response.json();
    if (DEBUG_API) console.log("NewsBlur Share Response:", result);

    if (result.code < 0 || (result.result && result.result === "error")) {
      console.info(
        "Error sharing to NewsBlur:",
        result.message || JSON.stringify(result.errors || result),
      ); // Changed to console.info
      return {
        code: -1,
        message: result.message || JSON.stringify(result.errors || result),
      };
    } else {
      if (DEBUG_API) console.log("Successfully shared to NewsBlur!");
      return result;
    }
  } catch (error) {
    console.info(
      "[LLM NewsBlur] Failed to share to NewsBlur (caught error):",
      error,
    ); // Changed to console.info
    return { code: -1, message: error.message };
  }
}

// Pricing functions moved to js/pricingService.js
// Utility functions moved to js/backgroundUtils.js
