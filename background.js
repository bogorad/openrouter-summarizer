// background.js
import {
  numToWord,
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE
} from "./constants.js";
import { initDebugMode, logDebug, logError } from "./utils/errorHandling.js";
import { getSettings, getChatContext } from "./services/settingsService.js";
import { getModelPricing, updateModelPricing } from "./services/modelService.js";
import { processChatStream, abortChatRequest, storeChatContext } from "./services/chatService.js";
import { sendChatRequest, sendSummaryRequest } from "./services/apiService.js";

console.log(`[LLM Background] Service Worker Start (v3.4.0 - Modular Architecture)`);

// Initialize debug mode
initDebugMode();

// Set up context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
    contexts: ["all"],
  });

  // Check API key on install/update
  getSettings().then(settings => {
    if (!settings.apiKey) {
      chrome.runtime.openOptionsPage();
    }
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sendToLLM" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
  }
});

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Log incoming message if debug mode is enabled
  logDebug("Received message", { action: request.action, sender });

  // Route messages to appropriate handlers
  switch (request.action) {
    case "getSettings":
      getSettings().then(sendResponse);
      return true;

    case "getChatContext":
      getChatContext().then(sendResponse);
      return true;

    case "getModelPricing":
      getModelPricing(request.modelId)
        .then(sendResponse)
        .catch(error => sendResponse(error));
      return true;

    case "updateKnownModelsAndPricing":
      updateModelPricing()
        .then(sendResponse)
        .catch(error => sendResponse(error));
      return true;

    case "llmChatStream":
      processChatStream(request.messages, request.model, sender.tab.id)
        .then(sendResponse)
        .catch(error => {
          logError("Chat stream failed", error);
          sendResponse({ status: "error", message: error.message });
        });
      return true;

    case "abortChatRequest":
      abortChatRequest()
        .then(sendResponse)
        .catch(error => {
          logError("Abort chat request failed", error);
          sendResponse({ status: "error", message: error.message });
        });
      return true;

    case "storeChatContext":
      storeChatContext(
        request.domSnippet,
        request.summary,
        request.modelUsedForSummary,
        request.chatTargetLanguage
      )
        .then(() => sendResponse({ status: "success" }))
        .catch(error => {
          logError("Store chat context failed", error);
          sendResponse({ status: "error", message: error.message });
        });
      return true;

    case "summarizeHTML":
      // Prepare the prompt with the correct bullet count word
      getSettings().then(settings => {
        const bulletCount = settings.bulletCount || "5";
        const bulletWord = numToWord[bulletCount] || "five";

        // Replace placeholder in prompt template
        let prompt = settings[PROMPT_STORAGE_KEY_PREAMBLE] || "";
        prompt = prompt.replace("${bulletWord}", bulletWord);

        // Add format instructions and postamble
        prompt += "\n" + settings[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] || "";
        prompt += "\n" + settings[PROMPT_STORAGE_KEY_POSTAMBLE] || "";

        // Send the summary request
        sendSummaryRequest(request.html, prompt, request.model)
          .then(sendResponse)
          .catch(error => {
            logError("Summary request failed", error);
            sendResponse({ status: "error", message: error.message });
          });
      });
      return true;

    default:
      logDebug(`Unknown action: ${request.action}`);
      sendResponse({ status: "error", message: "Unknown action" });
      return false;
  }
});
