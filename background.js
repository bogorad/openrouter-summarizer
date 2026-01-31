// background.js
import {
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
  STORAGE_KEY_PROMPT_TEMPLATE,
  DEFAULT_XML_PROMPT_TEMPLATE,
  STORAGE_KEY_NEWSBLUR_TOKEN,
  STORAGE_KEY_JOPLIN_TOKEN,
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
  STORAGE_KEY_JOPLIN_TOKEN_LOCAL,
} from "./constants.js";
import * as constants from "./constants.js"; // Import all constants as an object to resolve potential redeclaration issues
const JOPLIN_API_BASE_URL = constants.JOPLIN_API_BASE_URL;
const JOPLIN_API_FOLDERS_ENDPOINT = constants.JOPLIN_API_FOLDERS_ENDPOINT;
const JOPLIN_API_NOTES_ENDPOINT = constants.JOPLIN_API_NOTES_ENDPOINT;

import {
  isTabClosedError,
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
import { encryptSensitiveData, decryptSensitiveData } from "./js/encryption.js";
import { ErrorHandler, ErrorSeverity, handleLastError } from "./js/errorHandler.js";

console.log(
  `[LLM Background] Service Worker Start (v3.8.0 - HTML Summary Format)`,
); // Updated version

let DEBUG = false;
const DEFAULT_BULLET_COUNT = "5";
const DEFAULT_DEBUG_MODE = false;

// Initial debug state load
chrome.storage.sync.get(STORAGE_KEY_DEBUG, (data) => {
  DEBUG = !!data[STORAGE_KEY_DEBUG];
});

// Migration: Move tokens from sync to encrypted local storage
// Verifies encryption and persistence before removing sync tokens to prevent data loss
async function migrateTokensToEncryptedStorage() {
  try {
    const syncData = await chrome.storage.sync.get([
      STORAGE_KEY_API_KEY,
      STORAGE_KEY_NEWSBLUR_TOKEN,
      STORAGE_KEY_JOPLIN_TOKEN,
    ]);

    const tokensToMigrate = [
      { syncKey: STORAGE_KEY_API_KEY, localKey: STORAGE_KEY_API_KEY_LOCAL },
      { syncKey: STORAGE_KEY_NEWSBLUR_TOKEN, localKey: STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL },
      { syncKey: STORAGE_KEY_JOPLIN_TOKEN, localKey: STORAGE_KEY_JOPLIN_TOKEN_LOCAL },
    ].filter(t => syncData[t.syncKey]);

    if (tokensToMigrate.length === 0) {
      return; // Nothing to migrate
    }

    // Step 1: Encrypt all tokens and validate results
    const migrations = {};
    for (const { syncKey, localKey } of tokensToMigrate) {
      const encrypted = await encryptSensitiveData(syncData[syncKey]);
      if (!encrypted) {
        console.error(`[Migration] Encryption failed for ${syncKey} - aborting migration`);
        return; // Abort: keep sync tokens intact
      }
      migrations[localKey] = encrypted;
    }

    // Step 2: Save to local storage
    await chrome.storage.local.set(migrations);

    // Step 3: Verify data was persisted by reading back
    const localKeys = tokensToMigrate.map(t => t.localKey);
    const verification = await chrome.storage.local.get(localKeys);
    for (const { localKey } of tokensToMigrate) {
      if (verification[localKey] !== migrations[localKey]) {
        console.error(`[Migration] Verification failed for ${localKey} - aborting migration`);
        return; // Abort: keep sync tokens intact
      }
    }

    // Step 4: Only now safe to remove from sync storage
    const syncKeysToRemove = tokensToMigrate.map(t => t.syncKey);
    await chrome.storage.sync.remove(syncKeysToRemove);

    console.log(`[Migration] Successfully migrated ${tokensToMigrate.length} token(s) to encrypted local storage`);
  } catch (e) {
    // Keep sync tokens on any error - user can retry migration on next install/update
    console.error('[Migration] Token migration failed, keeping sync tokens:', e);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  // Run migration first
  await migrateTokensToEncryptedStorage();

  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
  });
  // On install/update, set initial default values if not already set
  chrome.storage.sync.get(
    [
      STORAGE_KEY_DEBUG,
      STORAGE_KEY_SUMMARY_MODEL_ID,
      STORAGE_KEY_CHAT_MODEL_ID,
      STORAGE_KEY_BULLET_COUNT,
      STORAGE_KEY_MAX_REQUEST_PRICE,
      STORAGE_KEY_PROMPT_TEMPLATE,
    ],
    async (data) => {
      DEBUG = !!data[STORAGE_KEY_DEBUG]; // Update DEBUG status from settings
      const initialSettings = {};

      // Check for API key in encrypted local storage
      const localData = await chrome.storage.local.get([STORAGE_KEY_API_KEY_LOCAL]);
      const decryptResult = await decryptSensitiveData(localData[STORAGE_KEY_API_KEY_LOCAL]);
      if (!decryptResult.success) {
        console.error("[LLM Background] Failed to decrypt API key:", decryptResult.error);
      }
      const apiKey = decryptResult.data;

      if (!apiKey) {
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

      // Handle prompt template reset on extension load/update:
      // - Preserve user's custom formatting in <user_formatting> section
      // - Reset pre-prompt and post-prompt to current defaults
      // This ensures system templates update while keeping user customizations
      const currentPromptTemplate = data[STORAGE_KEY_PROMPT_TEMPLATE];
      if (currentPromptTemplate) {
        // Extract user's custom formatting section from existing template
        const startTag = '<user_formatting>';
        const endTag = '</user_formatting>';
        const startIndex = currentPromptTemplate.indexOf(startTag);
        const endIndex = currentPromptTemplate.indexOf(endTag);

        let userFormattingContent = '';
        if (startIndex !== -1 && endIndex !== -1) {
          userFormattingContent = currentPromptTemplate.substring(
            startIndex + startTag.length,
            endIndex
          );
          if (DEBUG) {
            console.log("[LLM Background] Extracted user formatting content for preservation");
          }
        }

        // Create new template with preserved user formatting
        const newDefaultTemplate = DEFAULT_XML_PROMPT_TEMPLATE;
        const newStartIndex = newDefaultTemplate.indexOf(startTag);
        const newEndIndex = newDefaultTemplate.indexOf(endTag);

        if (newStartIndex !== -1 && newEndIndex !== -1 && userFormattingContent) {
          const newTemplate =
            newDefaultTemplate.substring(0, newStartIndex + startTag.length) +
            userFormattingContent +
            newDefaultTemplate.substring(newEndIndex);

          initialSettings[STORAGE_KEY_PROMPT_TEMPLATE] = newTemplate;
          if (DEBUG) {
            console.log("[LLM Background] Reset prompt template with preserved user formatting");
          }
        } else {
          // Fallback: use completely new default template
          initialSettings[STORAGE_KEY_PROMPT_TEMPLATE] = DEFAULT_XML_PROMPT_TEMPLATE;
          if (DEBUG) {
            console.log("[LLM Background] Reset prompt template to complete default (no user formatting preserved)");
          }
        }
      } else {
        // No existing template, set default
        initialSettings[STORAGE_KEY_PROMPT_TEMPLATE] = DEFAULT_XML_PROMPT_TEMPLATE;
        if (DEBUG) {
          console.log("[LLM Background] Set default prompt template (first install)");
        }
      }

    // Only set if there are new initial settings to save
    if (Object.keys(initialSettings).length > 0) {
      chrome.storage.sync.set(initialSettings, () => {
        if (handleLastError("setInitialSettings", DEBUG)) {
          ErrorHandler.handle(
            new Error(chrome.runtime.lastError.message),
            "onInstalled",
            ErrorSeverity.WARNING,
            false
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
      fetchJoplinNotebooks: async () => {
        if (DEBUG) console.log("[LLM Background] Received fetchJoplinNotebooks request.");
        try {
          const folders = await fetchJoplinFoldersAPI(request.joplinToken, DEBUG);
          sendResponse({ status: "success", folders: folders });
        } catch (error) {
          console.error("[LLM Background] fetchJoplinNotebooks handler caught an error:", error);
          sendResponse({ status: "error", message: error.message });
        }
      },
      createJoplinNote: async () => {
        if (DEBUG) console.log("[LLM Background] Received createJoplinNote request.", request);
        try {
          const result = await createJoplinNoteAPI(
            request.joplinToken,
            request.title,
            request.source_url,
            request.body_html, // Now only expecting body_html
            request.parent_id,
            DEBUG
          );
          sendResponse({ status: "success", result: result });
        } catch (error) {
          console.error("[LLM Background] createJoplinNote handler caught an error:", error);
          sendResponse({ status: "error", message: error.message });
        }
      },
      getNewsblurToken: async () => {
        try {
          const tokenResult = await chrome.storage.local.get(
            constants.STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
          );
          const encryptedToken = tokenResult[constants.STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL];
          const decryptResult = await decryptSensitiveData(encryptedToken);
          if (!decryptResult.success) {
            console.error("[LLM Background] Failed to decrypt NewsBlur token:", decryptResult.error);
          }
          const token = decryptResult.data;
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
          console.error(
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
    ErrorHandler.handle(error, `handleAsyncMessage:${request.action}`, ErrorSeverity.FATAL, false);
    // Ensure sendResponse is called even on unexpected errors
    try {
      sendResponse({
        status: "error",
        message: `An unexpected error occurred: ${error.message}`,
      });
    } catch (e) {
      ErrorHandler.handle(e, "sendResponseFallback", ErrorSeverity.WARNING, false);
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
    const tokenResult = await chrome.storage.local.get(
      constants.STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
    );
    const encryptedToken = tokenResult[constants.STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL];
    const decryptResult = await decryptSensitiveData(encryptedToken);
    if (!decryptResult.success) {
      console.error("[LLM Background] Failed to decrypt NewsBlur token:", decryptResult.error);
    }
    token = decryptResult.data;
  }
  const domain = options.domain || "www.newsblur.com";
  const apiUrl = `https://${domain}/api/share_story/${token}`;

  const payload = new URLSearchParams();
  payload.append("story_url", options.story_url);
  payload.append("title", options.title);
  payload.append("content", options.content);
  payload.append("comments", options.comments);

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
        console.warn(
          `[LLM NewsBlur] NewsBlur API returned 502 (Normal). Treating as success. Raw response: ${responseBody}`,
        ); // Changed to console.warn
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
      console.error(
        "[LLM NewsBlur] NewsBlur API non-OK response (error):",
        response.status,
        responseBody,
      ); // Changed to console.info
      throw new Error(errorText); // Still throw for other errors
    }

    const result = await response.json();
    if (DEBUG_API) console.log("NewsBlur Share Response:", result);

    if (result.code < 0 || (result.result && result.result === "error")) {
      console.error(
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
    console.error(
      "[LLM NewsBlur] Failed to share to NewsBlur (caught error):",
      error,
    ); // Changed to console.error
    return { code: -1, message: error.message };
  }
}

/**
 * Fetches the list of folders from the Joplin API.
 * @param {string} joplinToken - The Joplin API token.
 * @param {boolean} DEBUG_API - Debug flag for API calls.
 * @returns {Promise<Array>} A promise that resolves to an array of Joplin folders.
 */
async function fetchJoplinFoldersAPI(joplinToken, DEBUG_API) {
  if (!joplinToken) {
    throw new Error("Joplin API token is missing.");
  }
  const apiUrl = `${JOPLIN_API_BASE_URL}${JOPLIN_API_FOLDERS_ENDPOINT}?token=${joplinToken}`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[LLM Joplin API] Error fetching folders:", response.status, errorText);
      throw new Error(`Failed to fetch Joplin notebooks: ${response.statusText} - ${errorText}`);
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.items)) {
      throw new Error("Invalid response format from Joplin API.");
    }
    if (DEBUG_API) console.log("[LLM Joplin API] Fetched folders:", data.items);
    return data.items;
  } catch (error) {
    console.error("[LLM Joplin API] Network error during folder fetch:", error);
    throw new Error(`Network error or invalid Joplin API URL. Ensure Joplin is running and API is enabled: ${error.message}`);
  }
}

/**
 * Creates a new note in Joplin.
 * @param {string} joplinToken - The Joplin API token.
 * @param {string} title - The title of the note.
 * @param {string} source_url - The URL of the source.
 * @param {string} body_html - The HTML body of the note.
 * @param {string} parent_id - The ID of the parent folder (notebook).
 * @param {boolean} DEBUG_API - Debug flag for API calls.
 * @returns {Promise<object>} A promise that resolves to the Joplin API response for the created note.
 */
async function createJoplinNoteAPI(joplinToken, title, source_url, body_html, parent_id, DEBUG_API) {
  if (!joplinToken || !title || !body_html || !parent_id) { // Simplified validation, now always requires body_html
    throw new Error("Missing required parameters for creating Joplin note (token, title, HTML content, or parentId).");
  }
  const apiUrl = `${JOPLIN_API_BASE_URL}${JOPLIN_API_NOTES_ENDPOINT}?token=${joplinToken}`;

  const noteData = {
    title: title,
    source_url: source_url,
    parent_id: parent_id,
    body_html: body_html, // Always send as body_html
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(noteData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[LLM Joplin API] Error creating note:", response.status, errorText);
      throw new Error(`Failed to create Joplin note: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    if (DEBUG_API) console.log("[LLM Joplin API] Note created:", result);
    return result;
  } catch (error) {
    console.error("[LLM Joplin API] Network error during note creation:", error);
    throw new Error(`Network error or invalid Joplin API URL. Ensure Joplin is running and API is enabled: ${error.message}`);
  }
}

// Pricing functions moved to js/pricingService.js
// Utility functions moved to js/backgroundUtils.js
