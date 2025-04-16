/* chat.js */
// v2.2.8 - Re-implements snippet context injection on subsequent turns, with truncation.

// ==== GLOBAL STATE ====
let models = []; // Will store array of {id: string, label: string} objects
let selectedModelId = "";
// chatContext.summary will now store the RAW JSON STRING received
let chatContext = { domSnippet: null, summary: null, summaryModel: null };
// messages[0].content might be an ARRAY of strings if initial summary parsed correctly
let messages = []; // Holds {role, content, model?} objects
let streaming = false;
let currentStreamMsgSpan = null;
let currentStreamRawContent = "";
let currentStreamModel = "";
let DEBUG = false;
let chatMessagesInnerDiv = null;
let messageListenerAttached = false; // Prevent duplicate listeners
const SNIPPET_TRUNCATION_LIMIT = 65536; // Max characters for snippet context

// ==== DOM Element References ====
let downloadMdBtn = null;
let copyMdBtn = null;
let downloadJsonBtn = null;
let chatInput = null;
let modelSelect = null;
let chatForm = null;
let chatMessages = null; // The scrollable container
let errorDisplay = null;
let sendButton = null;

// ==== INITIALIZATION ====

document.addEventListener('DOMContentLoaded', () => {
    console.log('[LLM Chat] DOMContentLoaded event fired.');

    // --- Cache DOM Element References ---
    chatMessagesInnerDiv = document.querySelector('.chat-messages-inner');
    downloadMdBtn = document.getElementById('downloadMdBtn');
    copyMdBtn = document.getElementById('copyMdBtn');
    downloadJsonBtn = document.getElementById('downloadJsonBtn');
    chatInput = document.getElementById('chatInput');
    modelSelect = document.getElementById('modelSelect');
    chatForm = document.getElementById('chatForm');
    chatMessages = document.getElementById('chatMessages'); // Outer scrollable div
    errorDisplay = document.getElementById('errorDisplay');
    sendButton = chatForm ? chatForm.querySelector('button[type="submit"]') : null;
    // --- End Caching ---

    // --- Critical Element Check ---
    if (!chatMessagesInnerDiv || !downloadMdBtn || !copyMdBtn || !downloadJsonBtn || !chatInput || !modelSelect || !chatForm || !chatMessages || !sendButton) {
        console.error("CRITICAL: Could not find essential UI elements! Aborting initialization.", { chatMessagesInnerDiv: !!chatMessagesInnerDiv, downloadMdBtn: !!downloadMdBtn, copyMdBtn: !!copyMdBtn, downloadJsonBtn: !!downloadJsonBtn, chatInput: !!chatInput, modelSelect: !!modelSelect, chatForm: !!chatForm, chatMessages: !!chatMessages, sendButton: !!sendButton });
        document.body.innerHTML = '<div style="color: red; padding: 20px; font-family: sans-serif;">Error: Chat UI structure is missing essential elements. Cannot load chat.</div>';
        return;
    }
    console.log('[LLM Chat] Found essential UI elements.');

    // Configure marked library
    if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
         console.log('[LLM Chat] Marked library loaded and configured.');
    } else {
        console.warn("Marked library failed to load! Markdown rendering will use basic newline conversion.");
    }

    // Fetch debug status
    chrome.storage.sync.get('debug', (data) => {
        DEBUG = !!data.debug;
        if (DEBUG) console.log('[LLM Chat] Debug mode enabled.');
        initializeChat(); // Initialize the rest
    });
});

