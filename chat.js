// chat.js
// v2.12 - Use background for context/debug state

// ==== GLOBAL STATE ====
let models = [];
let selectedModelId = "";
let chatContext = { domSnippet: null, summary: null, chatTargetLanguage: null };
let messages = [];
let streaming = false;
let currentStreamMsgSpan = null;
let currentStreamRawContent = "";
let currentStreamModel = "";
let DEBUG = false; // Updated by getChatContext response
let chatMessagesInnerDiv = null;
let messageListenerAttached = false;
const SNIPPET_TRUNCATION_LIMIT = 65536;

// ==== DOM Element References ====
let downloadMdBtn, copyMdBtn, downloadJsonBtn, chatInput, modelSelect, chatForm, chatMessages, errorDisplay, sendButton;

// ==== INITIALIZATION ====

document.addEventListener('DOMContentLoaded', () => {
    console.log('[LLM Chat] DOMContentLoaded event fired.');

    // Cache DOM Elements
    chatMessagesInnerDiv = document.querySelector('.chat-messages-inner');
    downloadMdBtn = document.getElementById('downloadMdBtn');
    copyMdBtn = document.getElementById('copyMdBtn');
    downloadJsonBtn = document.getElementById('downloadJsonBtn');
    chatInput = document.getElementById('chatInput');
    modelSelect = document.getElementById('modelSelect');
    chatForm = document.getElementById('chatForm');
    chatMessages = document.getElementById('chatMessages');
    errorDisplay = document.getElementById('errorDisplay');
    sendButton = chatForm ? chatForm.querySelector('button[type="submit"]') : null;

    if (!chatMessagesInnerDiv || !downloadMdBtn || !copyMdBtn || !downloadJsonBtn || !chatInput || !modelSelect || !chatForm || !chatMessages || !sendButton) {
        console.error("CRITICAL: Could not find essential UI elements! Aborting initialization.");
        document.body.innerHTML = '<div style="color: red; padding: 20px; font-family: sans-serif;">Error: Chat UI structure is missing essential elements. Cannot load chat.</div>';
        return;
    }
    console.log('[LLM Chat] Found essential UI elements.');

    if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
        console.log('[LLM Chat] Marked library loaded and configured.');
    } else {
        console.warn("Marked library failed to load! Markdown rendering will use basic newline conversion.");
    }

    // Fetch initial context AND debug state from background
    initializeChat();
});

