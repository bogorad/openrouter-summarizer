// js/uiActions.js

export function handleOpenChatTab(sendResponse, DEBUG = false) {
  if (DEBUG) console.log("[LLM UI Actions] Handling openChatTab request.");
  chrome.tabs.create(
    { url: chrome.runtime.getURL("chat.html") },
    (newTab) => {
      if (DEBUG) {
        console.log("[LLM UI Actions] Chat tab opened:", newTab.id);
      }
      try {
        sendResponse({ status: "opened", tabId: newTab.id });
      } catch (e) {
        if (DEBUG) {
          console.warn("[LLM UI Actions] Failed to send openChatTab response:", e.message);
        }
      }
    },
  );
}

export function handleOpenOptionsPage(sendResponse, DEBUG = false) {
  if (DEBUG) console.log("[LLM UI Actions] Handling openOptionsPage request.");
  chrome.runtime.openOptionsPage();
  if (DEBUG) console.log("[LLM UI Actions] Options page opened.");
  try {
    sendResponse({ status: "options page opened" });
  } catch (e) {
    if (DEBUG) {
      console.warn("[LLM UI Actions] Failed to send openOptionsPage response:", e.message);
    }
  }
}