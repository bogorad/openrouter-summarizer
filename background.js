/* background.js */
// v2.2.7 - Added immediate sendResponse({}) workaround for llmChatStream listener.

// Default prompt (less relevant now as it's stored via options)
const DEFAULT_PROMPT = "Summarize this article in 5 bullet points. Ignore HTML tags. Do not comment on output.";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendToLLM",
    title: "Send to LLM",
    contexts: ["all"]
  });

  // Simplified initial setup - check API key, let options page handle defaults
  chrome.storage.sync.get(['apiKey', 'debug'], data => {
    const debug = !!data.debug;
    if (!data.apiKey) {
        if (debug) console.log('[LLM Background] API key not found on install/update, opening options.');
        // Only open options if API key is missing
        chrome.runtime.openOptionsPage();
    } else {
        if (debug) console.log('[LLM Background] API key found.');
    }
  });
});

// context menu click event
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sendToLLM") {
    // Ensure tab.id exists before sending message
    if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
    } else {
        console.warn("[LLM Background] Context menu clicked but tab ID is missing.");
    }
  }
});

// toolbar icon click event
chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) {
      console.warn("[LLM Background] Toolbar icon clicked but tab ID is missing.");
      return;
  }
  chrome.tabs.sendMessage(tab.id, { action: "processSelection" });
});


// Handle various messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // --- Get Chat Context ---
  if (request.action === "getChatContext") {
    chrome.storage.sync.get(['debug'], syncData => {
        const DEBUG = !!syncData.debug;
        if (DEBUG) console.log('[LLM Background] Received getChatContext request from chat tab.');

        chrome.storage.session.get(['chatContext'], (sessionData) => {
            const storedContext = sessionData.chatContext || {};
            if (DEBUG) console.log('[LLM Background] Retrieved context from session storage:', storedContext);

            // Retrieve models list (sync storage)
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
                let modelsToSend = [];
                // Use saved models (array of strings) if available and valid
                if (Array.isArray(config.models) && config.models.length > 0 && config.models.every(m => typeof m === 'string')) {
                     // Map saved IDs to objects with labels
                     modelsToSend = config.models.map(id => {
                         const defaultModel = DEFAULT_MODELS_WITH_LABELS.find(m => m.id === id);
                         return { id: id, label: defaultModel ? defaultModel.label : id };
                     });
                     if (DEBUG) console.log('[LLM Background] Using models from storage for chat dropdown:', modelsToSend);
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

  // --- LLM Streaming ---
  if (request.action === "llmChatStream") {
    handleLLMStream(request, sender);
    // --- WORKAROUND: Call sendResponse immediately even though we return false ---
    // Try adding this to see if it prevents the error, even if redundant.
    sendResponse({});
    // --- END WORKAROUND ---
    return false; // Explicitly return false (or nothing) as we use tabs.sendMessage
  }

  // --- Set Chat Context ---
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

  // --- Open Chat Tab ---
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
    return true; // Indicate async response is needed
  }

  // --- Open Options Page ---
  if (request.action === "openOptionsPage") {
      chrome.storage.sync.get(['debug'], syncData => {
          const DEBUG = !!syncData.debug;
          if (DEBUG) console.log(`[LLM Background] Received request to open options page.`);
          chrome.runtime.openOptionsPage();
          sendResponse({ status: "options page opened" }); // Acknowledge
      });
      return true; // Indicate async response because of storage.sync.get
  }
  // --- END NEW ---


  // Optional: Default fall-through for unhandled messages
  // console.log("[LLM Background] Received unhandled message:", request);
  // sendResponse({}); // Acknowledge if needed
  return false; // Indicate synchronous handling if not handled above
});


// --- STREAMING LLM HANDLER ---
async function handleLLMStream(request, sender) {
    chrome.storage.sync.get(['apiKey', 'debug'], async (config) => {
        const apiKey = config.apiKey;
        const DEBUG = !!config.debug;
        if (DEBUG) console.log('[LLM Background Stream] Handling stream request for model:', request.model);
        if (DEBUG) console.log('[LLM Background Stream] Received messages:', request.messages);

        if (!apiKey) {
            if (DEBUG) console.error('[LLM Background Stream] API key not set.');
            if (sender && sender.tab && sender.tab.id) {
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
            .filter(m => m && m.role && m.content)
            .filter(m => ['system', 'user', 'assistant'].includes(m.role))
            .map(m => ({
                role: m.role,
                content: m.content
            }));

        if (apiMessages.length === 0) {
             console.error('[LLM Background Stream] No valid messages to send after filtering.');
             if (sender && sender.tab && sender.tab.id) {
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

         if (DEBUG) console.log('[LLM Background Stream] Sending payload to OpenRouter:', JSON.stringify(payload));

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/bogorad/openrouter-summarizer', // Replace if you have a specific URL
                    'X-Title': 'ORSummarizer-Chat'
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
                // Check if sender tab still exists before reading/sending
                let tabExists = false;
                if (sender && sender.tab && sender.tab.id) {
                    try {
                        await chrome.tabs.get(sender.tab.id);
                        tabExists = true;
                    } catch (e) {
                        // Tab doesn't exist
                        if (DEBUG) console.log(`[LLM Background Stream] Sender tab ${sender.tab.id} closed. Aborting stream read.`);
                        streamEnded = true; // Stop reading
                        // Cleanly close the reader if possible (optional)
                        try { reader.cancel(); } catch (cancelError) {}
                        break; // Exit loop
                    }
                } else {
                     if (DEBUG) console.log(`[LLM Background Stream] Sender tab information missing. Aborting stream read.`);
                     streamEnded = true;
                     try { reader.cancel(); } catch (cancelError) {}
                     break;
                }

                // Proceed only if tab exists
                if (!tabExists) continue; // Should be caught by break, but for safety

                const { done, value } = await reader.read();
                if (done) {
                   if (DEBUG) console.log('[LLM Background Stream] Stream finished (reader done).');
                   streamEnded = true;
                   break;
                }

                buffer += decoder.decode(value, { stream: true });

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

                        // Send chunk only if delta exists and tab still exists
                        if (delta && sender && sender.tab && sender.tab.id) {
                             // No need to check tab existence again here, done at start of loop
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
            } // end while loop

             // Send final DONE notification only if the tab still exists
             if (DEBUG) console.log('[LLM Background Stream] Sending final stream DONE notification.');
             if (sender && sender.tab && sender.tab.id) {
                 try {
                     await chrome.tabs.get(sender.tab.id); // Check one last time
                     chrome.tabs.sendMessage(sender.tab.id, {
                         action: "llmChatStreamDone",
                         model: modelName
                     });
                 } catch (e) {
                      if (DEBUG) console.log(`[LLM Background Stream] Sender tab ${sender.tab.id} closed before sending DONE.`);
                 }
             }

        } catch (e) {
             if (DEBUG) console.error('[LLM Background Stream] Fetch/Stream Error:', e);
             // Send error only if tab still exists
             if (sender && sender.tab && sender.tab.id) {
                  try {
                      await chrome.tabs.get(sender.tab.id);
                      chrome.tabs.sendMessage(sender.tab.id, {
                          action: "llmChatStreamError",
                          error: String(e)
                      });
                  } catch (tabError) {
                       if (DEBUG) console.log(`[LLM Background Stream] Sender tab ${sender.tab.id} closed before sending error.`);
                  }
             }
        }
    });
} // end handleLLMStream
