// services/chatService.js
import { sendChatRequest } from "./apiService.js";
import { logDebug, logError, isTabClosedError } from "../utils/errorHandling.js";
import { saveChatContext } from "./settingsService.js";

/**
 * Process chat stream
 * @param {Array} messages - Chat messages
 * @param {string} model - Model ID
 * @param {number} tabId - Tab ID to send response to
 * @returns {Promise<Object>} Chat response
 */
export async function processChatStream(messages, model, tabId) {
  try {
    const controller = new AbortController();
    const signal = controller.signal;
    
    // Store controller for potential abort
    chrome.storage.session.set({ abortController: controller });
    
    // Send request and process response
    const response = await sendChatRequest(messages, model, signal);
    
    if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
      throw new Error("Invalid response format from API");
    }
    
    const messageContent = response.choices[0].message.content;
    
    // Send response to tab
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: "chatResponse",
        response: messageContent,
        status: "success",
      });
    } catch (error) {
      if (isTabClosedError(error)) {
        logDebug("Tab closed, cannot send chat response");
      } else {
        throw error;
      }
    }
    
    return { status: "success" };
  } catch (error) {
    logError("Chat stream processing failed", error);
    
    // Send error to tab if possible
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: "chatResponse",
        status: "error",
        message: error.message,
      });
    } catch (sendError) {
      if (!isTabClosedError(sendError)) {
        logError("Failed to send error to tab", sendError);
      }
    }
    
    return { status: "error", message: error.message };
  }
}

/**
 * Abort ongoing chat request
 * @returns {Promise<Object>} Abort result
 */
export async function abortChatRequest() {
  return new Promise((resolve) => {
    chrome.storage.session.get(["abortController"], (data) => {
      if (data.abortController) {
        try {
          data.abortController.abort();
          logDebug("Chat request aborted");
          resolve({ status: "success", message: "Request aborted" });
        } catch (error) {
          logError("Failed to abort chat request", error);
          resolve({ status: "error", message: "Failed to abort request" });
        }
      } else {
        logDebug("No active chat request to abort");
        resolve({ status: "warning", message: "No active request to abort" });
      }
    });
  });
}

/**
 * Store chat context for a new chat
 * @param {string} domSnippet - Original HTML snippet
 * @param {string} summary - Summary text
 * @param {string} modelUsedForSummary - Model used for summary
 * @param {string} chatTargetLanguage - Target language for chat
 * @returns {Promise<void>}
 */
export async function storeChatContext(domSnippet, summary, modelUsedForSummary, chatTargetLanguage = "") {
  const context = {
    domSnippet,
    summary,
    modelUsedForSummary,
    chatTargetLanguage,
    timestamp: Date.now(),
  };
  
  await saveChatContext(context);
  logDebug("Chat context stored", { 
    snippetLength: domSnippet?.length || 0,
    summaryLength: summary?.length || 0,
    model: modelUsedForSummary,
    language: chatTargetLanguage
  });
}
