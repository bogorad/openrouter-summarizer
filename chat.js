// This JS handles chat.html UI, message rendering, and communication with the background script for LLM streaming.

// ==== GLOBAL STATE ====
let models = [];
let selectedModelId = "";
let chatContext = { domSnippet: null, summary: null, summaryModel: null };
let messages = []; // Holds {role, content, model?} objects
let streaming = false;
let currentStreamMsgSpan = null;
let currentStreamRawContent = "";
let currentStreamModel = "";
let DEBUG = false;
let chatMessagesInnerDiv = null;
let messageListenerAttached = false; // Prevent duplicate listeners

// ==== DOM Element References ====
let downloadMdBtn = null;
let copyMdBtn = null;
let downloadJsonBtn = null;
let chatInput = null;
let modelSelect = null;
let chatForm = null;
let chatMessages = null;
let errorDisplay = null;
let sendButton = null; // Added reference for Send button

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
    sendButton = chatForm ? chatForm.querySelector('button[type="submit"]') : null; // Get Send button
    // --- End Caching ---

    // --- Critical Element Check ---
    if (!chatMessagesInnerDiv || !downloadMdBtn || !copyMdBtn || !downloadJsonBtn || !chatInput || !modelSelect || !chatForm || !chatMessages || !sendButton) { // Check sendButton too
        console.error("CRITICAL: Could not find essential UI elements! Aborting initialization.", {
            chatMessagesInnerDiv: !!chatMessagesInnerDiv, downloadMdBtn: !!downloadMdBtn, copyMdBtn: !!copyMdBtn,
            downloadJsonBtn: !!downloadJsonBtn, chatInput: !!chatInput, modelSelect: !!modelSelect,
            chatForm: !!chatForm, chatMessages: !!chatMessages, sendButton: !!sendButton
        });
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

    // Get initial context and models
    chrome.runtime.sendMessage({ action: "getChatContext" }, (response) => {
        // ... (rest of context/model loading logic remains the same) ...
        if (chrome.runtime.lastError) {
            console.error('[LLM Chat] Error getting context from background:', chrome.runtime.lastError);
            showError(`Error loading chat context: ${chrome.runtime.lastError.message}. Please close this tab and try again.`);
            disableChatFunctionality(); return;
        }
        if (DEBUG) console.log('[LLM Chat] Received context response from background:', response);
        if (response && Array.isArray(response.models) && response.models.length > 0) {
            models = response.models;
            populateModelDropdown(response.summaryModel);
            if (response.domSnippet && response.summary) {
                chatContext.domSnippet = response.domSnippet; chatContext.summary = response.summary;
                chatContext.summaryModel = response.summaryModel || selectedModelId;
                if (DEBUG) console.log('[LLM Chat] Context received successfully. Populating UI.');
                messages = [{ role: "assistant", content: chatContext.summary, model: chatContext.summaryModel }];
                renderMessages();
            } else {
                console.warn('[LLM Chat] Context received from background is incomplete.');
                messages = []; renderMessages();
                showError('Could not load initial summary context.', false);
            }
            focusInput();
        } else {
            console.error('[LLM Chat] Failed to get valid context or models list.', response);
            showError('Error: Could not load models list from settings.');
            disableChatFunctionality();
        }
    });

    // Setup form listener
    chatForm.removeEventListener('submit', handleFormSubmit); // Prevent duplicates
    chatForm.addEventListener('submit', handleFormSubmit);

    // Setup streaming listeners
    setupStreamListeners();

    // Setup textarea resize
    setupTextareaResize();

    // --- Setup Export Button Listeners ---
    downloadMdBtn.addEventListener('click', handleDownloadMd);
    copyMdBtn.addEventListener('click', handleCopyMd);
    downloadJsonBtn.addEventListener('click', handleDownloadJson);
    // --- End Export Listeners ---

    // --- Setup Ctrl+Enter Listener ---
    setupCtrlEnterListener(); // Call the new setup function
    // --- End Ctrl+Enter Listener ---


     console.log('[LLM Chat] Initialization complete.');
}

function disableChatFunctionality() {
    console.warn('[LLM Chat] Disabling chat functionality.');
    if (chatInput) chatInput.disabled = true;
    if (sendButton) sendButton.disabled = true; // Use cached reference
    if (modelSelect) modelSelect.disabled = true;
    if (downloadMdBtn) downloadMdBtn.disabled = true;
    if (copyMdBtn) copyMdBtn.disabled = true;
    if (downloadJsonBtn) downloadJsonBtn.disabled = true;
 }

