import {
  DEFAULT_MODEL_OPTIONS,
  LANGUAGES_JSON_PATH,
  SVG_PATH_PREFIX,
  FALLBACK_SVG_PATH,
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_POSTAMBLE_TEXT,
  DEFAULT_FORMAT_INSTRUCTIONS,
  DEFAULT_PREPOPULATE_LANGUAGES,
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
} from "./constants.js";

console.log(`[LLM Background] Service Worker Start`);

let ALL_LANGUAGES_MAP = {};
let ALL_LANGUAGES_ARRAY = [];
let ALL_LANGUAGE_NAMES_MAP = {};
let DEBUG = false;

const DEFAULT_BULLET_COUNT = "5";
const DEFAULT_DEBUG_MODE = false;

async function loadLanguageData() {
  try {
    const url = chrome.runtime.getURL(LANGUAGES_JSON_PATH);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
    const data = await response.json();
    ALL_LANGUAGES_MAP = data;
    ALL_LANGUAGES_ARRAY = Object.keys(data).map((name) => ({
      code: data[name],
      name: name,
    }));
    ALL_LANGUAGE_NAMES_MAP = Object.keys(data).reduce((map, name) => {
      map[name.toLowerCase()] = { code: data[name], name: name };
      return map;
    }, {});
  } catch (error) {
    console.error("[LLM Background] Error loading language data:", error);
    ALL_LANGUAGES_MAP = {};
    ALL_LANGUAGES_ARRAY = [];
    ALL_LANGUAGE_NAMES_MAP = {};
  }
}

