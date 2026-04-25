// background.js
import {
  CHAT_SYSTEM_PROMPT_TEMPLATE,
  CHAT_USER_CONTEXT_TEMPLATE,
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_DEBUG,
  STORAGE_KEY_PROMPT_TEMPLATE,
  DEFAULT_XML_PROMPT_TEMPLATE,
  STORAGE_KEY_NEWSBLUR_TOKEN,
  STORAGE_KEY_JOPLIN_TOKEN,
} from "./constants.js";

import {
  isTabClosedError,
  getSystemPrompt,
} from "./js/backgroundUtils.js";
import {
  createJoplinNote,
  fetchJoplinFolders,
} from "./js/integrations/joplinClient.js";
import { normalizeIntegrationError } from "./js/integrations/integrationErrors.js";
import { shareToNewsblur } from "./js/integrations/newsblurClient.js";
import {
  RuntimeMessageActions,
  TabMessageActions,
} from "./js/messaging/actions.js";
import {
  createMessageRouter,
  rawMessageResponse,
} from "./js/messaging/router.js";
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
import { ErrorHandler, ErrorSeverity, handleLastError } from "./js/errorHandler.js";
import { Logger, setDebugMode } from "./js/logger.js";
import {
  SECRET_JOPLIN_TOKEN,
  SECRET_NEWSBLUR_TOKEN,
  SECRET_OPENROUTER_API_KEY,
  SECRET_LOAD_STATUS_MISSING,
  SECRET_LOAD_STATUS_STORAGE_UNAVAILABLE,
  loadJoplinToken,
  loadNewsblurToken,
  loadOpenRouterApiKey,
  saveSecret,
} from "./js/state/secretStore.js";
import {
  loadSettings,
  migrateSettings,
  saveSettings,
} from "./js/state/settingsStore.js";

Logger.info("[LLM Background]", "Service Worker Start (v3.9.45)");

let DEBUG = false;

const createTokenLoadErrorResponse = (tokenResult, label) => ({
  status: "error",
  code: "token_load_failed",
  tokenStatus: tokenResult.status,
  message: `Failed to load stored ${label}: ${tokenResult.error || "Unknown storage error."}`,
});

const hasUsableTokenResult = (tokenResult) =>
  tokenResult.success ||
  tokenResult.status === SECRET_LOAD_STATUS_MISSING ||
  tokenResult.status === SECRET_LOAD_STATUS_STORAGE_UNAVAILABLE;

const refreshDebugState = async (request, sender) => {
  const settings = await loadSettings();
  DEBUG = !!settings[STORAGE_KEY_DEBUG];
  setDebugMode(DEBUG);

  if (DEBUG) {
    Logger.info(
      "[LLM Background]",
      "Received message:",
      request.action,
      "from sender:",
      sender,
    );
  }

  return DEBUG;
};