function populateModelDropdown(preferredModelId) {
    if (!modelSelect) return;
    modelSelect.innerHTML = ''; modelSelect.disabled = false;
    if (!models || models.length === 0) {
        console.error("[LLM Chat] No models available to populate dropdown.");
        const opt = document.createElement('option'); opt.value = ""; opt.textContent = "No models configured"; opt.disabled = true;
        modelSelect.appendChild(opt); modelSelect.disabled = true; selectedModelId = ""; return;
    }
    models.forEach(modelId => { const opt = document.createElement('option'); opt.value = modelId; opt.textContent = modelId; modelSelect.appendChild(opt); });
    if (preferredModelId && typeof preferredModelId === 'string' && models.includes(preferredModelId)) { modelSelect.value = preferredModelId; selectedModelId = preferredModelId; }
    else if (models.length > 0) { modelSelect.value = models[0]; selectedModelId = models[0]; }
    else { selectedModelId = ""; }
    if (DEBUG) console.log(`[LLM Chat] Model dropdown populated. Initial selection: ${selectedModelId}`);
    modelSelect.onchange = function() { selectedModelId = this.value; if (DEBUG) console.log(`[LLM Chat] Model selection changed to: ${selectedModelId}`); };
 }

// ==== RENDERING ====
function renderMessages() {
    const wrap = chatMessagesInnerDiv;
    if (!wrap) { console.error("Cannot render messages: .chat-messages-inner div not found."); return; }
    if (DEBUG) console.log(`[LLM Chat Render] Rendering ${messages.length} messages.`);
    wrap.innerHTML = '';
    if (messages.length === 0) { wrap.innerHTML = '<div class="msg system-info">Chat started. Ask a follow-up question...</div>'; }
    else {
        messages.forEach((msg, index) => {
            const msgDiv = document.createElement('div'); msgDiv.classList.add('msg');
            if (msg.role === 'assistant') {
                msgDiv.classList.add('assistant'); let modelLabelDiv = null;
                if (msg.model) { modelLabelDiv = document.createElement('div'); modelLabelDiv.className = 'assistant-model-label'; modelLabelDiv.textContent = `Model: ${msg.model}`; }
                const contentSpan = document.createElement('span'); contentSpan.className = 'assistant-inner';
                const isInitialSummary = index === 0 && msg.content === chatContext.summary; let htmlContent = '';
                const contentToProcess = (typeof msg.content === 'string') ? msg.content : '';
                if (isInitialSummary && contentToProcess.includes('<') && !contentToProcess.includes('```')) { if (DEBUG) console.log('[LLM Chat Render] Treating initial summary as pre-formatted HTML.'); htmlContent = contentToProcess; }
                else if (typeof marked !== 'undefined') {
                     if (DEBUG && !isInitialSummary) console.log('[LLM Chat Render] Parsing subsequent message content with marked.');
                     if (DEBUG && isInitialSummary) console.log('[LLM Chat Render] Parsing initial summary content with marked.');
                     try { htmlContent = marked.parse(contentToProcess); } catch (e) { console.error("[LLM Chat Render] Error parsing Markdown:", e); htmlContent = contentToProcess.replace(/\n/g, '<br>'); }
                } else { htmlContent = contentToProcess.replace(/\n/g, '<br>'); }
                contentSpan.innerHTML = htmlContent; msgDiv.appendChild(contentSpan);
                if (modelLabelDiv) { wrap.appendChild(modelLabelDiv); } wrap.appendChild(msgDiv);
            } else if (msg.role === 'user') {
                msgDiv.classList.add('user'); msgDiv.textContent = msg.content; wrap.appendChild(msgDiv);
            }
        });
    }
    scrollToBottom();
 }

function scrollToBottom() {
    if (chatMessages) { setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; if (DEBUG) console.log('[LLM Chat] Scrolled to bottom.'); }, 0); }
    else { console.error("Cannot scroll: #chatMessages container not found."); }
 }

function focusInput() {
    setTimeout(() => { if (chatInput) { chatInput.focus(); if (DEBUG) console.log('[LLM Chat] Focused input.'); } else { console.error("Cannot focus: #chatInput not found."); } }, 150);
 }

