const DEFAULT_PROMPT = "Summarize this article in 5 bullet points. Ignore HTML tags. Do not comment on output.";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
    contexts: ["all"]
  });

  chrome.storage.sync.get(['model', 'prompt', 'debug'], data => { // Load debug state too
    const model = data.model;
    const prompt = data.prompt;
    const debug = !!data.debug;
    const updates = {};

    if (!model || model.trim() === '') {
      updates.model = "google/gemini-2.0-flash-lite-001";
      if (debug) console.log('[LLM Background] Model not set, assigning default.');
    }

    if (!prompt || prompt.trim() === '') {
      updates.prompt = DEFAULT_PROMPT;
       if (debug) console.log('[LLM Background] Prompt not set, assigning default.');
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.sync.set(updates, () => {
        if (debug) console.log('[LLM Background] Initialized defaults:', updates);
      });

      // Open options on fresh install / new settings only if API key likely missing
      chrome.storage.sync.get('apiKey', keyData => {
          if (!keyData.apiKey) {
              console.log('[LLM Background] Opening options page on first install/update.');
              chrome.runtime.openOptionsPage();
          }
      });

    } else {
       if (debug) console.log('[LLM Background] Model and prompt already set, no defaults needed.');
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

// NOTE: Removed global lastChatContext variable. Using session storage instead.

// Handle "getChatContext" request from chat.html
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getChatContext") {
    chrome.storage.sync.get(['debug'], syncData => { // Check debug setting
        const DEBUG = !!syncData.debug;
        if (DEBUG) console.log('[LLM Background] Received getChatContext request from chat tab.');

        // Retrieve context from session storage
        chrome.storage.session.get(['chatContext'], (sessionData) => {
            const storedContext = sessionData.chatContext || {};
            if (DEBUG) console.log('[LLM Background] Retrieved context from session storage:', storedContext);

            // Retrieve models list (sync storage) separately
            chrome.storage.sync.get(['models', 'apiKey'], function(config) {
                let defaultModels = [
                    { id: "google/gemini-2.0-flash-lite-001", label: "Gemini 2.0 Flash Lite" }, // Updated label slightly
                    { id: "openai/gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
                    { id: "openai/gpt-4-turbo", label: "GPT-4 Turbo" },
                    { id: "meta-llama/llama-3-70b", label: "Llama 3 70B" },
                    { id: "mistralai/mixtral-8x7b", label: "Mixtral 8x7B" }
                ];
                // config.models could potentially override, but we don't have UI for that yet
                let models = Array.isArray(config.models) && config.models.length > 0 ? config.models : defaultModels;

                const responsePayload = {
                    domSnippet: storedContext.domSnippet,
                    summary: storedContext.summary,
                    summaryModel: storedContext.summaryModel,
                    models: models
                };

                if (DEBUG) console.log('[LLM Background] Sending context payload to chat.js:', responsePayload);
                sendResponse(responsePayload);

                // Optional: Clear session storage if it's single-use?
                // chrome.storage.session.remove('chatContext');
            });
        });
    });
    return true; // Indicate async response
  }

  // Streaming chat logic with LLM (remains largely the same)
  if (request.action === "llmChatStream") {
    handleLLMStream(request, sender);
    return true; // Will respond async with tokens
  }
});

// Listener to store context passed from content script before opening chat
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "setChatContext") {
    chrome.storage.sync.get(['debug'], syncData => {
        const DEBUG = !!syncData.debug;
        if (DEBUG) console.log('[LLM Background] Received setChatContext request:', request);

        // Store in session storage
        chrome.storage.session.set({
            chatContext: {
                domSnippet: request.domSnippet,
                summary: request.summary,
                summaryModel: request.summaryModel
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
});

// STREAMING LLM HANDLER
async function handleLLMStream(request, sender) {
    chrome.storage.sync.get(['apiKey', 'debug'], async (config) => { // Added debug
        const apiKey = config.apiKey;
        const DEBUG = !!config.debug;
        if (DEBUG) console.log('[LLM Background Stream] Handling stream request for model:', request.model);

        if (!apiKey) {
            if (DEBUG) console.error('[LLM Background Stream] API key not set.');
            // Send error back to chat tab
            chrome.tabs.sendMessage(sender.tab.id, { // Send to the chat tab specifically
                action: "llmChatStreamError",
                error: "API key not set. Please configure it in the extension options."
            });
            return;
        }

        // Prepare OpenRouter request
        const payload = {
            model: request.model,
            messages: request.messages.map(m => ({ // Map only user/assistant roles for API
                role: m.role,
                content: m.content
            })).filter(m => m.role === 'user' || m.role === 'assistant'), // Filter out 'context' role
            stream: true
        };
         if (DEBUG) console.log('[LLM Background Stream] Sending payload to OpenRouter:', payload);

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    // TODO: Replace with your actual referrer/title if needed
                    'HTTP-Referer': 'https://github.com/bogorad/openrouter-summarizer',
                    'X-Title': 'OpenRouterSummarizer-Chat'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                 const errorBody = await response.text();
                 if (DEBUG) console.error('[LLM Background Stream] API error:', response.status, errorBody);
                 throw new Error(`API error: ${response.status} ${response.statusText}. ${errorBody}`);
            }
            if (DEBUG) console.log('[LLM Background Stream] Stream connection established.');

            // Read streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let modelName = request.model; // Initial guess
            let streamEnded = false;

            while (!streamEnded) {
                const { done, value } = await reader.read();
                if (done) {
                   if (DEBUG) console.log('[LLM Background Stream] Stream finished (reader done).');
                   streamEnded = true;
                   break; // Exit loop immediately
                }

                buffer += decoder.decode(value, { stream: true });
                if (DEBUG) console.log('[LLM Background Stream] Received chunk, buffer size:', buffer.length);

                let lines = buffer.split("\n");
                buffer = lines.pop(); // Keep potential incomplete line for next chunk

                for (let line of lines) {
                    line = line.trim();
                    if (!line || !line.startsWith("data:")) continue;

                    let data = line.substring(5).trim(); // Remove "data: " prefix

                    if (data === "[DONE]") {
                        if (DEBUG) console.log('[LLM Background Stream] Received [DONE] marker.');
                        streamEnded = true; // Set flag to ensure outer loop terminates correctly
                        break; // Exit inner loop
                    }

                    try {
                        let parsed = JSON.parse(data);
                        let delta = parsed.choices?.[0]?.delta?.content || "";
                        if (parsed.model) modelName = parsed.model; // Update model if provided

                        if (delta) {
                            if (DEBUG) console.log('[LLM Background Stream] Sending delta chunk to chat tab:', delta);
                            chrome.tabs.sendMessage(sender.tab.id, {
                                action: "llmChatStreamChunk",
                                delta: delta
                            });
                        }
                    } catch (e) {
                        if (DEBUG) console.warn('[LLM Background Stream] Skipping non-JSON data line:', data, 'Error:', e);
                        // Continue processing other lines
                    }
                }
                 // Check streamEnded flag again in case [DONE] was processed
                 if (streamEnded) break;
            } // End while loop

             // Send final "Done" message regardless of how the loop ended (reader done or [DONE] marker)
             if (DEBUG) console.log('[LLM Background Stream] Sending final stream DONE notification.');
             chrome.tabs.sendMessage(sender.tab.id, {
                 action: "llmChatStreamDone",
                 model: modelName // Send the potentially updated model name
             });

        } catch (e) {
             if (DEBUG) console.error('[LLM Background Stream] Fetch/Stream Error:', e);
             chrome.tabs.sendMessage(sender.tab.id, {
                 action: "llmChatStreamError",
                 error: String(e)
             });
        }
    });
}

// Add this new listener to background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openChatTab") {
    chrome.storage.sync.get(['debug'], syncData => { // Optional: Check debug flag
        const DEBUG = !!syncData.debug;
        const chatUrl = chrome.runtime.getURL('chat.html');
        if (DEBUG) console.log(`[LLM Background] Received request to open chat tab: ${chatUrl}`);

        // Use the chrome.tabs API here in the background script
        chrome.tabs.create({ url: chatUrl }, (newTab) => {
            if (chrome.runtime.lastError) {
                if (DEBUG) console.error('[LLM Background] Error opening chat tab:', chrome.runtime.lastError);
                sendResponse({ status: "error", message: chrome.runtime.lastError.message });
            } else {
                 if (DEBUG) console.log(`[LLM Background] Chat tab opened successfully. ID: ${newTab.id}`);
                 sendResponse({ status: "opened", tabId: newTab.id }); // Acknowledge success
            }
        });
    });
    return true; // Indicate async response is needed because of chrome.tabs.create callback
  }
  // Make sure your other listeners (getChatContext, setChatContext, llmChatStream) are still present
});