const createLegacyHandler = (handler) => async (request, sender, context) => {
  const currentDebug = await context.refreshDebugState(request, sender);

  return new Promise((resolve, reject) => {
    let didRespond = false;
    const respond = (response) => {
      if (didRespond) {
        if (currentDebug) {
          Logger.warn("[LLM Background]", "Duplicate handler response ignored:", request.action);
        }
        return;
      }

      didRespond = true;
      resolve(rawMessageResponse(response));
    };

    try {
      const result = handler(request, sender, respond, currentDebug);
      if (result && typeof result.then === "function") {
        result.catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
};

const backgroundMessageRouter = createMessageRouter({
  context: { refreshDebugState },
});

// Initial debug state load
loadSettings().then((settings) => {
  DEBUG = !!settings[STORAGE_KEY_DEBUG];
  setDebugMode(DEBUG);
}).catch((error) => {
  Logger.error("[LLM Background]", "Failed to load initial debug setting:", error);
});

// Migration: Move tokens from sync to encrypted local storage.
// Removes each legacy sync token after its matching secretStore save succeeds.
async function migrateTokensToEncryptedStorage() {
  try {
    const syncData = await chrome.storage.sync.get([
      STORAGE_KEY_API_KEY,
      STORAGE_KEY_NEWSBLUR_TOKEN,
      STORAGE_KEY_JOPLIN_TOKEN,
    ]);

    const tokensToMigrate = [
      { syncKey: STORAGE_KEY_API_KEY, secretName: SECRET_OPENROUTER_API_KEY },
      { syncKey: STORAGE_KEY_NEWSBLUR_TOKEN, secretName: SECRET_NEWSBLUR_TOKEN },
      { syncKey: STORAGE_KEY_JOPLIN_TOKEN, secretName: SECRET_JOPLIN_TOKEN },
    ].filter(t => syncData[t.syncKey]);

    if (tokensToMigrate.length === 0) {
      return; // Nothing to migrate
    }

    for (const { syncKey, secretName } of tokensToMigrate) {
      const saveResult = await saveSecret(secretName, syncData[syncKey]);
      if (!saveResult.success) {
        Logger.error("[Migration]", `Secret migration failed for ${syncKey}:`, saveResult.error);
        return;
      }

      await chrome.storage.sync.remove(syncKey);
    }

    Logger.info("[Migration]", `Successfully migrated ${tokensToMigrate.length} token(s) to encrypted local storage`);
  } catch (e) {
    // Keep sync tokens on any error - user can retry migration on next install/update
    Logger.error("[Migration]", "Token migration failed, keeping sync tokens:", e);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  // Run migration first
  await migrateTokensToEncryptedStorage();
  const settingsMigration = await migrateSettings();

  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
  });
  DEBUG = !!settingsMigration.settings[STORAGE_KEY_DEBUG];
  setDebugMode(DEBUG);

  const apiKeyResult = await loadOpenRouterApiKey();
  if (!apiKeyResult.success) {
    Logger.error("[LLM Background]", "Failed to load API key:", apiKeyResult.error);
  }

  if (!apiKeyResult.data) {
    chrome.runtime.openOptionsPage(); // Open options page if API key is missing
  }
  if (DEBUG) {
    Logger.info("[LLM Background]", "Checking initial settings on install/update.");
  }

  // Handle prompt template reset on extension load/update:
  // - Preserve user's custom formatting in <user_formatting> section
  // - Reset pre-prompt and post-prompt to current defaults
  // This ensures system templates update while keeping user customizations
  const data = await loadSettings();
  const currentPromptTemplate = data[STORAGE_KEY_PROMPT_TEMPLATE];
  const initialSettings = {};
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
        Logger.info("[LLM Background]", "Extracted user formatting content for preservation");
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
        Logger.info("[LLM Background]", "Reset prompt template with preserved user formatting");
      }
    } else {
      // Fallback: use completely new default template
      initialSettings[STORAGE_KEY_PROMPT_TEMPLATE] = DEFAULT_XML_PROMPT_TEMPLATE;
      if (DEBUG) {
        Logger.info("[LLM Background]", "Reset prompt template to complete default (no user formatting preserved)");
      }
    }
  } else {
    // No existing template, set default
    initialSettings[STORAGE_KEY_PROMPT_TEMPLATE] = DEFAULT_XML_PROMPT_TEMPLATE;
    if (DEBUG) {
      Logger.info("[LLM Background]", "Set default prompt template (first install)");
    }
  }

  // Only set if there are new initial settings to save
  if (Object.keys(initialSettings).length > 0) {
    try {
      await saveSettings(initialSettings);
      if (handleLastError("setInitialSettings", DEBUG)) {
        ErrorHandler.handle(
          new Error(chrome.runtime.lastError.message),
          "onInstalled",
          ErrorSeverity.WARNING,
          false
        );
      } else if (DEBUG) {
        // Only log success if DEBUG is true
        Logger.info("[LLM Background]", "Initial default settings applied:", initialSettings);
      }
    } catch (error) {
      ErrorHandler.handle(
        error,
        "onInstalled",
        ErrorSeverity.WARNING,
        false,
      );
    }
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sendToLLM" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: TabMessageActions.processSelection });
  }
});

