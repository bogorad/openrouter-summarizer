/* background.js */
const DEFAULT_PROMPT = "Summarize this article in 5 bullet points. Ignore HTML tags. Do not comment on output."; // This default is less relevant now

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
    contexts: ["all"]
  });

  // Simplified initial setup - relies more on options page defaults now
  chrome.storage.sync.get(['apiKey', 'debug'], data => {
    const debug = !!data.debug;
    if (!data.apiKey) {
        if (debug) console.log('[LLM Background] API key not found on install/update, opening options.');
        // Only open options if API key is missing, assume other defaults handled by options.js
        chrome.runtime.openOptionsPage();
    } else {
        if (debug) console.log('[LLM Background] API key found.');
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


// Handle "getChatContext" request from chat.html
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getChatContext") {
    chrome.storage.sync.get(['debug'], syncData => {
        const DEBUG = !!syncData.debug;
        if (DEBUG) console.log('[LLM Background] Received getChatContext request from chat tab.');

        chrome.storage.session.get(['chatContext'], (sessionData) => {
            const storedContext = sessionData.chatContext || {};
            if (DEBUG) console.log('[LLM Background] Retrieved context from session storage:', storedContext);

            // Retrieve models list (sync storage) separately - Assuming options.js saves simple array of IDs now
            chrome.storage.sync.get(['models'], function(config) {
                // Provide default models if none are saved - these should match options.js defaults
                 const DEFAULT_MODELS_WITH_LABELS = [
                    { id: "google/gemini-2.0-flash-lite-001", label: "Gemini 2.0 Flash Lite" },
                    { id: "x-ai/grok-3-mini-beta", label: "Grok 3 Mini Beta" },
                    { id: "deepseek/deepseek-chat-v3-0324:nitro", label: "Deepseek Chat v3 Nitro" },
                    { id: "deepseek/deepseek-r1", label: "Deepseek R1" },
                    { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano" },
                    { id: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet" }
                ];
                // Use saved models if available and valid, otherwise use defaults
                let modelsToSend = [];
                if (Array.isArray(config.models) && config.models.length > 0 && config.models.every(m => typeof m === 'string')) {
                     // Map saved IDs to objects with labels (find from defaults or use ID as label)
                     modelsToSend = config.models.map(id => {
                         const defaultModel = DEFAULT_MODELS_WITH_LABELS.find(m => m.id === id);
                         return { id: id, label: defaultModel ? defaultModel.label : id };
                     });
                } else {
                     modelsToSend = DEFAULT_MODELS_WITH_LABELS; // Fallback to full default list
                     if (DEBUG) console.log('[LLM Background] No valid models found in storage, using defaults for chat dropdown.');
                }


                const responsePayload = {
                    domSnippet: storedContext.domSnippet,
                    summary: storedContext.summary, // Pass the raw JSON string summary
                    summaryModel: storedContext.summaryModel,
                    models: modelsToSend // Send array of {id, label} objects
                };

                if (DEBUG) console.log('[LLM Background] Sending context payload to chat.js:', responsePayload);
                sendResponse(responsePayload);

            });
        });
    });
    return true; // Indicate async response
  }

  // Streaming chat logic with LLM
  if (request.action === "llmChatStream") {
    handleLLMStream(request, sender);
    return true; // Will respond async with tokens
  }

  // Listener to store context passed from content script before opening chat
  if (request.action === "setChatContext") {
    chrome.storage.sync.get(['debug'], syncData => {
        const DEBUG = !!syncData.debug;
        if (DEBUG) console.log('[LLM Background] Received setChatContext request:', request);

        chrome.storage.session.set({
            chatContext: {
                domSnippet: request.domSnippet,
                summary: request.summary, // Store raw JSON string summary
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

    // Listener to open chat tab
    if (request.action === "openChatTab") {
        chrome.storage.sync.get(['debug'], syncData => {
            const DEBUG = !!syncData.debug;
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
        return true;
    }

    // Default fall-through for unhandled messages
    // sendResponse({}); // Optional: acknowledge other messages
    // return false; // Indicate synchronous handling if not handled above
});


// STREAMING LLM HANDLER (MODIFIED)
async function handleLLMStream(request, sender) {
    chrome.storage.sync.get(['apiKey', 'debug'], async (config) => {
        const apiKey = config.apiKey;
        const DEBUG = !!config.debug;
        if (DEBUG) console.log('[LLM Background Stream] Handling stream request for model:', request.model);
        if (DEBUG) console.log('[LLM Background Stream] Received messages:', request.messages); // Log received messages

        if (!apiKey) {
            if (DEBUG) console.error('[LLM Background Stream] API key not set.');
            chrome.tabs.sendMessage(sender.tab.id, {
                action: "llmChatStreamError",
                error: "API key not set. Please configure it in the extension options."
            });
            return;
        }

        // --- CORRECTED PAYLOAD PREPARATION ---
        // Prepare messages for OpenRouter API - include system, user, assistant roles
        const apiMessages = request.messages
            .filter(m => m && m.role && m.content) // Basic validation
            .filter(m => ['system', 'user', 'assistant'].includes(m.role)) // Ensure valid roles
            .map(m => ({ // Ensure only role and content are sent
                role: m.role,
                content: m.content
            }));

        if (apiMessages.length === 0) {
             console.error('[LLM Background Stream] No valid messages to send after filtering.');
             chrome.tabs.sendMessage(sender.tab.id, {
                 action: "llmChatStreamError",
                 error: "Internal error: No valid messages to send."
             });
             return;
        }

        const payload = {
            model: request.model,
            messages: apiMessages, // Use the filtered and mapped messages
            stream: true
        };
        // --- END CORRECTION ---

         if (DEBUG) console.log('[LLM Background Stream] Sending payload to OpenRouter:', JSON.stringify(payload)); // Stringify for better logging

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/bogorad/openrouter-summarizer', // Replace if you have a specific URL
                    'X-Title': 'OpenRouterSummarizer-Chat' // Replace if desired
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                 const errorBody = await response.text();
                 if (DEBUG) console.error('[LLM Background Stream] API error:', response.status, errorBody);
                 throw new Error(`API error: ${response.status} ${response.statusText}. ${errorBody}`);
            }
            if (DEBUG) console.log('[LLM Background Stream] Stream connection established.');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let modelName = request.model;
            let streamEnded = false;

            while (!streamEnded) {
                const { done, value } = await reader.read();
                if (done) {
                   if (DEBUG) console.log('[LLM Background Stream] Stream finished (reader done).');
                   streamEnded = true;
                   break;
                }

                buffer += decoder.decode(value, { stream: true });
                // if (DEBUG) console.log('[LLM Background Stream] Received chunk, buffer size:', buffer.length); // Can be noisy

                let lines = buffer.split("\n");
                buffer = lines.pop(); // Keep potential incomplete line

                for (let line of lines) {
                    line = line.trim();
                    if (!line || !line.startsWith("data:")) continue;

                    let data = line.substring(5).trim();

                    if (data === "[DONE]") {
                        if (DEBUG) console.log('[LLM Background Stream] Received [DONE] marker.');
                        streamEnded = true;
                        break;
                    }

                    try {
                        let parsed = JSON.parse(data);
                        let delta = parsed.choices?.[0]?.delta?.content || "";
                        if (parsed.model) modelName = parsed.model;

                        if (delta) {
                            // if (DEBUG) console.log('[LLM Background Stream] Sending delta chunk to chat tab:', delta); // Can be noisy
                            chrome.tabs.sendMessage(sender.tab.id, {
                                action: "llmChatStreamChunk",
                                delta: delta
                            });
                        }
                    } catch (e) {
                        if (DEBUG) console.warn('[LLM Background Stream] Skipping non-JSON data line:', data, 'Error:', e);
                    }
                }
                 if (streamEnded) break;
            }

             if (DEBUG) console.log('[LLM Background Stream] Sending final stream DONE notification.');
             chrome.tabs.sendMessage(sender.tab.id, {
                 action: "llmChatStreamDone",
                 model: modelName
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