function initializeChat() {
    if (DEBUG) console.log('[LLM Chat] Initializing chat page...');
    chrome.runtime.sendMessage({ action: "getChatContext" }, (response) => { // 'response' IS defined here
        if (chrome.runtime.lastError) { console.error('[LLM Chat] Error getting context from background:', chrome.runtime.lastError); showError(`Error loading chat context: ${chrome.runtime.lastError.message}. Please close this tab and try again.`); disableChatFunctionality(); return; }
        if (DEBUG) console.log('[LLM Chat] Received context response from background:', response);

        // Expect array of objects {id, label}
        if (response && Array.isArray(response.models) && response.models.length > 0 && response.models.every(m => typeof m === 'object' && m.id)) {
            models = response.models;
            populateModelDropdown(response.summaryModel);

            if (response.domSnippet && response.summary) {
                chatContext.domSnippet = response.domSnippet;
                chatContext.summary = response.summary; // Store the RAW JSON STRING
                chatContext.summaryModel = response.summaryModel || (models.length > 0 ? models[0].id : "");

                if (DEBUG) console.log('[LLM Chat] Context received. Raw summary:', chatContext.summary);

                let initialContent;
                let parseError = false;
                try {
                    let jsonStringToParse = chatContext.summary;
                    const jsonFenceMatch = chatContext.summary.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
                    if (jsonFenceMatch && jsonFenceMatch[1]) {
                        jsonStringToParse = jsonFenceMatch[1].trim();
                        if (DEBUG) console.log('[LLM Chat Init] Stripped JSON fences from initial summary.');
                    } else {
                         if (DEBUG) console.log('[LLM Chat Init] No JSON fences detected in initial summary.');
                    }
                    initialContent = JSON.parse(jsonStringToParse);

                    if (!Array.isArray(initialContent)) { throw new Error('Parsed summary is not an array.'); }
                    if (initialContent.some(item => typeof item !== 'string')) {
                         console.warn('[LLM Chat Init] Initial summary array contains non-string elements.');
                         initialContent = initialContent.map(item => String(item));
                    }
                    if (DEBUG) console.log('[LLM Chat Init] Successfully parsed initial summary JSON into array:', initialContent);
                } catch (e) {
                    console.error("[LLM Chat Init] Failed to parse initial summary JSON:", e);
                    initialContent = [`<Error: Could not display initial summary. Parsing failed for: ${chatContext.summary.substring(0, 100)}...>`];
                    parseError = true;
                }

                messages = [{ role: "assistant", content: initialContent, model: chatContext.summaryModel }];
                renderMessages();
                if (parseError) { showError('Failed to parse the initial summary data. Displaying raw data.', false); }

            } else {
                console.warn('[LLM Chat] Context received from background is incomplete.');
                messages = [];
                renderMessages();
                showError('Could not load initial summary context.', false);
            }
            focusInput();
        } else {
            console.error('[LLM Chat] Failed to get valid context or models list, or models format is incorrect (expected array of objects with id).', response);
            showError('Error: Could not load models list from settings or format is invalid (expected objects with id).');
            disableChatFunctionality();
        }
    });
    chatForm.removeEventListener('submit', handleFormSubmit); chatForm.addEventListener('submit', handleFormSubmit);
    setupStreamListeners(); setupTextareaResize();
    downloadMdBtn.addEventListener('click', handleDownloadMd); copyMdBtn.addEventListener('click', handleCopyMd); downloadJsonBtn.addEventListener('click', handleDownloadJson);
    setupCtrlEnterListener();
    console.log('[LLM Chat] Initialization complete.');
}

function disableChatFunctionality() { console.warn('[LLM Chat] Disabling chat functionality.'); if (chatInput) chatInput.disabled = true; if (sendButton) sendButton.disabled = true; if (modelSelect) modelSelect.disabled = true; if (downloadMdBtn) downloadMdBtn.disabled = true; if (copyMdBtn) copyMdBtn.disabled = true; if (downloadJsonBtn) downloadJsonBtn.disabled = true; }

function populateModelDropdown(preferredModelId) {
    if (!modelSelect) return;
    modelSelect.innerHTML = '';
    modelSelect.disabled = false;
    if (!models || models.length === 0) {
        console.error("[LLM Chat] No models available for dropdown.");
        const opt = document.createElement('option');
        opt.value = ""; opt.textContent = "No models configured"; opt.disabled = true;
        modelSelect.appendChild(opt); modelSelect.disabled = true; selectedModelId = "";
        return;
    }
    models.forEach(model => {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = model.label || model.id;
        modelSelect.appendChild(opt);
    });
    const availableModelIds = models.map(m => m.id);
    if (preferredModelId && typeof preferredModelId === 'string' && availableModelIds.includes(preferredModelId)) {
        modelSelect.value = preferredModelId;
        selectedModelId = preferredModelId;
    } else if (models.length > 0) {
        modelSelect.value = models[0].id;
        selectedModelId = models[0].id;
    } else {
        selectedModelId = "";
    }
    if (DEBUG) console.log(`[LLM Chat] Model dropdown populated. Initial selection: ${selectedModelId}`);
    modelSelect.onchange = function() {
        selectedModelId = this.value;
        if (DEBUG) console.log(`[LLM Chat] Model selection changed to: ${selectedModelId}`);
    };
}

