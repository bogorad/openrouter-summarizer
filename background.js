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
  // STORAGE_KEY_KNOWN_MODELS_AND_PRICES, // No longer directly used in background.js
  // Assuming these will be added to constants.js, defining them here for now
  // MAX_PRICING_RETRIES,
  // PRICING_RETRY_DELAY_MS,
} from "./constants.js";

// const DEFAULT_MAX_REQUEST_PRICE = 0.001; // Added this as it was missing from imports but used later
// This constant is used in getSettings, ensure it's defined or imported if needed.
// For now, assuming it's still needed here or will be re-added if getSettings is moved.
const DEFAULT_MAX_REQUEST_PRICE = 0.001;


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
import {
  handleOpenChatTab,
  handleOpenOptionsPage,
} from "./js/uiActions.js";


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

    // --- getSettings Handler (Moved to settingsManager.js) ---
    if (request.action === "getSettings") {
      const currentGlobalDefaults = {
        DEFAULT_BULLET_COUNT,
        DEFAULT_MAX_REQUEST_PRICE
      };
      handleGetSettings(sendResponse, DEBUG, currentGlobalDefaults);
      return true;
    }

    // --- getChatContext Handler (Moved to chatContextManager.js) ---
    else if (request.action === "getChatContext") {
      handleGetChatContext(sendResponse, DEBUG);
      return true;
    }
    // --- getModelPricing Handler (Moved to pricingService.js) ---
    else if (request.action === "getModelPricing") {
      handleGetModelPricing(request, sendResponse, DEBUG);
      return true;
    }
    // --- updateKnownModelsAndPricing Handler (Moved to pricingService.js) ---
    else if (request.action === "updateKnownModelsAndPricing") {
      handleUpdateKnownModelsAndPricing(sendResponse, DEBUG);
      return true;
    }

    // --- llmChatStream Handler (Moved to chatHandler.js) ---
    else if (request.action === "llmChatStream") {
      handleLlmChatStream(request, sendResponse, DEBUG);
      return true;
    }

    // --- abortChatRequest Handler (Moved to chatHandler.js) ---
    else if (request.action === "abortChatRequest") {
      handleAbortChatRequest(sendResponse, DEBUG);
      return true;
    }

    // --- setChatContext Handler (Moved to chatContextManager.js) ---
    else if (request.action === "setChatContext") {
      handleSetChatContext(request, sendResponse, DEBUG);
      return true;
    }

    // --- openChatTab Handler (Moved to uiActions.js) ---
    else if (request.action === "openChatTab") {
      handleOpenChatTab(sendResponse, DEBUG);
      return true;
    }
    // --- openOptionsPage Handler (Moved to uiActions.js) ---
    else if (request.action === "openOptionsPage") {
      handleOpenOptionsPage(sendResponse, DEBUG);
      return false; // Explicitly return false for this synchronous path
    }
    // --- requestSummary Handler (Moved to summaryHandler.js) ---
    else if (request.action === "requestSummary") {
      handleRequestSummary(request, sender, sendResponse, DEBUG);
      return true;
    }
    // --- Default Handler for Unrecognized Actions ---
    else { // Changed to else to ensure it's part of the if/else if chain
      if (DEBUG)
        console.log(
          "[LLM Background] Message handler completed for action:",
          request.action,
          "- No specific handler matched or an issue occurred.",
        );
      try {
        // It's possible sendResponse was already called if an error occurred in a handler
        // or if the action was meant to be async but didn't return true.
        // We check if the port is still open before trying to send.
        if (sender.tab && !sender.tab.url?.startsWith("chrome-extension://")) { // Avoid error for internal extension pages
             // Check if channel is still open before sending
            if (chrome.runtime.lastError == null) { // A bit of a guess, better would be a flag
                sendResponse({ status: "unhandled_or_error", action: request.action });
            } else if (DEBUG) {
                console.warn("[LLM Background] Port closed before unhandled response for action:", request.action);
            }
        } else if (DEBUG) {
             console.log("[LLM Background] Not sending unhandled response for internal page or no tab context for action:", request.action);
        }
      } catch (e) {
        if (DEBUG)
          console.warn(
            `[LLM Background] Error sending default/unhandled response for action "${request.action}":`,
            e.message,
          );
      }
      // This path should return false if sendResponse was called,
      // or true if it's genuinely an async operation that hasn't completed.
      // Given it's a fallback, 'false' is safer.
      return false;
    }
  }); // End storage.sync.get for DEBUG check
  return true; // Keep message listener active for async responses
}); // End chrome.runtime.onMessage.addListener

// Pricing functions moved to js/pricingService.js
// Utility functions moved to js/backgroundUtils.js