chrome.storage.sync.get("debug", (data) => {
  DEBUG = !!data.debug;
  loadLanguageData();
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
    contexts: ["all"],
  });
  chrome.storage.sync.get(["apiKey", "debug"], (data) => {
    DEBUG = !!data.debug;
    if (!data.apiKey) {
      chrome.runtime.openOptionsPage();
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sendToLLM" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  chrome.storage.sync.get("debug", (result) => {
    DEBUG = !!result.debug;
    if (DEBUG) console.log("[LLM Background] Received message:", request.action, "from sender:", sender);

    if (request.action === "getSettings") {
      if (DEBUG) console.log("[LLM Background] Handling getSettings request.");
      const keysToFetch = [
        "apiKey",
        "model",
        "models",
        "debug",
        "bulletCount",
        "availableLanguages",
        PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
        PROMPT_STORAGE_KEY_PREAMBLE,
        PROMPT_STORAGE_KEY_POSTAMBLE,
        PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
      ];
      chrome.storage.sync.get(keysToFetch, (data) => {
        if (DEBUG) console.log("[LLM Background] Storage data retrieved:", { ...data, apiKey: data.apiKey ? "[API Key Hidden]" : undefined });
        let loadedModels = DEFAULT_MODEL_OPTIONS;
        if (
          Array.isArray(data.models) &&
          data.models.length > 0 &&
          data.models.every(
            (m) => typeof m === "object" && m !== null && typeof m.id === "string",
          )
        ) {
          loadedModels = data.models.map((m) => ({
            id: m.id,
            label: typeof m.label === "string" && m.label.trim() !== "" ? m.label : m.id,
          }));
        }
        let finalSelectedModel = "";
        const availableModelIds = loadedModels.map((m) => m.id);
        if (data.model && availableModelIds.includes(data.model)) {
          finalSelectedModel = data.model;
        } else if (loadedModels.length > 0) {
          finalSelectedModel = loadedModels[0].id;
        }
        const settings = {
          apiKey: data.apiKey || "",
          model: finalSelectedModel,
          models: loadedModels,
          debug: DEBUG,
          bulletCount: data.bulletCount || DEFAULT_BULLET_COUNT,
          availableLanguages: Array.isArray(data.availableLanguages) ? data.availableLanguages : DEFAULT_PREPOPULATE_LANGUAGES.filter(name => ALL_LANGUAGE_NAMES_MAP[name.toLowerCase()]),
          [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]: data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] || data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] || DEFAULT_FORMAT_INSTRUCTIONS,
          [PROMPT_STORAGE_KEY_PREAMBLE]: data[PROMPT_STORAGE_KEY_PREAMBLE] || DEFAULT_PREAMBLE_TEMPLATE,
          [PROMPT_STORAGE_KEY_POSTAMBLE]: data[PROMPT_STORAGE_KEY_POSTAMBLE] || DEFAULT_POSTAMBLE_TEXT,
          [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]: data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] || DEFAULT_FORMAT_INSTRUCTIONS,
        };
        if (DEBUG) console.log("[LLM Background] Sending settings response.");
        sendResponse(settings);
      });
      return true;  // Ensure this is returned if needed for async
    } else if (request.action === "getChatContext") {
      if (DEBUG) console.log("[LLM Background] Handling getChatContext request.");
      chrome.storage.sync.get(["models"], (syncData) => {
        if (DEBUG) console.log("[LLM Background] Sync data for models:", syncData);
        chrome.storage.session.get(["chatContext"], (sessionData) => {
          if (DEBUG) console.log("[LLM Background] Session data for chatContext:", sessionData);
          const storedContext = sessionData.chatContext || {};
          let modelsToSend = DEFAULT_MODEL_OPTIONS;
          if (
            Array.isArray(syncData.models) &&
            syncData.models.length > 0 &&
            syncData.models.every(
              (m) => typeof m === "object" && m !== null && typeof m.id === "string",
            )
          ) {
            modelsToSend = syncData.models.map((m) => ({
              id: m.id,
              label: typeof m.label === "string" && m.label.trim() !== "" ? m.label : m.id,
            }));
          }
          sendResponse({
            domSnippet: storedContext.domSnippet,
            summary: storedContext.summary,
            chatTargetLanguage: storedContext.chatTargetLanguage,
            models: modelsToSend,
            debug: DEBUG,
          });
        });
      });
      return true;
    } else if (request.action === "getLanguageData") {
      if (DEBUG) console.log("[LLM Background] Handling getLanguageData request.");
      sendResponse({
        ALL_LANGUAGES_MAP: ALL_LANGUAGES_MAP,
        ALL_LANGUAGE_NAMES_MAP: ALL_LANGUAGE_NAMES_MAP,
        SVG_PATH_PREFIX: chrome.runtime.getURL(SVG_PATH_PREFIX),
        FALLBACK_SVG_PATH: chrome.runtime.getURL(FALLBACK_SVG_PATH),
      });
      if (DEBUG) console.log("[LLM Background] Sending language data response.");
    } else if (request.action === "llmChatStream") {
      if (DEBUG) console.log("[LLM Background] Handling llmChatStream request with messages:", request.messages.length, "messages.");
      chrome.storage.sync.get("apiKey", (storageResult) => {
        if (DEBUG) console.log("[LLM Background] Retrieved from storage:", { apiKey: storageResult.apiKey ? "[API Key Hidden]" : "undefined" });
        const apiKey = storageResult.apiKey;
        if (!apiKey) {
          console.error("[LLM Background] API key is missing in storage.");
          sendResponse({ status: "error", message: "API key is required and not found in storage." });
          return;
        }
        const controller = new AbortController();
        const signal = controller.signal;
        // Store the controller for potential abort
        chrome.storage.session.set({ abortController: controller }, () => {
          if (DEBUG) console.log("[LLM Background] AbortController stored for potential abort.");
        });
        const payload = {
          model: request.model,
          messages: request.messages,
          structured_outputs: "true",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "list_of_strings",
              strict: true,
              schema: {
                type: "array",
                items: {
                  type: "string"
                },
                minItems: 5,
                maxItems: 5
              }
            }
          }
        };
        if (DEBUG) console.log("[LLM Background] Sending payload to OpenRouter:", payload);
        fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
            "X-Title": "OR-Summ",
          },
          body: JSON.stringify(payload),
          signal: signal
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (DEBUG) console.log("[LLM Background] Fetch response data:", data);
          try {
            sendResponse({ status: "success", data });
          } catch (e) {
            if (DEBUG) console.warn("[LLM Background] Failed to send response, receiving end may no longer exist:", e.message);
          }
          // Clear the controller after successful response
          chrome.storage.session.remove("abortController", () => {
            if (DEBUG) console.log("[LLM Background] AbortController cleared after successful response.");
          });
        })
        .catch(error => {
          if (DEBUG) console.error("[LLM Background] Error in fetch:", error);
          try {
            sendResponse({ status: "error", message: error.message });
          } catch (e) {
            if (DEBUG) console.warn("[LLM Background] Failed to send error response, receiving end may no longer exist:", e.message);
          }
          // Clear the controller on error
          chrome.storage.session.remove("abortController", () => {
            if (DEBUG) console.log("[LLM Background] AbortController cleared after error.");
          });
        });
      });
      if (DEBUG) console.log("[LLM Background] llmChatStream processing initiated.");
    } else if (request.action === "abortChatRequest") {
      if (DEBUG) console.log("[LLM Background] Handling abortChatRequest.");
      chrome.storage.session.get("abortController", (data) => {
        const controller = data.abortController;
        if (controller) {
          controller.abort();
          if (DEBUG) console.log("[LLM Background] AbortController triggered abort.");
          chrome.storage.session.remove("abortController", () => {
            if (DEBUG) console.log("[LLM Background] AbortController cleared after abort.");
          });
          try {
            sendResponse({ status: "aborted" });
          } catch (e) {
            if (DEBUG) console.warn("[LLM Background] Failed to send abort response, receiving end may no longer exist:", e.message);
          }
        } else {
          if (DEBUG) console.log("[LLM Background] No active request to abort.");
          try {
            sendResponse({ status: "no active request" });
          } catch (e) {
            if (DEBUG) console.warn("[LLM Background] Failed to send no active request response, receiving end may no longer exist:", e.message);
          }
        }
      });
      return true;
    } else if (request.action === "setChatContext") {
      if (DEBUG) console.log("[LLM Background] Handling setChatContext request.");
      chrome.storage.session.set(
        { chatContext: request },
        () => {
          if (DEBUG) console.log("[LLM Background] Chat context set in session storage.");
          try {
            sendResponse({ status: "ok" });
          } catch (e) {
            if (DEBUG) console.warn("[LLM Background] Failed to send setChatContext response, receiving end may no longer exist:", e.message);
          }
        }
      );
      return true;
    } else if (request.action === "openChatTab") {
      if (DEBUG) console.log("[LLM Background] Handling openChatTab request.");
      chrome.tabs.create({ url: chrome.runtime.getURL("chat.html") }, (newTab) => {
        if (DEBUG) console.log("[LLM Background] Chat tab opened:", newTab.id);
        try {
          sendResponse({ status: "opened", tabId: newTab.id });
        } catch (e) {
          if (DEBUG) console.warn("[LLM Background] Failed to send openChatTab response, receiving end may no longer exist:", e.message);
        }
      });
      return true;
    } else if (request.action === "openOptionsPage") {
      if (DEBUG) console.log("[LLM Background] Handling openOptionsPage request.");
      chrome.runtime.openOptionsPage();
      if (DEBUG) console.log("[LLM Background] Options page opened.");
      try {
        sendResponse({ status: "options page opened" });
      } catch (e) {
        if (DEBUG) console.warn("[LLM Background] Failed to send openOptionsPage response, receiving end may no longer exist:", e.message);
      }
    }
    if (DEBUG) console.log("[LLM Background] Message handler completed for action:", request.action);
  });
  return true;
});