function renderMessages() {
    const wrap = chatMessagesInnerDiv;
    if (!wrap) { console.error("Cannot render messages: .chat-messages-inner div not found."); return; }
    if (DEBUG) console.log(`[LLM Chat Render] Rendering ${messages.length} messages.`);
    wrap.innerHTML = '';

    if (messages.length === 0) {
        wrap.innerHTML = '<div class="msg system-info">Chat started. Ask a follow-up question...</div>';
    } else {
        messages.forEach((msg, index) => {
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('msg');

            if (msg.role === 'assistant') {
                msgDiv.classList.add('assistant');
                let modelLabelDiv = null;
                if (msg.model) {
                    modelLabelDiv = document.createElement('div');
                    modelLabelDiv.className = 'assistant-model-label';
                    modelLabelDiv.textContent = `Model: ${msg.model}`;
                }

                const contentSpan = document.createElement('span');
                contentSpan.className = 'assistant-inner';

                if (index === 0 && Array.isArray(msg.content)) {
                    if (DEBUG) console.log('[LLM Chat Render] Rendering initial summary from array:', msg.content);
                    try {
                        const listHtml = '<ul>' + msg.content.map(item => `<li>${item}</li>`).join('') + '</ul>';
                        contentSpan.innerHTML = listHtml;
                    } catch (e) {
                         console.error("[LLM Chat Render] Error creating list HTML for initial summary:", e);
                         contentSpan.textContent = "Error displaying initial summary.";
                    }
                } else if (typeof msg.content === 'string') {
                    if (DEBUG) console.log('[LLM Chat Render] Rendering subsequent assistant message with marked:', msg.content.substring(0, 100) + '...');
                    if (typeof marked !== 'undefined') {
                        try {
                            contentSpan.innerHTML = marked.parse(msg.content);
                        } catch (e) {
                            console.error("[LLM Chat Render] Error parsing assistant message with marked:", e);
                            contentSpan.textContent = msg.content;
                            contentSpan.innerHTML = contentSpan.innerHTML.replace(/\n/g, '<br>');
                        }
                    } else {
                        console.warn("[LLM Chat Render] Marked library not loaded, using basic newline conversion for assistant message.");
                        contentSpan.textContent = msg.content;
                        contentSpan.innerHTML = contentSpan.innerHTML.replace(/\n/g, '<br>');
                    }
                } else {
                     console.warn("[LLM Chat Render] Unexpected content type for assistant message:", msg.content);
                     contentSpan.textContent = "[Error: Unexpected message format]";
                }

                msgDiv.appendChild(contentSpan);
                if (modelLabelDiv) { wrap.appendChild(modelLabelDiv); }
                wrap.appendChild(msgDiv);

            } else if (msg.role === 'user') {
                msgDiv.classList.add('user');
                msgDiv.textContent = msg.content;
                wrap.appendChild(msgDiv);
            }
        });
    }
    scrollToBottom();
 }

function scrollToBottom() { if (chatMessages) { setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; if (DEBUG) console.log('[LLM Chat] Scrolled to bottom.'); }, 0); } else { console.error("Cannot scroll: #chatMessages container not found."); } }
function focusInput() { setTimeout(() => { if (chatInput) { chatInput.focus(); if (DEBUG) console.log('[LLM Chat] Focused input.'); } else { console.error("Cannot focus: #chatInput not found."); } }, 150); }

