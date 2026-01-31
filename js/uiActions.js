// js/uiActions.js
import { Logger } from "./logger.js";

export function handleOpenChatTab(sendResponse, DEBUG = false) {
  Logger.debug("[LLM UI Actions]", "Handling openChatTab request.");
  chrome.tabs.create(
    { url: chrome.runtime.getURL("chat.html") },
    (newTab) => {
      if (DEBUG) {
        Logger.info("[LLM UI Actions]", "Chat tab opened:", newTab.id);
      }
      try {
        sendResponse({ status: "opened", tabId: newTab.id });
      } catch (e) {
        if (DEBUG) {
          Logger.warn("[LLM UI Actions]", "Failed to send openChatTab response:", e.message);
        }
      }
    },
  );
}

export function handleOpenOptionsPage(sendResponse, DEBUG = false) {
  Logger.debug("[LLM UI Actions]", "Handling openOptionsPage request.");
  chrome.runtime.openOptionsPage();
  Logger.debug("[LLM UI Actions]", "Options page opened.");
  try {
    sendResponse({ status: "options page opened" });
  } catch (e) {
    if (DEBUG) {
      Logger.warn("[LLM UI Actions]", "Failed to send openOptionsPage response:", e.message);
    }
  }
}
