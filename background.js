// background.js
const VER = "v2.26"; // Or appropriate version reflecting these changes
const LASTUPD =
  "Update DEBUG state reliably, simplify stream handler debug fetch";

// --- Existing imports start here ---
import {
  DEFAULT_MODEL_OPTIONS,
  LANGUAGES_JSON_PATH,
  SVG_PATH_PREFIX,
  FALLBACK_SVG_PATH,
  // --- Added Imports for Settings Defaults ---
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_POSTAMBLE_TEXT,
  DEFAULT_FORMAT_INSTRUCTIONS,
  DEFAULT_PREPOPULATE_LANGUAGES,
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  // --- End Added Imports ---
} from "./constants.js";

console.log(`[LLM Background] Service Worker Start (${VER})`);

// --- Language Data Storage ---
let ALL_LANGUAGES_MAP = {};
let ALL_LANGUAGES_ARRAY = [];
let ALL_LANGUAGE_NAMES_MAP = {};

// --- Debug State ---
let DEBUG = false; // Global DEBUG state

// --- Constants for Settings ---
const DEFAULT_BULLET_COUNT = "5";
const DEFAULT_DEBUG_MODE = false;

// --- Language Data Loading ---
async function loadLanguageData() {
  try {
    const url = chrome.runtime.getURL(LANGUAGES_JSON_PATH);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch languages.json: ${response.statusText} (${response.status})`,
      );
    }
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
    if (DEBUG)
      console.log(
        `[LLM Background] Successfully loaded ${ALL_LANGUAGES_ARRAY.length} languages.`,
      );
  } catch (error) {
    console.error("[LLM Background] Error loading language data:", error);
    ALL_LANGUAGES_MAP = {};
    ALL_LANGUAGES_ARRAY = [];
    ALL_LANGUAGE_NAMES_MAP = {};
  }
}

// --- Initial Setup ---
chrome.storage.sync.get("debug", (data) => {
  DEBUG = !!data.debug; // Initialize global DEBUG
  if (DEBUG) console.log("[LLM Background] Debug mode initially:", DEBUG);
  loadLanguageData();
});

// --- Service Worker Lifecycle ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
    contexts: ["all"],
  });
  chrome.storage.sync.get(["apiKey", "debug"], (data) => {
    DEBUG = !!data.debug; // Update debug state on install/update
    if (!data.apiKey) {
      if (DEBUG)
        console.log(
          "[LLM Background] API key not found on install/update, opening options.",
        );
      chrome.runtime.openOptionsPage();
    } else {
      if (DEBUG) console.log("[LLM Background] API key found.");
    }
  });
});

// --- Context Menu & Toolbar Icon Click Events ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sendToLLM") {
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
    } else {
      console.warn(
        "[LLM Background] Context menu clicked but tab ID is missing.",
      );
    }
  }
});
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) {
    console.warn(
      "[LLM Background] Toolbar icon clicked but tab ID is missing.",
    );
    return;
  }
  chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
});

// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // --- *** Update Global DEBUG State at the Start of Handler *** ---
  // Fetch the latest debug setting before processing any message action
  const getDebugPromise = new Promise((resolve) => {
    chrome.storage.sync.get("debug", (result) => {
      if (!chrome.runtime.lastError) {
        const newDebugState = !!result.debug;
        if (newDebugState !== DEBUG) {
          if (newDebugState)
            console.log(
              "[LLM Background] DEBUG state updated to true via storage check.",
            ); // Log activation
          DEBUG = newDebugState; // Update global DEBUG
        }
      } else {
        console.error(
          "[LLM Background] Error fetching debug state in listener:",
          chrome.runtime.lastError,
        );
      }
      resolve(); // Resolve promise whether fetch worked or not
    });
  });

  // Process the actual message *after* ensuring the debug state is updated
  getDebugPromise.then(() => {
    // --- Now use the updated global DEBUG for conditional logging ---

    // --- Get Core Settings ---
    if (request.action === "getSettings") {
      if (DEBUG) console.log("[LLM Background] Received getSettings request.");
      const keysToFetch = [
        "apiKey",
        "model",
        "models", // Fetch models array of objects
        "debug",
        "bulletCount",
        "availableLanguages",
        PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
        PROMPT_STORAGE_KEY_PREAMBLE,
        PROMPT_STORAGE_KEY_POSTAMBLE,
        PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
      ];
      chrome.storage.sync.get(keysToFetch, (data) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[LLM Background] Error getting settings:",
            chrome.runtime.lastError,
          );
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }

        // Load/Default Models Array (Objects)
        let loadedModels = DEFAULT_MODEL_OPTIONS; // Start with default
        if (
          Array.isArray(data.models) &&
          data.models.length > 0 &&
          data.models.every(
            (m) =>
              typeof m === "object" && m !== null && typeof m.id === "string",
          )
        ) {
          loadedModels = data.models.map((m) => ({
            id: m.id,
            label:
              typeof m.label === "string" && m.label.trim() !== ""
                ? m.label
                : m.id,
          }));
          if (DEBUG)
            console.log(
              `[LLM Background] Using ${loadedModels.length} models from storage.`,
            );
        } else {
          if (DEBUG)
            console.log(
              `[LLM Background] No valid models found in storage, using ${loadedModels.length} defaults.`,
            );
        }

        // Determine selected model ID
        const availableModelIds = loadedModels.map((m) => m.id);
        let finalSelectedModelId = "";
        if (data.model && availableModelIds.includes(data.model)) {
          finalSelectedModelId = data.model;
        } else if (loadedModels.length > 0) {
          finalSelectedModelId = loadedModels[0].id;
        }

        // Construct final settings object
        const settings = {
          apiKey: data.apiKey || "",
          model: finalSelectedModelId,
          models: loadedModels, // Use the loaded/defaulted array of objects
          debug: DEBUG, // Use the already updated global DEBUG
          bulletCount: data.bulletCount || DEFAULT_BULLET_COUNT,
          availableLanguages: Array.isArray(data.availableLanguages)
            ? data.availableLanguages
            : DEFAULT_PREPOPULATE_LANGUAGES.filter(
                (name) => ALL_LANGUAGE_NAMES_MAP[name.toLowerCase()],
              ),
          [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]:
            data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] ||
            data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] ||
            DEFAULT_FORMAT_INSTRUCTIONS,
          [PROMPT_STORAGE_KEY_PREAMBLE]:
            data[PROMPT_STORAGE_KEY_PREAMBLE] || DEFAULT_PREAMBLE_TEMPLATE,
          [PROMPT_STORAGE_KEY_POSTAMBLE]:
            data[PROMPT_STORAGE_KEY_POSTAMBLE] || DEFAULT_POSTAMBLE_TEXT,
          [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]:
            data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] ||
            DEFAULT_FORMAT_INSTRUCTIONS,
        };

        if (DEBUG) {
          const settingsToLog = { ...settings };
          if (settingsToLog.apiKey) settingsToLog.apiKey = "[API Key Hidden]";
          console.log("[LLM Background] Sending settings:", settingsToLog);
        }
        sendResponse(settings);
      });
      // No return true needed here as sendResponse is inside the inner callback
    }

    // --- Get Chat Context ---
    else if (request.action === "getChatContext") {
      if (DEBUG)
        console.log("[LLM Background] Received getChatContext request.");
      // Fetch models (array of objects) from storage
      chrome.storage.sync.get(["models"], (syncData) => {
        // Only fetch models needed here
        chrome.storage.session.get(["chatContext"], (sessionData) => {
          const retrievedData = sessionData.chatContext;
          if (DEBUG) {
            let retrievedDataString = "undefined";
            try {
              if (retrievedData !== undefined) {
                retrievedDataString = JSON.stringify(retrievedData);
                if (retrievedDataString.length > 500) {
                  retrievedDataString =
                    retrievedDataString.substring(0, 500) + "... [TRUNCATED]";
                }
              }
            } catch (e) {
              retrievedDataString = "[Error stringifying retrievedData]";
            }
            console.log(
              "[LLM Background] Raw retrieved sessionData.chatContext:",
              retrievedDataString,
            );
          }
          const storedContext = retrievedData || {};
          if (DEBUG)
            console.log(
              "[LLM Background] storedContext after fallback:",
              storedContext,
            );

          // Load/Default Models Array (Objects)
          let modelsToSend = DEFAULT_MODEL_OPTIONS; // Start with default
          if (
            Array.isArray(syncData.models) &&
            syncData.models.length > 0 &&
            syncData.models.every(
              (m) =>
                typeof m === "object" && m !== null && typeof m.id === "string",
            )
          ) {
            modelsToSend = syncData.models.map((m) => ({
              id: m.id,
              label:
                typeof m.label === "string" && m.label.trim() !== ""
                  ? m.label
                  : m.id,
            }));
            if (DEBUG)
              console.log(
                "[LLM Background] Using models from storage for chat dropdown:",
                modelsToSend,
              );
          } else {
            if (DEBUG)
              console.log(
                "[LLM Background] No valid models found in storage, using defaults for chat dropdown.",
              );
          }

          const responsePayload = {
            domSnippet: storedContext.domSnippet,
            summary: storedContext.summary,
            chatTargetLanguage: storedContext.chatTargetLanguage,
            models: modelsToSend, // Send the array of objects
            debug: DEBUG, // Send the current global DEBUG state
          };
          if (DEBUG)
            console.log(
              "[LLM Background] Sending context payload to chat.js:",
              responsePayload,
            );
          sendResponse(responsePayload);
        });
      });
      // No return true needed here
    }

    // --- Get Models List ---
    else if (request.action === "getModelsList") {
      // This is now somewhat redundant as getSettings provides the models,
      // but keep it for potential direct use by options page if needed initially.
      if (DEBUG)
        console.log("[LLM Background] Received getModelsList request.");
      sendResponse({ models: DEFAULT_MODEL_OPTIONS }); // Still send the constant default list
      // No return true needed here
    }

    // --- Get Language Data ---
    else if (request.action === "getLanguageData") {
      if (DEBUG)
        console.log("[LLM Background] Received getLanguageData request.");
      sendResponse({
        ALL_LANGUAGES_MAP: ALL_LANGUAGES_MAP,
        ALL_LANGUAGE_NAMES_MAP: ALL_LANGUAGE_NAMES_MAP,
        SVG_PATH_PREFIX: chrome.runtime.getURL(SVG_PATH_PREFIX),
        FALLBACK_SVG_PATH: chrome.runtime.getURL(FALLBACK_SVG_PATH),
      });
      // No return true needed here
    }

    // --- LLM Streaming ---
    else if (request.action === "llmChatStream") {
      handleLLMStream(request, sender);
      // No sendResponse needed from here
    }

    // --- Set Chat Context ---
    else if (request.action === "setChatContext") {
      if (DEBUG)
        console.log(
          "[LLM Background] Received setChatContext request:",
          request,
        );
      chrome.storage.session.set(
        {
          chatContext: {
            domSnippet: request.domSnippet,
            summary: request.summary,
            chatTargetLanguage: request.chatTargetLanguage,
          },
        },
        () => {
          if (chrome.runtime.lastError) {
            if (DEBUG)
              console.error(
                "[LLM Background] Error setting session storage:",
                chrome.runtime.lastError,
              );
            sendResponse({
              status: "error",
              message: chrome.runtime.lastError.message,
            });
          } else {
            if (DEBUG)
              console.log(
                "[LLM Background] Successfully stored context in session storage.",
              );
            sendResponse({ status: "ok" });
          }
        },
      );
      // No return true needed here
    }

    // --- Open Chat Tab ---
    else if (request.action === "openChatTab") {
      const chatUrl = chrome.runtime.getURL("chat.html");
      if (DEBUG)
        console.log(
          `[LLM Background] Received request to open chat tab: ${chatUrl}`,
        );
      chrome.tabs.create({ url: chatUrl }, (newTab) => {
        if (chrome.runtime.lastError) {
          if (DEBUG)
            console.error(
              "[LLM Background] Error opening chat tab:",
              chrome.runtime.lastError,
            );
          sendResponse({
            status: "error",
            message: chrome.runtime.lastError.message,
          });
        } else {
          if (DEBUG)
            console.log(
              `[LLM Background] Chat tab opened successfully. ID: ${newTab.id}`,
            );
          sendResponse({ status: "opened", tabId: newTab.id });
        }
      });
      // No return true needed here
    }

    // --- Open Options Page ---
    else if (request.action === "openOptionsPage") {
      if (DEBUG)
        console.log(`[LLM Background] Received request to open options page.`);
      chrome.runtime.openOptionsPage();
      sendResponse({ status: "options page opened" });
      // No return true needed here
    }

    // --- Default Fall-through ---
    else {
      if (DEBUG)
        console.log("[LLM Background] Received unhandled message:", request);
      // Optionally send a response for unhandled messages if needed
      // sendResponse({});
    }
  }); // End .then() for getDebugPromise

  // Return true *outside* the promise chain to indicate async response potential
  return true;
}); // End onMessage listener

// --- STREAMING LLM HANDLER ---
async function handleLLMStream(request, sender) {
  // Fetch ONLY apiKey here
  // Use the global DEBUG variable for logging checks
  chrome.storage.sync.get(["apiKey"], async (config) => {
    const apiKey = config.apiKey;
    // Use global DEBUG for logging conditional
    if (DEBUG)
      console.log(
        "[LLM Background Stream] Handling stream request for model:",
        request.model,
      );

    if (!apiKey) {
      if (DEBUG) console.error("[LLM Background Stream] API key not set.");
      if (sender?.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "llmChatStreamError",
          error:
            "API key not set. Please configure it in the extension options.",
        });
      } else {
        console.error(
          "[LLM Background Stream] Cannot send API key error: sender tab ID missing.",
        );
      }
      return;
    }

    // Prepare messages
    const apiMessages = request.messages
      .filter((m) => m?.role && m.content)
      .filter((m) => ["system", "user", "assistant"].includes(m.role))
      .map((m) => ({ role: m.role, content: m.content }));

    if (apiMessages.length === 0) {
      console.error(
        "[LLM Background Stream] No valid messages to send after filtering.",
      );
      if (sender?.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "llmChatStreamError",
          error: "Internal error: No valid messages to send.",
        });
      }
      return;
    }
    const payload = {
      model: request.model,
      messages: apiMessages,
      stream: true,
    };

    if (DEBUG)
      console.log(
        "[LLM Background Stream] Sending payload to OpenRouter:",
        JSON.stringify(payload),
      );

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
            "X-Title": "OR-Summ",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        if (DEBUG)
          console.error(
            "[LLM Background Stream] API error:",
            response.status,
            errorBody,
          );
        throw new Error(
          `API error: ${response.status} ${response.statusText}. ${errorBody}`,
        );
      }
      if (DEBUG)
        console.log("[LLM Background Stream] Stream connection established.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let modelName = request.model;
      let streamEnded = false;

      while (!streamEnded) {
        let tabExists = false;
        if (sender?.tab?.id) {
          try {
            await chrome.tabs.get(sender.tab.id);
            tabExists = true;
          } catch (e) {
            if (DEBUG)
              console.log(
                `[LLM Background Stream] Sender tab ${sender.tab.id} closed. Aborting stream read.`,
              );
            streamEnded = true;
            try {
              reader.cancel();
            } catch (cancelError) {
              if (DEBUG)
                console.warn(
                  "[LLM Background Stream] Failed to cancel reader:",
                  cancelError,
                );
            }
            break;
          }
        } else {
          if (DEBUG)
            console.log(
              `[LLM Background Stream] Sender tab information missing. Aborting stream read.`,
            );
          streamEnded = true;
          try {
            reader.cancel();
          } catch (cancelError) {
            if (DEBUG)
              console.warn(
                "[LLM Background Stream] Failed to cancel reader:",
                cancelError,
              );
          }
          break;
        }
        if (!tabExists) continue;

        const { done, value } = await reader.read();
        if (done) {
          if (DEBUG)
            console.log(
              "[LLM Background Stream] Stream finished (reader done).",
            );
          streamEnded = true;
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let lines = buffer.split("\n");
        buffer = lines.pop();

        for (let line of lines) {
          line = line.trim();
          if (!line || !line.startsWith("data:")) continue;
          let data = line.substring(5).trim();
          if (data === "[DONE]") {
            if (DEBUG)
              console.log("[LLM Background Stream] Received [DONE] marker.");
            streamEnded = true;
            break;
          }
          try {
            let parsed = JSON.parse(data);
            let delta = parsed.choices?.[0]?.delta?.content || "";
            if (parsed.model) modelName = parsed.model;
            if (delta && sender?.tab?.id) {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: "llmChatStreamChunk",
                delta: delta,
              });
            }
          } catch (e) {
            if (DEBUG)
              console.warn(
                "[LLM Background Stream] Skipping non-JSON data line or parse error:",
                data,
                "Error:",
                e,
              );
          }
        }
        if (streamEnded) break;
      } // end while loop

      if (DEBUG)
        console.log(
          "[LLM Background Stream] Sending final stream DONE notification.",
        );
      if (sender?.tab?.id) {
        try {
          await chrome.tabs.get(sender.tab.id);
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "llmChatStreamDone",
            model: modelName,
          });
        } catch (e) {
          if (DEBUG)
            console.log(
              `[LLM Background Stream] Sender tab ${sender.tab.id} closed before sending DONE.`,
            );
        }
      }
    } catch (e) {
      if (DEBUG)
        console.error("[LLM Background Stream] Fetch/Stream Error:", e);
      if (sender?.tab?.id) {
        try {
          await chrome.tabs.get(sender.tab.id);
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "llmChatStreamError",
            error: String(e),
          });
        } catch (tabError) {
          if (DEBUG)
            console.log(
              `[LLM Background Stream] Sender tab ${sender.tab.id} closed before sending error.`,
            );
        }
      }
    }
  }); // End apiKey fetch callback
} // end handleLLMStream