// ==== CHAT FORM HANDLING (REVISED - Re-inject truncated snippet) ====
function handleFormSubmit(e) {
    if (e) e.preventDefault();
    if (DEBUG) console.log('[LLM Chat] Form submit triggered.');
    if (streaming) { if (DEBUG) console.log('[LLM Chat] Ignoring submit: Already streaming.'); return; }
    if (!selectedModelId) { showError("Cannot send message: No model selected or configured.", false); return; }
    if (!chatInput) { console.error("Cannot send: Input field not found!"); return; }

    const text = chatInput.value.trim();
    if (!text) return;

    // Add user message to state and render
    messages.push({ role: "user", content: text });
    renderMessages();
    chatInput.value = '';
    chatInput.style.height = '40px'; // Reset height
    chatInput.focus();

    // Prepare for streaming response
    streaming = true;
    currentStreamModel = selectedModelId;
    currentStreamRawContent = ""; // Reset raw content accumulator

    // Create placeholder for streaming response
    const messagesWrap = chatMessagesInnerDiv;
    if (!messagesWrap) { console.error("Cannot append streaming elements: .chat-messages-inner not found."); streaming = false; return; }
    const modelLabelDiv = document.createElement('div');
    modelLabelDiv.className = 'assistant-model-label';
    modelLabelDiv.textContent = `Model: ${currentStreamModel}`;
    messagesWrap.appendChild(modelLabelDiv);
    let streamContainer = document.createElement("div");
    streamContainer.className = 'msg assistant';
    streamContainer.innerHTML = `<span class="assistant-inner" id="activeStreamSpan"></span>`;
    messagesWrap.appendChild(streamContainer);
    currentStreamMsgSpan = streamContainer.querySelector('#activeStreamSpan');
    if (!currentStreamMsgSpan) { console.error("Failed to create #activeStreamSpan!"); streaming = false; return; }

    showLoadingIndicator(true);
    scrollToBottom();

    // Prepare messages for API
    let apiMessages = [];
    const isFirstUserTurn = messages.filter(m => m.role === 'user').length === 1;

    if (isFirstUserTurn && chatContext.domSnippet && chatContext.summary) {
        // First turn: Include system prompt, FULL DOM snippet, and RAW JSON summary string
        if (DEBUG) console.log("[LLM Chat] Preparing messages for FIRST turn.");
        apiMessages.push({ role: "system", content: "You are a helpful assistant. Format responses using Markdown where appropriate, but you can include simple HTML like <b> and <i>." });
        apiMessages.push({ role: "user", content: `Context:\nOriginal HTML Snippet:\n\`\`\`html\n${chatContext.domSnippet}\n\`\`\`\n\nInitial Summary (JSON Array of HTML strings):\n${chatContext.summary}` });
        apiMessages.push({ role: "user", content: text }); // The user's actual first question
    } else {
        // Subsequent turns: Send recent history AND prepend TRUNCATED original snippet context
        if (DEBUG) console.log("[LLM Chat] Preparing messages for SUBSEQUENT turn (injecting truncated snippet).");
        const historyLimit = 10; // Or adjust as needed
        const recentHistory = messages.slice(-historyLimit)
                              .filter(m => typeof m.content === 'string') // Exclude the initial summary array message
                              .map(m => ({ role: m.role, content: m.content }))
                              .filter(m => m.role === 'user' || m.role === 'assistant'); // Only user/assistant history

        // Prepend the original snippet context (truncated) if available
        if (chatContext.domSnippet) {
             let snippetForContext = chatContext.domSnippet;
             let truncated = false;
             if (snippetForContext.length > SNIPPET_TRUNCATION_LIMIT) {
                 snippetForContext = snippetForContext.substring(0, SNIPPET_TRUNCATION_LIMIT);
                 truncated = true;
                 if (DEBUG) console.log(`[LLM Chat] Snippet truncated to ${SNIPPET_TRUNCATION_LIMIT} chars.`);
             }
             apiMessages = [
                 { role: "user", content: `Context - Original HTML Snippet (may be truncated):\n\`\`\`html\n${snippetForContext}${truncated ? '\n[...truncated]' : ''}\n\`\`\`` },
                 ...recentHistory
             ];
        } else {
             apiMessages = recentHistory; // Send history without snippet if context is missing
        }

        // Add the current user's message to the end of the history
        apiMessages.push({ role: "user", content: text });
    }

    if (DEBUG) console.log('[LLM Chat] Sending message request to background. Model:', currentStreamModel, 'Payload:', apiMessages);
    chrome.runtime.sendMessage({ action: "llmChatStream", messages: apiMessages, model: currentStreamModel });
}