// ==== CHAT FORM HANDLING ====
function handleFormSubmit(e) {
    // Allow calling without event object (from Ctrl+Enter)
    if (e) e.preventDefault();
    if (DEBUG) console.log('[LLM Chat] Form submit triggered.');

    if (streaming) { if (DEBUG) console.log('[LLM Chat] Ignoring submit: Already streaming.'); return; }
    if (!selectedModelId) { showError("Cannot send message: No model selected or configured.", false); return; }
    if (!chatInput) { console.error("Cannot send: Input field not found!"); return; }
    const text = chatInput.value.trim(); if (!text) return; // Ignore empty input

    messages.push({ role: "user", content: text }); renderMessages();
    chatInput.value = ''; chatInput.style.height = '40px'; chatInput.focus();

    streaming = true; currentStreamModel = selectedModelId; currentStreamRawContent = "";
    const messagesWrap = chatMessagesInnerDiv;
    if (!messagesWrap) { console.error("Cannot append streaming elements: .chat-messages-inner not found."); streaming = false; return; }

    const modelLabelDiv = document.createElement('div'); modelLabelDiv.className = 'assistant-model-label'; modelLabelDiv.textContent = `Model: ${currentStreamModel}`; messagesWrap.appendChild(modelLabelDiv);
    let streamContainer = document.createElement("div"); streamContainer.className = 'msg assistant'; streamContainer.innerHTML = `<span class="assistant-inner" id="activeStreamSpan"></span>`; messagesWrap.appendChild(streamContainer);
    currentStreamMsgSpan = streamContainer.querySelector('#activeStreamSpan');
    if (!currentStreamMsgSpan) { console.error("Failed to create #activeStreamSpan!"); streaming = false; return; }

    showLoadingIndicator(true); scrollToBottom();

    let apiMessages = []; const isFirstUserTurn = messages.filter(m => m.role === 'user').length === 1;
    if (isFirstUserTurn && chatContext.domSnippet && chatContext.summary) {
        apiMessages.push({ role: "system", content: "You are a helpful assistant... Please format responses using Markdown." });
        apiMessages.push({ role: "user", content: `Original HTML Snippet:\n\`\`\`html\n${chatContext.domSnippet}\n\`\`\`\n\nInitial Summary (from model ${chatContext.summaryModel || 'unknown'}):\n${chatContext.summary}` });
        apiMessages.push({ role: "user", content: text });
    } else {
        const historyLimit = 10; apiMessages = messages.slice(-historyLimit).map(m => ({ role: m.role, content: m.content })).filter(m => m.role === 'user' || m.role === 'assistant');
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
                if (streaming && currentStreamMsgSpan && typeof req.delta === 'string') { currentStreamRawContent += req.delta; currentStreamMsgSpan.textContent = currentStreamRawContent; scrollToBottom(); }
                else if (DEBUG) { console.warn('[LLM Chat] Received chunk conditions not met:', { streaming, currentStreamMsgSpanExists: !!currentStreamMsgSpan, delta: req.delta }); }
                break;
            case "llmChatStreamDone":
                if (streaming) {
                    if (DEBUG) console.log('[LLM Chat] Stream finished. Model reported:', req.model);
                    messages.push({ role: "assistant", content: currentStreamRawContent, model: req.model || currentStreamModel });
                    streaming = false; currentStreamMsgSpan = null; currentStreamRawContent = ""; currentStreamModel = ""; showLoadingIndicator(false);
                    renderMessages(); focusInput();
                } else if (DEBUG) { console.warn('[LLM Chat] Received stream DONE but not streaming.'); }
                break;
            case "llmChatStreamError":
                console.error('[LLM Chat] Stream Error from background:', req.error); showError(`LLM Error: ${req.error || "Unknown failure"}`, false);
                if (streaming) { renderMessages(); } // Remove placeholder
                streaming = false; currentStreamMsgSpan = null; currentStreamRawContent = ""; currentStreamModel = ""; showLoadingIndicator(false); focusInput();
                break;
        }
    });
    messageListenerAttached = true;
}

// ==== UI UTILITIES ====
function showLoadingIndicator(show) {
    const existingIndicator = document.getElementById('loadingIndicator'); if (existingIndicator) existingIndicator.remove();
    if (show && chatMessagesInnerDiv) { const indicator = document.createElement('div'); indicator.id = 'loadingIndicator'; indicator.className = 'loading-indicator'; indicator.innerHTML = '<span>.</span><span>.</span><span>.</span>'; chatMessagesInnerDiv.appendChild(indicator); scrollToBottom(); }
}
function showError(message, isFatal = true) {
     if (!errorDisplay) { // Create if doesn't exist (fallback)
         errorDisplay = document.createElement('div'); errorDisplay.id = 'errorDisplay'; errorDisplay.style.display = 'none';
         const chatContainer = document.getElementById('chatContainer');
         if (chatContainer && chatMessages) { chatContainer.insertBefore(errorDisplay, chatMessages); }
         else if (chatContainer) { chatContainer.insertBefore(errorDisplay, chatContainer.firstChild); }
         else { document.body.insertBefore(errorDisplay, document.body.firstChild); }
     }
    errorDisplay.style.cssText = 'display: block; color: red; background-color: #ffebee; padding: 10px; border: 1px solid red; border-radius: 4px; margin: 10px auto; width: 80vw; max-width: 800px;';
    errorDisplay.textContent = message;
    if (isFatal) { disableChatFunctionality(); }
}
function setupTextareaResize() {
    if (chatInput) { if (DEBUG) console.log('[LLM Chat] Setting up textarea resize.'); const initialHeight = chatInput.style.height || '40px'; const maxHeight = 150;
        const resizeTextarea = () => { chatInput.style.height = 'auto'; const scrollHeight = chatInput.scrollHeight; chatInput.style.height = `${Math.min(scrollHeight, maxHeight)}px`; };
        chatInput.addEventListener('input', resizeTextarea); chatInput.addEventListener('focus', resizeTextarea);
        chatInput.addEventListener('blur', () => { if (!chatInput.value.trim()) { chatInput.style.height = initialHeight; } });
    } else { console.error("Textarea #chatInput not found for resize setup."); }
 }

