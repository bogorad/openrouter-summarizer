// background.js
/* background.js */
// v2.14 - Centralized settings access & Re-added API key sanitization

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
    PROMPT_STORAGE_KEY_DEFAULT_FORMAT
    // --- End Added Imports ---
} from './constants.js';

// --- Language Data Storage ---
let ALL_LANGUAGES_MAP = {};
let ALL_LANGUAGES_ARRAY = [];
let ALL_LANGUAGE_NAMES_MAP = {};

// --- Debug State ---
let DEBUG = false; // Default debug state, updated on load/message

// --- Constants for Settings ---
const DEFAULT_BULLET_COUNT = "5";
const DEFAULT_DEBUG_MODE = false;

// --- Language Data Loading ---
async function loadLanguageData() {
    try {
        const url = chrome.runtime.getURL(LANGUAGES_JSON_PATH);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch languages.json: ${response.statusText} (${response.status})`);
        }
        const data = await response.json();
        ALL_LANGUAGES_MAP = data;
        ALL_LANGUAGES_ARRAY = Object.keys(data).map(name => ({ code: data[name], name: name }));
        ALL_LANGUAGE_NAMES_MAP = Object.keys(data).reduce((map, name) => {
            map[name.toLowerCase()] = { code: data[name], name: name };
            return map;
        }, {});
        if (DEBUG) console.log(`[LLM Background] Successfully loaded ${ALL_LANGUAGES_ARRAY.length} languages.`);
    } catch (error) {
        console.error("[LLM Background] Error loading language data:", error);
        ALL_LANGUAGES_MAP = {};
        ALL_LANGUAGES_ARRAY = [];
        ALL_LANGUAGE_NAMES_MAP = {};
    }
}

// --- Initial Setup ---
chrome.storage.sync.get('debug', (data) => {
    DEBUG = !!data.debug;
    if (DEBUG) console.log('[LLM Background] Debug mode initially:', DEBUG);
    loadLanguageData(); // Load language data after debug state is known
});

// --- Service Worker Lifecycle ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
    contexts: ["all"]
  });
  chrome.storage.sync.get(['apiKey', 'debug'], data => {
    DEBUG = !!data.debug; // Update debug state on install/update
    if (!data.apiKey) {
        if (DEBUG) console.log('[LLM Background] API key not found on install/update, opening options.');
        chrome.runtime.openOptionsPage();
    } else {
        if (DEBUG) console.log('[LLM Background] API key found.');
    }
  });
});

// --- Context Menu & Toolbar Icon Click Events ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sendToLLM") {
    if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
    } else {
        console.warn("[LLM Background] Context menu clicked but tab ID is missing.");
    }
  }
});
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) {
      console.warn("[LLM Background] Toolbar icon clicked but tab ID is missing.");
      return;
  }
  chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
});


// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // --- Update Debug State on Request ---
  if (request.debug !== undefined) {
      const newDebugState = !!request.debug;
      if (newDebugState !== DEBUG) {
          DEBUG = newDebugState;
          if (DEBUG) console.log('[LLM Background] Debug state updated via message to:', DEBUG);
      }
  }

  // --- Get Core Settings ---
  if (request.action === "getSettings") {
      if (DEBUG) console.log('[LLM Background] Received getSettings request.');
      const keysToFetch = [
          'apiKey', 'model', 'debug', 'bulletCount', 'availableLanguages',
          PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
          PROMPT_STORAGE_KEY_PREAMBLE,
          PROMPT_STORAGE_KEY_POSTAMBLE,
          PROMPT_STORAGE_KEY_DEFAULT_FORMAT
      ];
      chrome.storage.sync.get(keysToFetch, (data) => {
          if (chrome.runtime.lastError) {
              console.error("[LLM Background] Error getting settings:", chrome.runtime.lastError);
              sendResponse({ error: chrome.runtime.lastError.message });
              return;
          }

          // Apply defaults if values are missing or invalid
          const settings = {
              apiKey: data.apiKey || '',
              model: data.model || (DEFAULT_MODEL_OPTIONS.length > 0 ? DEFAULT_MODEL_OPTIONS[0].id : ''), // Default to first model ID
              debug: !!data.debug || DEFAULT_DEBUG_MODE,
              bulletCount: data.bulletCount || DEFAULT_BULLET_COUNT,
              // Ensure availableLanguages is an array, default to filtered prepopulate list if needed
              availableLanguages: Array.isArray(data.availableLanguages)
                  ? data.availableLanguages
                  : DEFAULT_PREPOPULATE_LANGUAGES.filter(name => ALL_LANGUAGE_NAMES_MAP[name.toLowerCase()]), // Filter defaults against loaded data
              // Prompt parts with fallbacks
              [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]: data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] || data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] || DEFAULT_FORMAT_INSTRUCTIONS,
              [PROMPT_STORAGE_KEY_PREAMBLE]: data[PROMPT_STORAGE_KEY_PREAMBLE] || DEFAULT_PREAMBLE_TEMPLATE,
              [PROMPT_STORAGE_KEY_POSTAMBLE]: data[PROMPT_STORAGE_KEY_POSTAMBLE] || DEFAULT_POSTAMBLE_TEXT,
              [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]: data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] || DEFAULT_FORMAT_INSTRUCTIONS,
          };

          // Update background's DEBUG state based on fetched value
          DEBUG = settings.debug;

          // --- *** ADDED SANITIZATION HERE *** ---
          if (DEBUG) {
              const settingsToLog = { ...settings }; // Create a copy
              if (settingsToLog.apiKey) {
                  settingsToLog.apiKey = '[API Key Hidden]'; // Mask the key
              }
              console.log('[LLM Background] Sending settings:', settingsToLog); // Log the sanitized copy
          }
          // --- *** END SANITIZATION *** ---

          sendResponse(settings); // Send the original settings object
      });
      return true; // Indicate async response
  }

  // --- Get Chat Context (Modified to include debug) ---
  if (request.action === "getChatContext") {
    // Fetch debug state along with other sync data needed for context
    chrome.storage.sync.get(['debug', 'models'], syncData => {
        DEBUG = !!syncData.debug; // Update background debug state
        if (DEBUG) console.log('[LLM Background] Received getChatContext request.');

        chrome.storage.session.get(['chatContext'], (sessionData) => {
            const storedContext = sessionData.chatContext || {};
            if (DEBUG) console.log('[LLM Background] Retrieved context from session storage:', storedContext);

            // Determine models to send (same logic as before)
            let modelsToSend = [];
            if (Array.isArray(syncData.models) && syncData.models.length > 0 && syncData.models.every(m => typeof m === 'string')) {
                 modelsToSend = syncData.models.map(id => {
                     const defaultModel = DEFAULT_MODEL_OPTIONS.find(m => m.id === id);
                     return { id: id, label: defaultModel ? defaultModel.label : id };
                 });
                 if (DEBUG) console.log('[LLM Background] Using models from storage for chat dropdown:', modelsToSend);
            } else {
                 modelsToSend = DEFAULT_MODEL_OPTIONS;
                 if (DEBUG) console.log('[LLM Background] No valid models found in storage, using defaults for chat dropdown.');
            }

            // Construct payload including debug state
            const responsePayload = {
                domSnippet: storedContext.domSnippet,
                summary: storedContext.summary,
                chatTargetLanguage: storedContext.chatTargetLanguage,
                models: modelsToSend,
                debug: DEBUG // Include debug state
            };

            if (DEBUG) console.log('[LLM Background] Sending context payload to chat.js:', responsePayload);
            sendResponse(responsePayload);
        });
    });
    return true; // Indicate async response
  }

  // --- Get Models List (Unchanged, uses constant) ---
  if (request.action === "getModelsList") {
      // Fetch debug state just to update the background's knowledge
      chrome.storage.sync.get(['debug'], syncData => {
          DEBUG = !!syncData.debug;
          if (DEBUG) console.log('[LLM Background] Received getModelsList request.');
          sendResponse({ models: DEFAULT_MODEL_OPTIONS }); // Return the constant
      });
      return true; // Indicate async response
  }

  // --- Get Language Data (Unchanged, uses loaded data) ---
  if (request.action === "getLanguageData") {
      // Fetch debug state just to update the background's knowledge
      chrome.storage.sync.get(['debug'], syncData => {
          DEBUG = !!syncData.debug;
          if (DEBUG) console.log('[LLM Background] Received getLanguageData request.');
          sendResponse({
              ALL_LANGUAGES_MAP: ALL_LANGUAGES_MAP,
              // ALL_LANGUAGES_ARRAY: ALL_LANGUAGES_ARRAY, // Not strictly needed by options/popup
              ALL_LANGUAGE_NAMES_MAP: ALL_LANGUAGE_NAMES_MAP, // Send the name map
              SVG_PATH_PREFIX: chrome.runtime.getURL(SVG_PATH_PREFIX),
              FALLBACK_SVG_PATH: chrome.runtime.getURL(FALLBACK_SVG_PATH)
          });
      });
      return true; // Indicate async response
  }

  // --- LLM Streaming (Unchanged) ---
  if (request.action === "llmChatStream") {
    handleLLMStream(request, sender);
    return false; // No async response needed here
  }

  // --- Set Chat Context (Unchanged) ---
  if (request.action === "setChatContext") {
    chrome.storage.sync.get(['debug'], syncData => {
        DEBUG = !!syncData.debug;
        if (DEBUG) console.log('[LLM Background] Received setChatContext request:', request);
        chrome.storage.session.set({
            chatContext: {
                domSnippet: request.domSnippet,
                summary: request.summary,
                chatTargetLanguage: request.chatTargetLanguage
            }
        }, () => {
            if (chrome.runtime.lastError) {
                if (DEBUG) console.error('[LLM Background] Error setting session storage:', chrome.runtime.lastError);
                sendResponse({ status: "error", message: chrome.runtime.lastError.message });
            } else {
                if (DEBUG) console.log('[LLM Background] Successfully stored context in session storage.');
                sendResponse({ status: "ok" });
            }
        });
    });
    return true; // Indicate async response needed
  }

  // --- Open Chat Tab (Unchanged) ---
  if (request.action === "openChatTab") {
    chrome.storage.sync.get(['debug'], syncData => {
        DEBUG = !!syncData.debug;
        const chatUrl = chrome.runtime.getURL('chat.html');
        if (DEBUG) console.log(`[LLM Background] Received request to open chat tab: ${chatUrl}`);
        chrome.tabs.create({ url: chatUrl }, (newTab) => {
            if (chrome.runtime.lastError) {
                if (DEBUG) console.error('[LLM Background] Error opening chat tab:', chrome.runtime.lastError);
                sendResponse({ status: "error", message: chrome.runtime.lastError.message });
            } else {
                 if (DEBUG) console.log(`[LLM Background] Chat tab opened successfully. ID: ${newTab.id}`);
                 sendResponse({ status: "opened", tabId: newTab.id });
            }
        });
    });
    return true; // Indicate async response is needed
  }

  // --- Open Options Page (Unchanged) ---
  if (request.action === "openOptionsPage") {
      chrome.storage.sync.get(['debug'], syncData => {
          DEBUG = !!syncData.debug;
          if (DEBUG) console.log(`[LLM Background] Received request to open options page.`);
          chrome.runtime.openOptionsPage();
          sendResponse({ status: "options page opened" });
      });
      return true;
  }

  // --- Default Fall-through ---
  // if (DEBUG) console.log("[LLM Background] Received unhandled message:", request);
  return false; // Indicate synchronous handling if not handled above
});


// --- STREAMING LLM HANDLER ---
async function handleLLMStream(request, sender) {
    // Fetch API key and debug state *when needed* for the stream
    chrome.storage.sync.get(['apiKey', 'debug'], async (config) => {
        const apiKey = config.apiKey;
        const streamDEBUG = !!config.debug; // Use a local variable for debug state during stream
        if (streamDEBUG) console.log('[LLM Background Stream] Handling stream request for model:', request.model);
        if (streamDEBUG) console.log('[LLM Background Stream] Received messages:', request.messages);

        if (!apiKey) {
            if (streamDEBUG) console.error('[LLM Background Stream] API key not set.');
            if (sender?.tab?.id) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: "llmChatStreamError",
                    error: "API key not set. Please configure it in the extension options."
                });
            } else {
                 console.error('[LLM Background Stream] Cannot send API key error: sender tab ID missing.');
            }
            return;
        }

        // Prepare messages for OpenRouter API
        const apiMessages = request.messages
            .filter(m => m?.role && m.content)
            .filter(m => ['system', 'user', 'assistant'].includes(m.role))
            .map(m => ({ role: m.role, content: m.content }));

        if (apiMessages.length === 0) {
             console.error('[LLM Background Stream] No valid messages to send after filtering.');
             if (sender?.tab?.id) {
                 chrome.tabs.sendMessage(sender.tab.id, {
                     action: "llmChatStreamError",
                     error: "Internal error: No valid messages to send."
                 });
             }
             return;
        }

        const payload = {
            model: request.model,
            messages: apiMessages,
            stream: true
        };

         if (streamDEBUG) console.log('[LLM Background Stream] Sending payload to OpenRouter:', JSON.stringify(payload)); // Payload doesn't contain API key

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/bogorad/openrouter-summarizer', // Replace if you have a specific URL
                    'X-Title': 'OR-Summ'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                 const errorBody = await response.text();
                 if (streamDEBUG) console.error('[LLM Background Stream] API error:', response.status, errorBody);
                 throw new Error(`API error: ${response.status} ${response.statusText}. ${errorBody}`);
            }
            if (streamDEBUG) console.log('[LLM Background Stream] Stream connection established.');

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
                        if (streamDEBUG) console.log(`[LLM Background Stream] Sender tab ${sender.tab.id} closed. Aborting stream read.`);
                        streamEnded = true;
                        try { reader.cancel(); } catch (cancelError) { if (streamDEBUG) console.warn('[LLM Background Stream] Failed to cancel reader:', cancelError); }
                        break;
                    }
                } else {
                     if (streamDEBUG) console.log(`[LLM Background Stream] Sender tab information missing. Aborting stream read.`);
                     streamEnded = true;
                     try { reader.cancel(); } catch (cancelError) { if (streamDEBUG) console.warn('[LLM Background Stream] Failed to cancel reader:', cancelError); }
                     break;
                }

                if (!tabExists) continue;

                const { done, value } = await reader.read();
                if (done) {
                   if (streamDEBUG) console.log('[LLM Background Stream] Stream finished (reader done).');
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
                        if (streamDEBUG) console.log('[LLM Background Stream] Received [DONE] marker.');
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
                                 delta: delta
                             });
                        }
                    } catch (e) {
                        if (streamDEBUG) console.warn('[LLM Background Stream] Skipping non-JSON data line or parse error:', data, 'Error:', e);
                    }
                }
                 if (streamEnded) break;
            } // end while loop

             if (streamDEBUG) console.log('[LLM Background Stream] Sending final stream DONE notification.');
             if (sender?.tab?.id) {
                 try {
                     await chrome.tabs.get(sender.tab.id);
                     chrome.tabs.sendMessage(sender.tab.id, {
                         action: "llmChatStreamDone",
                         model: modelName
                     });
                 } catch (e) {
                      if (streamDEBUG) console.log(`[LLM Background Stream] Sender tab ${sender.tab.id} closed before sending DONE.`);
                 }
             }

        } catch (e) {
             if (streamDEBUG) console.error('[LLM Background Stream] Fetch/Stream Error:', e);
             if (sender?.tab?.id) {
                  try {
                      await chrome.tabs.get(sender.tab.id);
                      chrome.tabs.sendMessage(sender.tab.id, {
                          action: "llmChatStreamError",
                          error: String(e)
                      });
                  } catch (tabError) {
                       if (streamDEBUG) console.log(`[LLM Background Stream] Sender tab ${sender.tab.id} closed before sending error.`);
                  }
             }
        }
    });
} // end handleLLMStream
