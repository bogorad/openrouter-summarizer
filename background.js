const DEFAULT_PROMPT = "Summarize this article in 5 bullet points. Ignore HTML tags. Do not comment on output.";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
    contexts: ["all"]
  });

  chrome.storage.sync.get(['model', 'prompt'], data => {
    const model = data.model;
    const prompt = data.prompt;
    const updates = {};

    if (!model || model.trim() === '') {
      updates.model = "google/gemini-2.0-flash-lite-001";
      console.log('Model not set, assigning the default of google/gemini-2.0-flash-lite-001.');
    }

    if (!prompt || prompt.trim() === '') {
      updates.prompt = DEFAULT_PROMPT;
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.sync.set(updates, () => {
        console.log('Initialized defaults:', updates);
      });

      // Open options on fresh install / new settings
      chrome.runtime.openOptionsPage();
    } else {
      console.log('Model and prompt already set, no defaults needed.');
    }
  });
});

// context menu click event
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sendToLLM") {
    chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
  }
});

// toolbar icon click event
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
});