// ==== Export/Save Functions ====
function formatChatAsMarkdown() {
    if (!messages || messages.length === 0) return ""; let markdownContent = `# Chat Export\n\n`;
    messages.forEach(msg => {
        if (msg.role === 'user') { markdownContent += `**User:**\n${msg.content}\n\n`; }
        else if (msg.role === 'assistant') { const modelInfo = msg.model ? ` (Model: ${msg.model})` : ''; markdownContent += `**Assistant${modelInfo}:**\n${msg.content}\n\n`; }
    }); return markdownContent.trim();
}
function triggerDownload(content, filename, contentType) {
    try {
        const blob = new Blob([content], { type: `${contentType};charset=utf-8` }); const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        if (DEBUG) console.log(`[LLM Chat Export] Triggered download for ${filename}`);
    } catch (error) { console.error(`[LLM Chat Export] Error triggering download for ${filename}:`, error); showError(`Failed to initiate download: ${error.message}`, false); }
}
function handleDownloadMd() {
    if (DEBUG) console.log('[LLM Chat Export] Download MD clicked.'); if (messages.length === 0) { showError("Cannot download: Chat history is empty.", false); return; }
    const markdownContent = formatChatAsMarkdown(); const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    triggerDownload(markdownContent, `chat_export_${timestamp}.md`, 'text/markdown');
}
function handleCopyMd() {
    if (DEBUG) console.log('[LLM Chat Export] Copy MD clicked.'); if (messages.length === 0) { showError("Cannot copy: Chat history is empty.", false); return; }
    const markdownContent = formatChatAsMarkdown();
    if (!navigator.clipboard || !navigator.clipboard.writeText) { console.error('[LLM Chat Export] Clipboard API not available.'); showError('Cannot copy: Clipboard API is not available.', false); return; }
    navigator.clipboard.writeText(markdownContent).then(() => {
        if (DEBUG) console.log('[LLM Chat Export] Markdown copied.'); const originalText = copyMdBtn.textContent; copyMdBtn.textContent = 'Copied!'; copyMdBtn.disabled = true;
        setTimeout(() => { copyMdBtn.textContent = originalText; copyMdBtn.disabled = false; }, 1500);
    }).catch(err => {
        console.error('[LLM Chat Export] Failed to copy Markdown:', err); showError(`Failed to copy: ${err.message}`, false);
        const originalText = copyMdBtn.textContent; copyMdBtn.textContent = 'Error!'; setTimeout(() => { copyMdBtn.textContent = originalText; }, 2000);
    });
}
function handleDownloadJson() {
    if (DEBUG) console.log('[LLM Chat Export] Download JSON clicked.'); if (messages.length === 0) { showError("Cannot download: Chat history is empty.", false); return; }
    try {
        const jsonContent = JSON.stringify(messages, null, 2); const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        triggerDownload(jsonContent, `chat_export_${timestamp}.json`, 'application/json');
    } catch (error) { console.error('[LLM Chat Export] Failed to stringify messages:', error); showError(`Failed to create JSON data: ${error.message}`, false); }
}

// ==== Ctrl+Enter Listener Setup (NEW) ====
function setupCtrlEnterListener() {
    if (!chatInput) {
        console.error("Cannot setup Ctrl+Enter: Textarea not found.");
        return;
    }
    if (DEBUG) console.log('[LLM Chat] Setting up Ctrl+Enter listener.');

    chatInput.addEventListener('keydown', (event) => {
        // Check for Ctrl+Enter or Cmd+Enter
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            if (DEBUG) console.log('[LLM Chat] Ctrl+Enter detected.');
            event.preventDefault(); // Prevent newline in textarea

            // Trigger the form submission logic
            // Check if send button exists and is not disabled
            if (sendButton && !sendButton.disabled) {
                 if (DEBUG) console.log('[LLM Chat] Clicking Send button programmatically.');
                 sendButton.click(); // Simulate clicking the send button
                 // Alternatively, call handleFormSubmit directly: handleFormSubmit(null);
            } else {
                 if (DEBUG) console.log('[LLM Chat] Send button not available or disabled, cannot send via Ctrl+Enter.');
            }
        }
    });
}