backgroundMessageRouter
  .register(RuntimeMessageActions.getSettings, createLegacyHandler((request, sender, sendResponse, currentDebug) => {
    if (currentDebug) {
      Logger.info("[LLM Background]", "Calling handleGetSettings.");
    }
    return handleGetSettings(sendResponse, currentDebug);
  }))
  .register(RuntimeMessageActions.getChatContext, createLegacyHandler((request, sender, sendResponse, currentDebug) =>
    handleGetChatContext(sendResponse, currentDebug)
  ))
  .register(RuntimeMessageActions.getModelPricing, createLegacyHandler((request, sender, sendResponse, currentDebug) =>
    handleGetModelPricing(request, sendResponse, currentDebug)
  ))
  .register(RuntimeMessageActions.updateKnownModelsAndPricing, createLegacyHandler((request, sender, sendResponse, currentDebug) =>
    handleUpdateKnownModelsAndPricing(sendResponse, currentDebug)
  ))
  .register(RuntimeMessageActions.llmChatStream, createLegacyHandler((request, sender, sendResponse, currentDebug) =>
    handleLlmChatStream(request, sendResponse, currentDebug)
  ))
  .register(RuntimeMessageActions.abortChatRequest, createLegacyHandler((request, sender, sendResponse, currentDebug) =>
    handleAbortChatRequest(request, sendResponse, currentDebug)
  ))
  .register(RuntimeMessageActions.setChatContext, createLegacyHandler((request, sender, sendResponse, currentDebug) =>
    handleSetChatContext(request, sendResponse, currentDebug)
  ))
  .register(RuntimeMessageActions.openChatTab, createLegacyHandler((request, sender, sendResponse, currentDebug) =>
    handleOpenChatTab(sendResponse, currentDebug)
  ))
  .register(RuntimeMessageActions.openOptionsPage, createLegacyHandler((request, sender, sendResponse, currentDebug) =>
    handleOpenOptionsPage(sendResponse, currentDebug)
  ))
  .register(RuntimeMessageActions.requestSummary, createLegacyHandler((request, sender, sendResponse, currentDebug) =>
    handleRequestSummary(request, sender, sendResponse, currentDebug)
  ))
  .register(RuntimeMessageActions.fetchJoplinNotebooks, createLegacyHandler(async (request, sender, sendResponse, currentDebug) => {
    Logger.debug("[LLM Background]", "Received fetchJoplinNotebooks request.");
    try {
      const tokenResult = await loadJoplinToken();
      if (!hasUsableTokenResult(tokenResult)) {
        Logger.error("[LLM Background]", "Failed to load Joplin token:", tokenResult.error);
        sendResponse(createTokenLoadErrorResponse(tokenResult, "Joplin token"));
        return;
      }
      const folders = await fetchJoplinFolders(tokenResult.data, { debug: currentDebug });
      sendResponse({ status: "success", folders: folders });
    } catch (error) {
      Logger.error("[LLM Background]", "fetchJoplinNotebooks handler caught an error:", error);
      sendResponse(normalizeIntegrationError("joplin", error));
    }
  }))
  .register(RuntimeMessageActions.createJoplinNote, createLegacyHandler(async (request, sender, sendResponse, currentDebug) => {
    Logger.debug("[LLM Background]", "Received createJoplinNote request.", request);
    try {
      const tokenResult = await loadJoplinToken();
      if (!hasUsableTokenResult(tokenResult)) {
        Logger.error("[LLM Background]", "Failed to load Joplin token:", tokenResult.error);
        sendResponse(createTokenLoadErrorResponse(tokenResult, "Joplin token"));
        return;
      }
      const result = await createJoplinNote({
        joplinToken: tokenResult.data,
        title: request.title,
        source_url: request.source_url,
        body_html: request.body_html,
        parent_id: request.parent_id,
      }, { debug: currentDebug });
      sendResponse({ status: "success", result: result });
    } catch (error) {
      Logger.error("[LLM Background]", "createJoplinNote handler caught an error:", error);
      sendResponse(normalizeIntegrationError("joplin", error));
    }
  }))
  .register(RuntimeMessageActions.getNewsblurToken, createLegacyHandler(async (request, sender, sendResponse) => {
    try {
      const tokenResult = await loadNewsblurToken();
      if (!hasUsableTokenResult(tokenResult)) {
        Logger.error("[LLM Background]", "Failed to load NewsBlur token:", tokenResult.error);
        sendResponse(createTokenLoadErrorResponse(tokenResult, "NewsBlur token"));
        return;
      }
      sendResponse({
        status: "success",
        hasNewsblurToken: typeof tokenResult.data === "string" && tokenResult.data.trim() !== "",
      });
    } catch (e) {
      Logger.error("[LLM Background]", "Error getting NewsBlur token:", e);
      sendResponse({
        status: "error",
        message: `Failed to get NewsBlur token: ${e.message}`,
      });
    }
  }))
  .register(RuntimeMessageActions.getJoplinToken, createLegacyHandler(async (request, sender, sendResponse) => {
    try {
      const tokenResult = await loadJoplinToken();
      if (!hasUsableTokenResult(tokenResult)) {
        Logger.error(
          "[LLM Background]",
          "Failed to load Joplin token:",
          tokenResult.error,
        );
        sendResponse(createTokenLoadErrorResponse(tokenResult, "Joplin token"));
        return;
      }
      sendResponse({
        status: "success",
        hasJoplinToken: typeof tokenResult.data === "string" && tokenResult.data.trim() !== "",
      });
    } catch (e) {
      Logger.error("[LLM Background]", "getJoplinToken handler caught an error:", e);
      sendResponse({
        status: "error",
        message: `Failed to load Joplin token: ${e.message}`,
      });
    }
  }))
  .register(RuntimeMessageActions.shareToNewsblur, createLegacyHandler(async (request, sender, sendResponse, currentDebug) => {
    if (currentDebug) {
      Logger.info("[LLM Background]", "Received shareToNewsblur request:", request.options);
    }
    try {
      const apiResult = await shareToNewsblur(request.options, {
        debug: currentDebug,
        loadToken: loadNewsblurToken,
      });
      if (apiResult?.code < 0 || apiResult?.result === "error") {
        sendResponse(normalizeIntegrationError("newsblur", apiResult));
        return;
      }
      sendResponse({ status: "success", result: apiResult });
    } catch (error) {
      Logger.error("[LLM Background]", "shareToNewsblur handler caught an error:", error);
      sendResponse(normalizeIntegrationError("newsblur", error));
    }
  }));

// --- Message Listener ---
chrome.runtime.onMessage.addListener(
  backgroundMessageRouter.createRuntimeListener(),
);

// Pricing functions moved to js/pricingService.js
// Utility functions moved to js/backgroundUtils.js