function initializeChat() {
    if (DEBUG) console.log('[LLM Chat] Initializing chat page...'); // Debug might be false initially

    // Request context (which now includes debug state)
    chrome.runtime.sendMessage({ action: "getChatContext" }, (response) => {
        if (chrome.runtime.lastError) { console.error('[LLM Chat] Error getting context from background:', chrome.runtime.lastError); showError(`Error loading chat context: ${chrome.runtime.lastError.message}. Please close this tab and try again.`); disableChatFunctionality(); return; }

        // --- Set DEBUG state from response ---
        DEBUG = !!response?.debug;
        if (DEBUG) console.log('[LLM Chat] Debug mode enabled via background context.');
        // --- End Set DEBUG state ---

        if (DEBUG) console.log('[LLM Chat] Received context response from background:', response);

        if (response && Array.isArray(response.models) && response.models.length > 0 && response.models.every(m => typeof m === 'object' && m.id)) {
            models = response.models;
            // Pass summaryModel from context if available (though not strictly needed anymore)
            populateModelDropdown(response.summaryModel);

            if (response.domSnippet && response.summary !== undefined && response.summary !== null) {
                chatContext.domSnippet = response.domSnippet;
                chatContext.summary = response.summary; // Raw JSON string
                chatContext.chatTargetLanguage = response.chatTargetLanguage;

                if (DEBUG) console.log('[LLM Chat] Context received. Raw summary:', chatContext.summary.substring(0, 200) + '...');
                if (DEBUG) console.log('[LLM Chat] Chat Target Language:', chatContext.chatTargetLanguage);

                let initialContent;
                let parseError = false;
                const strippedInitialSummary = stripCodeFences(chatContext.summary);
                const parsedInitialSummary = tryParseJson(strippedInitialSummary);

                if (parsedInitialSummary !== null && Array.isArray(parsedInitialSummary)) {
                     if (DEBUG) console.log('[LLM Chat Init] Successfully parsed initial summary JSON into array:', parsedInitialSummary);
                     initialContent = parsedInitialSummary.every(item => typeof item === 'string')
                         ? parsedInitialSummary
                         : parsedInitialSummary.map(item => String(item)); // Ensure strings
                } else {
                    console.warn("[LLM Chat Init] Failed to parse initial summary JSON or it wasn't an array. Using raw string.");
                    initialContent = chatContext.summary;
                     if (initialContent.trim() !== '' && typeof initialContent === 'string') {
                         initialContent = `<Error: Could not display initial summary in list format. Parsing failed.>\n\`\`\`json\n${initialContent}\n\`\`\``;
                         parseError = true;
                     } else {
                          initialContent = "(No initial summary provided)";
                     }
                }

                // Use the first model in the list as the 'source' model for the initial summary display
                const initialModelDisplay = models.length > 0 ? models[0].id : 'Unknown';
                messages = [{ role: "assistant", content: initialContent, model: initialModelDisplay }];
                renderMessages();
                if (parseError) { showError('Failed to parse the initial summary data for display.', false); }

                if (chatContext.chatTargetLanguage?.trim()) {
                     if (DEBUG) console.log(`[LLM Chat Init] Initial translation requested for: ${chatContext.chatTargetLanguage}. Sending prompt.`);
                     const initialPrompt = `Say that in ${chatContext.chatTargetLanguage} and let's continue our conversation in ${chatContext.chatTargetLanguage}.`;
                     messages.push({ role: "user", content: initialPrompt });
                     renderMessages();
                     sendChatRequestToBackground(initialPrompt);
                } else {
                     if (DEBUG) console.log('[LLM Chat Init] No chatTargetLanguage specified.');
                }

            } else {
                console.warn('[LLM Chat] Context received from background is incomplete.');
                messages = [];
                renderMessages();
                showError('Could not load initial summary context.', false);
            }
            focusInput();
        } else {
            console.error('[LLM Chat] Failed to get valid context or models list.', response);
            showError('Error: Could not load models list from settings.');
            disableChatFunctionality();
        }
    });
    chatForm.removeEventListener('submit', handleFormSubmit); chatForm.addEventListener('submit', handleFormSubmit);
    setupStreamListeners(); setupTextareaResize();
    downloadMdBtn.addEventListener('click', handleDownloadMd); copyMdBtn.addEventListener('click', handleCopyMd); downloadJsonBtn.addEventListener('click', handleDownloadJson);
    setupCtrlEnterListener();
    console.log('[LLM Chat] Initialization complete.');
}

// --- Other functions remain largely unchanged ---
// (disableChatFunctionality, populateModelDropdown, renderMessages, scrollToBottom, focusInput,
//  sendChatRequestToBackground, handleFormSubmit, setupStreamListeners, stripCodeFences,
//  tryParseJson, extractTextFromJson, showLoadingIndicator, showError, setupTextareaResize,
//  formatChatAsMarkdown, triggerDownload, handleDownloadMd, handleCopyMd, handleDownloadJson,
//  setupCtrlEnterListener)
// --- (Definitions omitted for brevity, same as previous version) ---
function disableChatFunctionality() { /* ... */ }
function populateModelDropdown(preferredModelId) { /* ... */ }
function renderMessages() { /* ... */ }
function scrollToBottom() { /* ... */ }
function focusInput() { /* ... */ }
function sendChatRequestToBackground(userText) { /* ... */ }
function handleFormSubmit(e) { /* ... */ }
function setupStreamListeners() { /* ... */ }
function stripCodeFences(text) { /* ... */ }
function tryParseJson(text) { /* ... */ }
function extractTextFromJson(jsonData) { /* ... */ }
function showLoadingIndicator(show) { /* ... */ }
function showError(message, isFatal = true) { /* ... */ }
function setupTextareaResize() { /* ... */ }
function formatChatAsMarkdown() { /* ... */ }
function triggerDownload(content, filename, contentType) { /* ... */ }
function handleDownloadMd() { /* ... */ }
function handleCopyMd() { /* ... */ }
function handleDownloadJson() { /* ... */ }
function setupCtrlEnterListener() { /* ... */ }