// ==== STREAMING HANDLERS ====
function setupStreamListeners() {
    if (messageListenerAttached) { if (DEBUG) console.log("[LLM Chat] Stream listeners already attached."); return; }
    if (DEBUG) console.log("[LLM Chat] Setting up stream listeners.");
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
        if (!req || !req.action) return;
        switch (req.action) {
            case "llmChatStreamChunk":
                if (streaming && currentStreamMsgSpan && typeof req.delta === 'string') {
                    currentStreamRawContent += req.delta;
                    if (typeof marked !== 'undefined') {
                        currentStreamMsgSpan.innerHTML = marked.parse(currentStreamRawContent);
                    } else {
                        currentStreamMsgSpan.textContent = currentStreamRawContent;
                    }
                    scrollToBottom();
                } else if (DEBUG) {
                    console.warn('[LLM Chat] Received chunk conditions not met:', { streaming, currentStreamMsgSpanExists: !!currentStreamMsgSpan, delta: req.delta });
                }
                break;
            case "llmChatStreamDone":
                if (streaming) {
                    if (DEBUG) console.log('[LLM Chat] Stream finished. Model reported:', req.model);
                    // Check if content is empty and potentially show a message
                    if (!currentStreamRawContent.trim()) {
                         console.warn(`[LLM Chat] Model ${req.model || currentStreamModel} returned an empty response.`);
                         // Optionally add a system message instead of an empty assistant one
                         // messages.push({ role: "system", content: `(Model ${req.model || currentStreamModel} returned an empty response)`});
                         // Or just push the empty response as before:
                         messages.push({ role: "assistant", content: currentStreamRawContent, model: req.model || currentStreamModel });
                    } else {
                         messages.push({ role: "assistant", content: currentStreamRawContent, model: req.model || currentStreamModel });
                    }
                    streaming = false;
                    currentStreamMsgSpan = null;
                    currentStreamRawContent = "";
                    currentStreamModel = "";
                    showLoadingIndicator(false);
                    renderMessages();
                    focusInput();
                } else if (DEBUG) {
                    console.warn('[LLM Chat] Received stream DONE but not streaming.');
                }
                break;
            case "llmChatStreamError":
                console.error('[LLM Chat] Stream Error from background:', req.error);
                showError(`LLM Error: ${req.error || "Unknown failure"}`, false);
                if (streaming) {
                    const tempLabel = document.querySelector('.assistant-model-label:last-of-type');
                    const tempMsg = document.querySelector('.msg.assistant:last-of-type');
                    if (tempMsg && tempMsg.querySelector('#activeStreamSpan')) {
                         if (tempLabel) tempLabel.remove();
                         tempMsg.remove();
                    }
                }
                streaming = false;
                currentStreamMsgSpan = null;
                currentStreamRawContent = "";
                currentStreamModel = "";
                showLoadingIndicator(false);
                focusInput();
                break;
        }
    });
    messageListenerAttached = true;
}


// ==== UI UTILITIES ====
function showLoadingIndicator(show) { const existingIndicator = document.getElementById('loadingIndicator'); if (existingIndicator) existingIndicator.remove(); if (show && chatMessagesInnerDiv) { const indicator = document.createElement('div'); indicator.id = 'loadingIndicator'; indicator.className = 'loading-indicator'; indicator.innerHTML = '<span></span><span></span><span></span>'; chatMessagesInnerDiv.appendChild(indicator); scrollToBottom(); } }
function showError(message, isFatal = true) { if (!errorDisplay) { errorDisplay = document.createElement('div'); errorDisplay.id = 'errorDisplay'; errorDisplay.style.display = 'none'; const chatContainer = document.querySelector('.chat-container'); if (chatContainer && chatMessages) { chatContainer.insertBefore(errorDisplay, chatMessages); } else if (chatContainer) { chatContainer.insertBefore(errorDisplay, chatContainer.firstChild); } else { document.body.insertBefore(errorDisplay, document.body.firstChild); } } errorDisplay.style.cssText = 'display: block; color: red; background-color: #ffebee; padding: 10px; border: 1px solid red; border-radius: 4px; margin: 10px auto; width: 80vw; max-width: 800px;'; errorDisplay.textContent = message; if (isFatal) { disableChatFunctionality(); } }
function setupTextareaResize() { if (chatInput) { if (DEBUG) console.log('[LLM Chat] Setting up textarea resize.'); const initialHeight = chatInput.style.height || '40px'; const maxHeight = 150; const resizeTextarea = () => { chatInput.style.height = 'auto'; const scrollHeight = chatInput.scrollHeight; chatInput.style.height = `${Math.min(scrollHeight, maxHeight)}px`; }; chatInput.addEventListener('input', resizeTextarea); chatInput.addEventListener('focus', resizeTextarea); chatInput.addEventListener('blur', () => { if (!chatInput.value.trim()) { chatInput.style.height = initialHeight; } }); } else { console.error("Textarea #chatInput not found for resize setup."); } }

