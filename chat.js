/* chat.js */
// v2.3.3 - Added JSON detection and processing for assistant responses during chat.

// ==== GLOBAL STATE ====
let models = []; // Will store array of {id: string, label: string} objects
let selectedModelId = "";
// chatContext.summary will now store the RAW JSON STRING received initially
let chatContext = { domSnippet: null, summary: null, summaryModel: null };
// messages[0].content might be an ARRAY of strings if initial summary parsed correctly
// messages[n>0].content will be a STRING (either original Markdown/text or processed text from JSON)
let messages = []; // Holds {role, content, model?} objects
let streaming = false;
let currentStreamMsgSpan = null;
let currentStreamRawContent = ""; // Accumulates raw chunks during streaming
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
                    let jsonStringToParse = stripCodeFences(chatContext.summary); // Use helper
                    initialContent = tryParseJson(jsonStringToParse); // Use helper

                    if (initialContent === null || !Array.isArray(initialContent)) {
                        throw new Error('Parsed summary is not a valid array.');
                    }
                    if (initialContent.some(item => typeof item !== 'string')) {
                         console.warn('[LLM Chat Init] Initial summary array contains non-string elements.');
                         initialContent = initialContent.map(item => String(item));
                    }
                    if (DEBUG) console.log('[LLM Chat Init] Successfully parsed initial summary JSON into array:', initialContent);
                } catch (e) {
                    console.error("[LLM Chat Init] Failed to parse initial summary JSON:", e);
                    // Store the raw summary string as content if parsing fails
                    initialContent = `<Error: Could not display initial summary. Parsing failed. Raw data follows:>\n${chatContext.summary}`;
                    parseError = true;
                }

                // Store the parsed array (or error string) for the first message
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

                // Special handling for the *first* message if it was parsed as an array
                if (index === 0 && Array.isArray(msg.content)) {
                    if (DEBUG) console.log('[LLM Chat Render] Rendering initial summary from array:', msg.content);
                    try {
                        // Render the initial summary array as an HTML list
                        const listHtml = '<ul>' + msg.content.map(item => `<li>${item}</li>`).join('') + '</ul>';
                        contentSpan.innerHTML = listHtml;
                    } catch (e) {
                         console.error("[LLM Chat Render] Error creating list HTML for initial summary:", e);
                         contentSpan.textContent = "Error displaying initial summary.";
                    }
                }
                // Handle all other messages (including first if it failed parsing) as strings
                else if (typeof msg.content === 'string') {
                    if (DEBUG) console.log(`[LLM Chat Render] Rendering message index ${index} with marked:`, msg.content.substring(0, 100) + '...');
                    if (typeof marked !== 'undefined') {
                        try {
                            // Render using marked (handles Markdown and basic HTML)
                            contentSpan.innerHTML = marked.parse(msg.content);
                        } catch (e) {
                            console.error(`[LLM Chat Render] Error parsing message index ${index} with marked:`, e);
                            contentSpan.textContent = msg.content; // Fallback to text
                            contentSpan.innerHTML = contentSpan.innerHTML.replace(/\n/g, '<br>'); // Basic newline conversion
                        }
                    } else {
                        console.warn("[LLM Chat Render] Marked library not loaded, using basic newline conversion.");
                        contentSpan.textContent = msg.content;
                        contentSpan.innerHTML = contentSpan.innerHTML.replace(/\n/g, '<br>');
                    }
                } else {
                     console.warn(`[LLM Chat Render] Unexpected content type for message index ${index}:`, msg.content);
                     contentSpan.textContent = "[Error: Unexpected message format]";
                }

                msgDiv.appendChild(contentSpan);
                if (modelLabelDiv) { wrap.appendChild(modelLabelDiv); }
                wrap.appendChild(msgDiv);

            } else if (msg.role === 'user') {
                msgDiv.classList.add('user');
                msgDiv.textContent = msg.content; // User messages are plain text
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
        apiMessages.push({ role: "system", content: "Be specific, concise, you are on a fact-finding missoin, not on a social chat. Format responses using Markdown where appropriate, but you can include simple HTML like <b> and <i>. If asked to elaborate on a previous structured response, try to provide the elaboration as natural text or Markdown, not necessarily repeating the JSON structure unless it makes sense for clarity." });
        apiMessages.push({ role: "user", content: `Context:\nOriginal HTML Snippet:\n\`\`\`html\n${chatContext.domSnippet}\n\`\`\`\n\nInitial Summary (JSON Array of HTML strings):\n${chatContext.summary}` });
        apiMessages.push({ role: "user", content: text }); // The user's actual first question
    } else {
        // Subsequent turns: Send recent history AND prepend TRUNCATED original snippet context
        if (DEBUG) console.log("[LLM Chat] Preparing messages for SUBSEQUENT turn (injecting truncated snippet).");
        const historyLimit = 10; // Or adjust as needed

        // Filter history: Exclude the initial summary if it was an array, keep only strings
        const recentHistory = messages.slice(-historyLimit)
                              .filter(m => typeof m.content === 'string') // IMPORTANT: Only include string content
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
                 // Add system prompt hint here too for subsequent turns
                 { role: "system", content: "You are a helpful assistant. Format responses using Markdown where appropriate, but you can include simple HTML like <b> and <i>. If asked to elaborate on a previous structured response, try to provide the elaboration as natural text or Markdown, not necessarily repeating the JSON structure unless it makes sense for clarity." },
                 { role: "user", content: `Context - Original HTML Snippet (may be truncated):\n\`\`\`html\n${snippetForContext}${truncated ? '\n[...truncated]' : ''}\n\`\`\`` },
                 ...recentHistory
             ];
        } else {
             apiMessages = [
                 // Add system prompt hint even if no snippet
                 { role: "system", content: "You are a helpful assistant. Format responses using Markdown where appropriate, but you can include simple HTML like <b> and <i>. If asked to elaborate on a previous structured response, try to provide the elaboration as natural text or Markdown, not necessarily repeating the JSON structure unless it makes sense for clarity." },
                 ...recentHistory // Send history without snippet if context is missing
             ];
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
                    // Render incrementally using marked
                    if (typeof marked !== 'undefined') {
                        try {
                            // Attempt to render the raw content as it comes
                            currentStreamMsgSpan.innerHTML = marked.parse(currentStreamRawContent);
                        } catch (e) {
                            // Fallback if marked fails during streaming
                            console.warn("[LLM Chat Stream] Marked parsing error during chunking:", e);
                            currentStreamMsgSpan.textContent = currentStreamRawContent;
                        }
                    } else {
                        currentStreamMsgSpan.textContent = currentStreamRawContent; // Fallback if marked not loaded
                    }
                    scrollToBottom();
                } else if (DEBUG) {
                    console.warn('[LLM Chat] Received chunk conditions not met:', { streaming, currentStreamMsgSpanExists: !!currentStreamMsgSpan, delta: req.delta });
                }
                break;
            case "llmChatStreamDone":
                if (streaming) {
                    if (DEBUG) console.log('[LLM Chat] Stream finished. Model reported:', req.model);
                    if (DEBUG) console.log('[LLM Chat] Raw content received:', currentStreamRawContent);

                    let processedContent = currentStreamRawContent; // Default to raw content
                    let wasProcessed = false;

                    // --- Try to process potential JSON ---
                    const strippedContent = stripCodeFences(currentStreamRawContent);
                    const parsedJson = tryParseJson(strippedContent);

                    if (parsedJson !== null) {
                        if (DEBUG) console.log('[LLM Chat] Detected JSON response, attempting to extract text.');
                        const extractedText = extractTextFromJson(parsedJson);
                        if (extractedText !== null) {
                            processedContent = extractedText; // Use the extracted text
                            wasProcessed = true;
                            if (DEBUG) console.log('[LLM Chat] Successfully extracted text from JSON:', processedContent.substring(0,100)+'...');
                        } else {
                            if (DEBUG) console.warn('[LLM Chat] Could not extract text from parsed JSON structure. Storing raw.');
                            // Keep processedContent as currentStreamRawContent
                        }
                    } else {
                         if (DEBUG) console.log('[LLM Chat] Response not detected as JSON or failed parsing. Storing raw.');
                         // Keep processedContent as currentStreamRawContent
                    }
                    // --- End JSON processing ---

                    // Check if content is empty after potential processing
                    if (!processedContent.trim()) {
                         console.warn(`[LLM Chat] Model ${req.model || currentStreamModel} returned an empty or non-processable response.`);
                         // Store an empty string or a placeholder message
                         messages.push({ role: "assistant", content: "(Model returned empty response)", model: req.model || currentStreamModel });
                    } else {
                         // Store the processed (or raw if processing failed/skipped) content
                         messages.push({ role: "assistant", content: processedContent, model: req.model || currentStreamModel });
                    }

                    streaming = false;
                    currentStreamMsgSpan = null;
                    currentStreamRawContent = "";
                    currentStreamModel = "";
                    showLoadingIndicator(false);
                    renderMessages(); // Re-render with the final, potentially processed message
                    focusInput();
                } else if (DEBUG) {
                    console.warn('[LLM Chat] Received stream DONE but not streaming.');
                }
                break;
            case "llmChatStreamError":
                console.error('[LLM Chat] Stream Error from background:', req.error);
                showError(`LLM Error: ${req.error || "Unknown failure"}`, false);
                if (streaming) {
                    // Clean up temporary streaming elements
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

// ==== JSON Processing Helper Functions ====

/**
 * Removes optional ```json ... ``` or ``` ... ``` fences.
 * @param {string} text - The raw text potentially containing fences.
 * @returns {string} - The text inside the fences, or the original text if no fences found.
 */
function stripCodeFences(text) {
    if (typeof text !== 'string') return text;
    const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return match && match[1] ? match[1].trim() : text.trim();
}

/**
 * Attempts to parse a string as JSON.
 * @param {string} text - The string to parse.
 * @returns {object | array | null} - The parsed JSON object/array, or null if parsing fails.
 */
function tryParseJson(text) {
    if (typeof text !== 'string' || (!text.startsWith('[') && !text.startsWith('{'))) {
        return null; // Quick check for potential JSON
    }
    try {
        return JSON.parse(text);
    } catch (e) {
        if (DEBUG) console.log('[LLM Chat JSON] Parsing failed:', e.message);
        return null;
    }
}

/**
 * Extracts readable text from common JSON structures returned by the LLM.
 * @param {object | array} jsonData - The parsed JSON data.
 * @returns {string | null} - A formatted string, or null if the structure is unrecognized.
 */
function extractTextFromJson(jsonData) {
    if (Array.isArray(jsonData)) {
        // Case 1: Array of strings
        if (jsonData.every(item => typeof item === 'string')) {
            if (DEBUG) console.log('[LLM Chat JSON] Handling array of strings.');
            return jsonData.join('\n\n'); // Join strings with double newline for paragraph breaks
        }
        // Case 2: Array of objects (like {point, elaboration})
        else if (jsonData.every(item => typeof item === 'object' && item !== null)) {
             if (DEBUG) console.log('[LLM Chat JSON] Handling array of objects.');
             let result = [];
             for (const item of jsonData) {
                 let pointText = item.point || item.title || item.header || '';
                 let elaborationText = item.elaboration || item.details || item.content || item.text || '';

                 // Try to find any string property if standard keys fail
                 if (!pointText && !elaborationText) {
                     for (const key in item) {
                         if (typeof item[key] === 'string') {
                             if (!pointText) pointText = item[key];
                             else if (!elaborationText) elaborationText = item[key];
                             else break; // Found two strings, good enough
                         }
                     }
                 }

                 let formattedItem = "";
                 if (pointText) {
                     // Assume pointText might already contain Markdown (like **)
                     formattedItem += `${pointText}`;
                 }
                 if (elaborationText) {
                     formattedItem += (pointText ? `\n${elaborationText}` : `${elaborationText}`);
                 }
                 if (formattedItem) {
                     result.push(formattedItem);
                 }
             }
             return result.join('\n\n'); // Join formatted items with double newline
        }
    }
    // Add more cases here if needed for other JSON structures
    if (DEBUG) console.warn('[LLM Chat JSON] Unrecognized JSON structure:', jsonData);
    return null; // Structure not recognized
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

            // Special handling for the first message if it's the initial summary array
            if (index === 0 && Array.isArray(msg.content)) {
                if (DEBUG) console.log("[Export MD] Formatting initial summary array:", msg.content);
                msg.content.forEach((item, itemIndex) => {
                    // Convert simple <b> and <i> back to Markdown for export
                    let mdItem = String(item)
                                     .replace(/<b>(.*?)<\/b>/gi, '**$1**')
                                     .replace(/<i>(.*?)<\/i>/gi, '*$1*');
                    markdownContent += `${itemIndex + 1}. ${mdItem}\n`;
                });
                markdownContent += '\n';
            }
            // Handle all other messages as strings (they should be processed text now)
            else if (typeof msg.content === 'string') {
                if (DEBUG) console.log(`[Export MD] Formatting message index ${index}:`, msg.content.substring(0,100)+'...');
                // Content is already processed text/Markdown, just append it
                markdownContent += `${msg.content}\n\n`;
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
        // Export the messages array as is (content will be processed strings or initial array)
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