// ==== Export/Save Functions ====
function formatChatAsMarkdown() {
    if (!messages || messages.length === 0) return "";
    let markdownContent = `# Chat Export\n\n`;
    messages.forEach((msg, index) => {
        if (msg.role === 'user') {
            markdownContent += `**User:**\n${msg.content}\n\n`;
        } else if (msg.role === 'assistant') {
            const modelInfo = msg.model ? ` (Model: ${msg.model})` : '';
            markdownContent += `**Assistant${modelInfo}:**\n`;
            if (index === 0 && Array.isArray(msg.content)) {
                if (DEBUG) console.log("[Export MD] Formatting initial summary array:", msg.content);
                msg.content.forEach((item, itemIndex) => {
                    let mdItem = String(item)
                                     .replace(/<b>(.*?)<\/b>/gi, '**$1**')
                                     .replace(/<i>(.*?)<\/i>/gi, '*$1*');
                    markdownContent += `${itemIndex + 1}. ${mdItem}\n`;
                });
                markdownContent += '\n';
            } else if (typeof msg.content === 'string') {
                if (DEBUG) console.log("[Export MD] Formatting subsequent assistant message:", msg.content.substring(0,100)+'...');
                let mdContent = msg.content;
                mdContent = msg.content.replace(/<b>(.*?)<\/b>/gi, '**$1**')
                                       .replace(/<i>(.*?)<\/i>/gi, '*$1*');
                // Note: TurndownService is not included by default, this check will likely fail unless added separately
                if (typeof TurndownService !== 'undefined') {
                     try {
                         const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
                         mdContent = turndownService.turndown(msg.content);
                     } catch(e) {
                         console.warn("[Export MD] Turndown conversion failed, using basic replacement:", e);
                     }
                }
                markdownContent += `${mdContent}\n\n`;
            } else {
                 markdownContent += `[Error: Could not format message content]\n\n`;
            }
        }
    });
    return markdownContent.trim();
}
function triggerDownload(content, filename, contentType) { try { const blob = new Blob([content], { type: `${contentType};charset=utf-8` }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); if (DEBUG) console.log(`[LLM Chat Export] Triggered download for ${filename}`); } catch (error) { console.error(`[LLM Chat Export] Error triggering download for ${filename}:`, error); showError(`Failed to initiate download: ${error.message}`, false); } }
function handleDownloadMd() { if (DEBUG) console.log('[LLM Chat Export] Download MD clicked.'); if (messages.length === 0) { showError("Cannot download: Chat history is empty.", false); return; } const markdownContent = formatChatAsMarkdown(); const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); triggerDownload(markdownContent, `chat_export_${timestamp}.md`, 'text/markdown'); }
function handleCopyMd() { if (DEBUG) console.log('[LLM Chat Export] Copy MD clicked.'); if (messages.length === 0) { showError("Cannot copy: Chat history is empty.", false); return; } const markdownContent = formatChatAsMarkdown(); if (!navigator.clipboard || !navigator.clipboard.writeText) { console.error('[LLM Chat Export] Clipboard API not available.'); showError('Cannot copy: Clipboard API is not available.', false); return; } navigator.clipboard.writeText(markdownContent).then(() => { if (DEBUG) console.log('[LLM Chat Export] Markdown copied.'); const originalText = copyMdBtn.textContent; copyMdBtn.textContent = 'Copied!'; copyMdBtn.disabled = true; setTimeout(() => { copyMdBtn.textContent = originalText; copyMdBtn.disabled = false; }, 1500); }).catch(err => { console.error('[LLM Chat Export] Failed to copy Markdown:', err); showError(`Failed to copy: ${err.message}`, false); const originalText = copyMdBtn.textContent; copyMdBtn.textContent = 'Error!'; setTimeout(() => { copyMdBtn.textContent = originalText; }, 2000); }); }
function handleDownloadJson() {
    if (DEBUG) console.log('[LLM Chat Export] Download JSON clicked.');
    if (messages.length === 0) { showError("Cannot download: Chat history is empty.", false); return; }
    try {
        const jsonContent = JSON.stringify(messages, null, 2);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        triggerDownload(jsonContent, `chat_export_${timestamp}.json`, 'application/json');
    } catch (error) {
        console.error('[LLM Chat Export] Failed to stringify messages:', error);
        showError(`Failed to create JSON data: ${error.message}`, false);
    }
}

// ==== Ctrl+Enter Listener Setup ====
function setupCtrlEnterListener() { if (!chatInput) { console.error("Cannot setup Ctrl+Enter: Textarea not found."); return; } if (DEBUG) console.log('[LLM Chat] Setting up Ctrl+Enter listener.'); chatInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { if (DEBUG) console.log('[LLM Chat] Ctrl+Enter detected.'); event.preventDefault(); if (sendButton && !sendButton.disabled) { if (DEBUG) console.log('[LLM Chat] Clicking Send button programmatically.'); sendButton.click(); } else { if (DEBUG) console.log('[LLM Chat] Send button not available or disabled.'); } } }); }
