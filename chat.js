/* chat.js */
// v2.6

// ==== GLOBAL STATE ====
let models = []; // Will store array of {id: string, label: string} objects
let selectedModelId = ""; // This is the variable holding the selected model ID
// chatContext.summary will now store the RAW JSON STRING received initially
// Added chatTargetLanguage
let chatContext = { domSnippet: null, summary: null, summaryModel: null, summaryLanguage: null, chatTargetLanguage: null }; // Added summaryLanguage and chatTargetLanguage
// messages[0].content might be an ARRAY of strings if initial summary parsed correctly
// messages[n>0].content will be a STRING (either original Markdown/text or processed text from JSON)
let messages = []; // Holds {role, content, model?} objects
let streaming = false;
let currentStreamMsgSpan = null;
let currentStreamRawContent = ""; // Accumulates raw chunks during streaming
// currentStreamModel is used *during* streaming to track the model reported by chunks,
// but selectedModelId is used to *start* the request.
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
    chrome.runtime.sendMessage({ action: "getChatContext" }, (response) => {
        if (chrome.runtime.lastError) { console.error('[LLM Chat] Error getting context from background:', chrome.runtime.lastError); showError(`Error loading chat context: ${chrome.runtime.lastError.message}. Please close this tab and try again.`); disableChatFunctionality(); return; }
        if (DEBUG) console.log('[LLM Chat] Received context response from background:', response);

        // Expect array of objects {id, label}
        if (response && Array.isArray(response.models) && response.models.length > 0 && response.models.every(m => typeof m === 'object' && m.id)) {
            models = response.models;
            populateModelDropdown(response.summaryModel);

            // Make sure necessary context fields exist before proceeding
            if (response.domSnippet && response.summary !== undefined && response.summary !== null) { // summary can be an empty string but should not be null/undefined
                chatContext.domSnippet = response.domSnippet;
                chatContext.summary = response.summary; // Store the RAW JSON STRING
                chatContext.summaryModel = response.summaryModel || (models.length > 0 ? models[0].id : "");
                chatContext.summaryLanguage = response.summaryLanguage || 'English'; // Store the language summary was generated in
                chatContext.chatTargetLanguage = response.chatTargetLanguage; // Store the target language if provided

                if (DEBUG) console.log('[LLM Chat] Context received. Raw summary:', chatContext.summary.substring(0, 200) + '...'); // Log truncated summary
                if (DEBUG) console.log('[LLM Chat] Summary Language:', chatContext.summaryLanguage);
                if (DEBUG) console.log('[LLM Chat] Chat Target Language:', chatContext.chatTargetLanguage);


                let initialContent;
                let parseError = false;
                // Attempt to parse the initial summary string stored in context
                const strippedInitialSummary = stripCodeFences(chatContext.summary);
                const parsedInitialSummary = tryParseJson(strippedInitialSummary);

                if (parsedInitialSummary !== null && Array.isArray(parsedInitialSummary)) {
                     if (DEBUG) console.log('[LLM Chat Init] Successfully parsed initial summary JSON into array:', parsedInitialSummary);
                     // Ensure all items in the initial summary array are strings
                     if (parsedInitialSummary.some(item => typeof item !== 'string')) {
                          console.warn('[LLM Chat Init] Initial summary array contains non-string elements, converting to strings.');
                          initialContent = parsedInitialSummary.map(item => String(item));
                     } else {
                          initialContent = parsedInitialSummary; // Use the parsed array if it contains only strings
                     }
                } else {
                    console.warn("[LLM Chat Init] Failed to parse initial summary JSON or it wasn't an array. Using raw string.");
                    // Store the raw summary string as content if parsing fails
                    initialContent = chatContext.summary; // Use the original raw string

                    // If the raw summary isn't empty, add a note that it couldn't be parsed
                     if (initialContent.trim() !== '' && typeof initialContent === 'string') {
                         initialContent = `<Error: Could not display initial summary in list format. Parsing failed.>\n\`\`\`json\n${initialContent}\n\`\`\``;
                         parseError = true; // Indicate a display error
                     } else {
                          initialContent = "(No initial summary provided)"; // Handle empty summary case
                     }
                }

                // Store the parsed array (or error string/raw string) for the first message
                messages = [{ role: "assistant", content: initialContent, model: chatContext.summaryModel }];
                renderMessages();
                if (parseError) { showError('Failed to parse the initial summary data for display.', false); }

                // --- Check for initial translation request ---
                if (chatContext.chatTargetLanguage && typeof chatContext.chatTargetLanguage === 'string' && chatContext.chatTargetLanguage.trim() !== '') {
                     if (DEBUG) console.log(`[LLM Chat Init] Initial translation requested for: ${chatContext.chatTargetLanguage}. Sending prompt.`);
                     const initialPrompt = `Say that in ${chatContext.chatTargetLanguage} and let's continue our conversation in ${chatContext.chatTargetLanguage}.`;
                     // Add this prompt as a user message to history and immediately send it
                     messages.push({ role: "user", content: initialPrompt });
                     renderMessages(); // Re-render to show the initial user prompt
                     sendChatRequestToBackground(initialPrompt); // Send the request to the LLM
                } else {
                     if (DEBUG) console.log('[LLM Chat Init] No chatTargetLanguage specified or invalid.');
                }


            } else {
                console.warn('[LLM Chat] Context received from background is incomplete (missing snippet or summary).');
                messages = [];
                renderMessages(); // Renders "Chat started..." message
                showError('Could not load initial summary context.', false);
            }
            focusInput(); // Focus input regardless of whether a translation prompt was sent
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
                 // OR if it's a string that starts with "<Error: Could not display initial summary"
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
                 // Handle error message for initial summary parsing
                else if (index === 0 && typeof msg.content === 'string' && msg.content.startsWith("<Error: Could not display initial summary")) {
                     if (DEBUG) console.log('[LLM Chat Render] Rendering initial summary parsing error message.');
                     if (typeof marked !== 'undefined') {
                          try {
                              contentSpan.innerHTML = marked.parse(msg.content);
                          } catch (e) {
                              console.error("[LLM Chat Render] Error parsing initial error message with marked:", e);
                              contentSpan.textContent = msg.content;
                          }
                     } else {
                         contentSpan.textContent = msg.content;
                     }
                }
                // Handle all other messages (including first if it succeeded parsing but wasn't an array,
                // or if it was an empty summary) as strings
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
                // Use marked for user messages too, to allow simple formatting
                 if (typeof marked !== 'undefined') {
                    try {
                         msgDiv.innerHTML = marked.parse(msg.content);
                    } catch (e) {
                         console.warn("[LLM Chat Render] Error parsing user message with marked:", e);
                         msgDiv.textContent = msg.content; // Fallback
                         msgDiv.innerHTML = msgDiv.innerHTML.replace(/\n/g, '<br>');
                    }
                 } else {
                     msgDiv.textContent = msg.content;
                     msgDiv.innerHTML = msgDiv.innerHTML.replace(/\n/g, '<br>');
                 }
                wrap.appendChild(msgDiv);
            }
        });
    }
    scrollToBottom();
 }

function scrollToBottom() { if (chatMessages) { setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; if (DEBUG) console.log('[LLM Chat] Scrolled to bottom.'); }, 0); } else { console.error("Cannot scroll: #chatMessages container not found."); } }
function focusInput() { setTimeout(() => { if (chatInput) { chatInput.focus(); if (DEBUG) console.log('[LLM Chat] Focused input.'); } else { console.error("Cannot focus: #chatInput not found."); } }, 150); }


// ==== CORE MESSAGE SENDING LOGIC ====
/**
 * Prepares messages and sends the chat request to the background script for streaming.
 * @param {string} userText The text from the user to send in this turn.
 */
function sendChatRequestToBackground(userText) {
     if (DEBUG) console.log('[LLM Chat] sendChatRequestToBackground triggered with text:', userText.substring(0, 100) + '...');
     if (streaming) { if (DEBUG) console.log('[LLM Chat] Ignoring send: Already streaming.'); return; }
     // Use selectedModelId here
     if (!selectedModelId) { showError("Cannot send message: No model selected or configured.", false); return; }

     streaming = true;
     // Use selectedModelId to indicate the model for the current stream *initially*
     currentStreamModel = selectedModelId;
     currentStreamRawContent = ""; // Reset raw content accumulator

    // Create placeholder for streaming response BEFORE sending request
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
    scrollToBottom(); // Scroll to show the new empty message bubble

     // Prepare messages for API
     let apiMessages = [];

     // Always include a general system prompt
     apiMessages.push({ role: "system", content: "You are a helpful assistant. Be concise and factual. Format responses using Markdown where appropriate, but you can include simple HTML like <b> and <i>. If asked to elaborate on a previous structured response, try to provide the elaboration as natural text or Markdown, not necessarily repeating the JSON structure unless it makes sense for clarity." });

     // Decide how to include context based on whether this is the very first turn
     // The very first user message was added in initializeChat or handleFormSubmit *before* this call.
     // We need to look at the history to determine if the *current* user message is the first one after the initial summary.
     const userMessageCount = messages.filter(m => m.role === 'user').length;
     // Check if the current userText is the content of the last message added to the messages array
     // This is the *simplest* way to check if it's the first user message initiated by the user/auto-prompt
     const isFirstUserTurn = userMessageCount === 1;


     if (isFirstUserTurn && chatContext.domSnippet && chatContext.summary !== undefined && chatContext.summary !== null) {
         // First user turn: Include FULL DOM snippet and RAW JSON summary string
         if (DEBUG) console.log("[LLM Chat] Preparing messages for FIRST user turn (including full snippet and raw summary).");
         // Add the full context *before* the current user message history
         apiMessages.push({ role: "user", content: `Context - Original HTML Snippet:\n\`\`\`html\n${chatContext.domSnippet}\n\`\`\`\n\nInitial Summary (JSON Array of HTML strings):\n${chatContext.summary}` });
         // Add the actual first user message
         apiMessages.push({ role: "user", content: userText });

     } else {
         // Subsequent turns: Send recent history AND prepend TRUNCATED original snippet context
         if (DEBUG) console.log("[LLM Chat] Preparing messages for SUBSEQUENT turn (injecting truncated snippet and recent history).");
         const historyLimit = 10; // Number of recent user/assistant messages to include

         // Filter history: Exclude the initial summary if it was an array, keep only strings
         // Get the last 'historyLimit' messages, *excluding* the current one we're about to add (userText)
         // Need to capture the history *before* the current user message
         // The messages array now contains the user message, so slice up to the last one.
         const historyBeforeCurrent = messages.slice(0, messages.length - 1); // All messages EXCEPT the last user message

         // Filter relevant history: Skip the first message if it was the initial summary array/error,
         // keep only strings for other roles, and take the last `historyLimit`
         const recentHistory = historyBeforeCurrent
                               .slice(1) // Skip the initial summary message (messages[0])
                               .filter(m => typeof m.content === 'string') // Ensure history content is string
                               .filter(m => m.role === 'user' || m.role === 'assistant') // Only include user/assistant
                               .slice(-historyLimit); // Take the last 'historyLimit' relevant messages


         // Prepend the original snippet context (truncated) if available
         if (chatContext.domSnippet) {
              let snippetForContext = chatContext.domSnippet;
              let truncated = false;
              if (snippetForContext.length > SNIPPET_TRUNCATION_LIMIT) {
                  snippetForContext = snippetForContext.substring(0, SNIPPET_TRUNCATION_LIMIT);
                  truncated = true;
                  if (DEBUG) console.log(`[LLM Chat] Snippet truncated to ${SNIPPET_TRUNCATION_LIMIT} chars.`);
              }
              // Add the truncated snippet context as a user message at the beginning of the history block
              apiMessages.push({ role: "user", content: `Context - Original HTML Snippet (may be truncated):\n\`\`\`html\n${snippetForContext}${truncated ? '\n[...truncated]' : ''}\n\`\`\`` });
         }
        // Add the recent history messages after the context/snippet
         apiMessages = apiMessages.concat(recentHistory.map(m => ({ role: m.role, content: m.content })));

         // Add the current user's message to the end
         apiMessages.push({ role: "user", content: userText });
     }


     if (DEBUG) console.log('[LLM Chat] Sending message request to background. Model:', selectedModelId, 'Payload messages:', apiMessages);
     // Use selectedModelId here
     chrome.runtime.sendMessage({ action: "llmChatStream", messages: apiMessages, model: selectedModelId });
}


// ==== CHAT FORM HANDLING (uses sendChatRequestToBackground) ====
function handleFormSubmit(e) {
    if (e) e.preventDefault();
    if (DEBUG) console.log('[LLM Chat] Form submit triggered.');
    if (streaming) { if (DEBUG) console.log('[LLM Chat] Ignoring submit: Already streaming.'); return; }
    if (!chatInput) { console.error("Cannot send: Input field not found!"); return; }

    const text = chatInput.value.trim();
    if (!text) return;

    // Add user message to state and render
    messages.push({ role: "user", content: text });
    renderMessages();
    chatInput.value = '';
    chatInput.style.height = '40px'; // Reset height
    chatInput.focus();

    // Send the message using the new function
    sendChatRequestToBackground(text);
}


// ==== STREAMING HANDLERS (MODIFIED for better JSON handling) ====
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
                            // Note: Incremental marked rendering can be tricky with code blocks, etc.
                            // For simplicity, we'll just update the innerHTML with the new chunk for now.
                            // A more robust solution might involve accumulating chunks and parsing markdown only at the end or using a specialized library.
                            // Let's append the delta directly for responsiveness, accepting potential temporary rendering glitches.
                            // NO, let's stick to marked parse on accumulated content for better final render.
                             currentStreamMsgSpan.innerHTML = marked.parse(currentStreamRawContent);
                        } catch (e) {
                            // Fallback if marked fails during streaming
                            console.warn("[LLM Chat Stream] Marked parsing error during chunking:", e);
                            currentStreamMsgSpan.textContent = currentStreamRawContent; // Fallback to text
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
                    let jsonExtractedText = null;
                    let trailingText = "";
                    let leadingText = "";

                    // Attempt to find and parse JSON within the raw content
                    // Look for ```json ... ``` or ``` ... ``` fences first
                    const jsonMatch = currentStreamRawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                    let potentialJsonString = null;

                    if (jsonMatch && jsonMatch[1]) {
                         potentialJsonString = jsonMatch[1].trim();
                         // Capture text *before* the first fence
                         leadingText = currentStreamRawContent.substring(0, jsonMatch.index).trim();
                         // Capture text *after* the last fence
                         trailingText = currentStreamRawContent.substring(jsonMatch.index + jsonMatch[0].length).trim();

                         if (DEBUG) console.log('[LLM Chat JSON] Found fenced JSON. Content to parse:', potentialJsonString.substring(0, Math.min(potentialJsonString.length, 100))+'...');
                         if (DEBUG && leadingText) console.log('[LLM Chat JSON] Captured leading text before fences:', leadingText.substring(0, Math.min(leadingText.length, 100))+'...');
                         if (DEBUG && trailingText) console.log('[LLM Chat JSON] Captured trailing text after fences:', trailingText.substring(0, Math.min(trailingText.length, 100))+'...');

                    } else {
                         // No fences found, attempt to parse the whole raw content directly as JSON
                         potentialJsonString = currentStreamRawContent.trim();
                         if (DEBUG) console.log('[LLM Chat JSON] No fences found, attempting to parse raw content as JSON:', potentialJsonString.substring(0, Math.min(potentialJsonString.length, 100))+'...');
                         // No leading/trailing text captured if no fences
                    }

                    let parsedJson = null;
                    if (potentialJsonString) {
                         parsedJson = tryParseJson(potentialJsonString);
                    }

                    if (parsedJson !== null) {
                        if (DEBUG) console.log('[LLM Chat JSON] Successfully parsed potential JSON.');
                        jsonExtractedText = extractTextFromJson(parsedJson); // This might still be null
                        if (jsonExtractedText === null) {
                             if (DEBUG) console.warn('[LLM Chat JSON] Parsed JSON but could not extract recognizable text structure.');
                        } else {
                             if (DEBUG) console.log('[LLM Chat JSON] Successfully extracted text from parsed JSON.');
                        }
                    } else {
                         if (DEBUG) console.log('[LLM Chat JSON] Failed to parse potential JSON.');
                         // If parsing failed and fences were found, the content outside fences is the primary text
                         if (jsonMatch) {
                             processedContent = (leadingText + (leadingText && trailingText ? '\n\n' : '') + trailingText).trim();
                              if (DEBUG) console.log('[LLM Chat JSON] Parsing failed, using text outside fences:', processedContent.substring(0, Math.min(processedContent.length, 100))+'...');
                         } else {
                              // No fences and parsing failed, use the original raw content as text
                              processedContent = currentStreamRawContent.trim();
                              if (DEBUG) console.log('[LLM Chat JSON] No fences and parsing failed, using raw content as text.');
                         }
                    }

                    // Final processed content combines elements:
                    // 1. Any leading text found before fences
                    // 2. The extracted text *from* the JSON (if successful) OR the text outside fences (if parsing failed but fences existed) OR the raw content (if no fences and parsing failed)
                    // 3. Any trailing text found after fences

                    let finalContentParts = [];
                    if (leadingText) finalContentParts.push(leadingText);
                    // Add the core content based on extraction success
                    if (jsonExtractedText !== null) {
                         finalContentParts.push(jsonExtractedText);
                         if (trailingText) finalContentParts.push(trailingText); // Add trailing text if extraction succeeded
                    } else {
                         // If JSON extraction failed, processedContent holds the fallback (text outside fences or raw content)
                         finalContentParts.push(processedContent);
                         // Note: trailingText is implicitly included in processedContent if fences existed
                    }

                    // Join parts with double newlines, filtering empty parts
                    processedContent = finalContentParts.filter(part => part.trim() !== '').join('\n\n');


                    // Check if final processed content is empty
                    if (!processedContent.trim()) {
                         console.warn(`[LLM Chat] Model ${req.model || currentStreamModel} returned an empty or non-processable response.`);
                         // Store an empty string or a placeholder message
                         messages.push({ role: "assistant", content: "(Model returned empty response)", model: req.model || currentStreamModel });
                    } else {
                         // Store the processed content
                         messages.push({ role: "assistant", content: processedContent, model: req.model || currentStreamModel });
                    }

                    streaming = false;
                    currentStreamMsgSpan = null; // Clear reference after stream is done
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
                    // Ensure we only remove the *last* assistant message if it's our streaming placeholder
                    if (tempMsg && tempMsg.querySelector('#activeStreamSpan')) {
                         if (tempLabel) tempLabel.remove();
                         tempMsg.remove();
                    } else {
                         // If the placeholder wasn't found (unexpected), still try to add an error message
                         messages.push({ role: "assistant", content: `Error receiving stream: ${req.error || "Unknown error"}`, model: currentStreamModel || 'Error' });
                         renderMessages(); // Re-render to show the error message
                    }
                }
                streaming = false;
                currentStreamMsgSpan = null; // Clear reference after error
                currentStreamRawContent = "";
                currentStreamModel = "";
                showLoadingIndicator(false);
                focusInput();
                break;
        }
        // The stream handlers don't send a response back to the background script.
        // sendResponse({}); // Removed as per background.js comments for streams
    });
    messageListenerAttached = true;
}

// ==== JSON Processing Helper Functions (with more logs) ====

/**
 * Removes optional ```json ... ``` or ``` ... ``` fences.
 * @param {string} text - The raw text potentially containing fences.
 * @returns {string} - The text inside the fences, or the original text if no fences found.
 */
function stripCodeFences(text) {
    if (typeof text !== 'string') return text;
    // Match starting ``` followed by optional 'json', then any characters non-greedily,
    // then ending ``` at the end of the string (or before whitespace/newlines at the end)
    const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
    return match && match[1] ? match[1].trim() : text.trim();
}

/**
 * Attempts to parse a string as JSON. Logs success/failure.
 * @param {string} text - The string to parse.
 * @returns {object | array | null} - The parsed JSON object/array, or null if parsing fails.
 */
function tryParseJson(text) {
    if (typeof text !== 'string' || text.trim() === '') {
         if (DEBUG) console.log('[LLM Chat JSON: tryParseJson] Input is not a string or is empty.');
        return null;
    }
     const trimmedText = text.trim();
    if (!trimmedText.startsWith('[') && !trimmedText.startsWith('{')) {
         if (DEBUG) console.log('[LLM Chat JSON: tryParseJson] Input does not start with [ or { after trim. Potential JSON mismatch.');
        return null; // Quick check for potential JSON format start
    }
    try {
        const parsed = JSON.parse(trimmedText);
        if (DEBUG) console.log('[LLM Chat JSON: tryParseJson] Successfully parsed JSON.');
        return parsed;
    } catch (e) {
        if (DEBUG) console.warn('[LLM Chat JSON: tryParseJson] Parsing failed:', e.message);
        return null;
    }
}

/**
 * Extracts readable text from common JSON structures returned by the LLM. Logs steps.
 * @param {object | array} jsonData - The parsed JSON data.
 * @returns {string | null} - A formatted string, or null if the structure is unrecognized or yields no text.
 */
function extractTextFromJson(jsonData) {
    if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Input type:', Array.isArray(jsonData) ? 'array' : typeof jsonData);
    if (Array.isArray(jsonData)) {
        // Case 1: Array of strings (or things that convert to non-empty strings)
        // Check if *all* items are primitives that become non-empty strings when trimmed
        const isArrayOfStringsLike = jsonData.every(item => typeof item !== 'object' && item !== null && String(item).trim() !== '');
        if (isArrayOfStringsLike) {
            if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Handling array of strings/primitives.');
            // Convert all items to strings and join, handling potential null/undefined/empty
            const extracted = jsonData.map(item => String(item).trim()).filter(item => item !== '').join('\n\n');
            if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Extracted from array of strings:', extracted.substring(0, Math.min(extracted.length, 100))+'...');
             // Return null if the extraction results in an empty string after joining and trimming
            return extracted.trim() !== '' ? extracted : null;

        }
        // Case 2: Array of objects (like {point, elaboration})
        // Check if *all* items are non-null objects that are NOT arrays
        const isArrayOfObjects = jsonData.every(item => typeof item === 'object' && item !== null && !Array.isArray(item));
        if (isArrayOfObjects) {
             if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Handling array of objects.');
             let result = [];
             for (const item of jsonData) {
                 let pointText = item.point || item.title || item.header || '';
                 let elaborationText = item.elaboration || item.details || item.content || item.text || '';

                 // Try to find any *meaningful* string property if standard keys fail
                 if (!pointText && !elaborationText) {
                     if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Standard keys not found, searching object properties.');
                     for (const key in item) {
                         if (typeof item[key] === 'string' && item[key].trim() !== '') {
                              // Simple heuristic: take the first non-empty string found
                              pointText = item[key].trim();
                              if (DEBUG) console.log(`[LLM Chat JSON: extractTextFromJson] Found property "${key}" for point:`, pointText.substring(0, Math.min(pointText.length, 50))+'...');
                              break; // Found the main point
                         }
                     }
                 } else {
                      if (typeof pointText === 'string') pointText = pointText.trim(); else pointText = '';
                      if (typeof elaborationText === 'string') elaborationText = elaborationText.trim(); else elaborationText = '';
                      if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Used standard keys. Point:', pointText.substring(0, Math.min(pointText.length, 50))+'...', 'Elaboration:', elaborationText.substring(0, Math.min(elaborationText.length, 50))+'...');
                 }


                 let formattedItem = "";
                 if (pointText) {
                     // Assume pointText might already contain Markdown (like **)
                     formattedItem += `${pointText}`;
                 }
                 // Add elaboration if it exists and isn't the same as the point (handle cases like {point: "...", text: "..."})
                 if (elaborationText && elaborationText !== pointText) {
                     formattedItem += (pointText ? `\n${elaborationText}` : `${elaborationText}`);
                 }
                 if (formattedItem) {
                     result.push(formattedItem);
                 } else {
                      if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Item in array of objects yielded no text.');
                 }
             }
             if (result.length > 0) {
                  const extracted = result.join('\n\n');
                  if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Extracted from array of objects:', extracted.substring(0, Math.min(extracted.length, 100))+'...');
                  return extracted;
             } else {
                  if (DEBUG) console.warn('[LLM Chat JSON: extractTextFromJson] No extractable text found in array of objects.');
                  return null;
             }
        }
        // If it's an array but doesn't fit Case 1 or Case 2 (e.g., mixed types, array of arrays)
        if (DEBUG) console.warn('[LLM Chat JSON: extractTextFromJson] Array structure not recognized.');
        return null;

    }
     // Case 3: Simple object with string properties
    else if (typeof jsonData === 'object' && jsonData !== null) { // Check if it's a non-null object (and not an array, already handled)
         if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Handling simple object.');
         let result = [];
         for (const key in jsonData) {
             if (typeof jsonData[key] === 'string' && jsonData[key].trim() !== '') {
                 // Simple approach: just join the non-empty string values
                 result.push(jsonData[key].trim());
             } else if (typeof jsonData[key] === 'object' && jsonData[key] !== null) {
                 // Recursive call for nested objects/arrays - limit recursion depth if needed
                 if (DEBUG) console.log(`[LLM Chat JSON: extractTextFromJson] Found nested object/array under key "${key}", attempting recursive extraction.`);
                 const nestedText = extractTextFromJson(jsonData[key]);
                 if (nestedText) {
                     result.push(nestedText);
                 } else {
                     if (DEBUG) console.log(`[LLM Chat JSON: extractTextFromJson] Recursive extraction from "${key}" yielded no text.`);
                 }
             } else {
                 if (DEBUG) console.log(`[LLM Chat JSON: extractTextFromJson] Skipping non-string, non-object property "${key}".`);
             }
         }
         if (result.length > 0) {
             const extracted = result.join('\n\n');
             if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Extracted from simple object:', extracted.substring(0, Math.min(extracted.length, 100))+'...');
             return extracted;
         } else {
              if (DEBUG) console.warn('[LLM Chat JSON: extractTextFromJson] No extractable text found in simple object.');
              return null;
         }
    }


    if (DEBUG) console.warn('[LLM Chat JSON: extractTextFromJson] Input is not a recognized object or array type.');
    return null; // Input is not a recognized object or array type
}


// ==== UI UTILITIES (unchanged) ====
function showLoadingIndicator(show) { const existingIndicator = document.getElementById('loadingIndicator'); if (existingIndicator) existingIndicator.remove(); if (show && chatMessagesInnerDiv) { const indicator = document.createElement('div'); indicator.id = 'loadingIndicator'; indicator.className = 'loading-indicator'; indicator.innerHTML = '<span></span><span></span><span></span>'; chatMessagesInnerDiv.appendChild(indicator); scrollToBottom(); } }
function showError(message, isFatal = true) { if (!errorDisplay) { errorDisplay = document.createElement('div'); errorDisplay.id = 'errorDisplay'; errorDisplay.style.display = 'none'; const chatContainer = document.querySelector('.chat-container'); if (chatContainer && chatMessages) { chatContainer.insertBefore(errorDisplay, chatMessages); } else if (chatContainer) { chatContainer.insertBefore(errorDisplay, chatContainer.firstChild); } else { document.body.insertBefore(errorDisplay, document.body.firstChild); } } errorDisplay.style.cssText = 'display: block; color: red; background-color: #ffebee; padding: 10px; border: 1px solid red; border-radius: 4px; margin: 10px auto; width: 80vw; max-width: 800px;'; errorDisplay.textContent = message; if (isFatal) { disableChatFunctionality(); } }
function setupTextareaResize() { if (chatInput) { if (DEBUG) console.log('[LLM Chat] Setting up textarea resize.'); const initialHeight = chatInput.style.height || '40px'; const maxHeight = 150; const resizeTextarea = () => { chatInput.style.height = 'auto'; const scrollHeight = chatInput.scrollHeight; chatInput.style.height = `${Math.min(scrollHeight, maxHeight)}px`; }; chatInput.addEventListener('input', resizeTextarea); chatInput.addEventListener('focus', resizeTextarea); chatInput.addEventListener('blur', () => { if (!chatInput.value.trim()) { chatInput.style.height = initialHeight; } }); } else { console.error("Textarea #chatInput not found for resize setup."); } }

// ==== Export/Save Functions (unchanged) ====
function formatChatAsMarkdown() {
    if (!messages || messages.length === 0) return "";
    let markdownContent = `# Chat Export\n\n`;
    messages.forEach((msg, index) => {
        if (msg.role === 'user') {
            markdownContent += `**User:**\n${msg.content}\n\n`;
        } else if (msg.role === 'assistant') {
            const modelInfo = msg.model ? ` (Model: ${msg.model})` : '';
            markdownContent += `**Assistant${modelInfo}:**\n`;

            // Special handling for the first message if it was parsed as an array
             // Or if it was the initial error message string
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
             // Handle error message for initial summary parsing
             else if (index === 0 && typeof msg.content === 'string' && msg.content.startsWith("<Error: Could not display initial summary")) {
                  markdownContent += `[Error displaying initial summary]:\n\n${msg.content}\n\n`;
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

// ==== Ctrl+Enter Listener Setup (unchanged) ====
function setupCtrlEnterListener() { if (!chatInput) { console.error("Cannot setup Ctrl+Enter: Textarea not found."); return; } if (DEBUG) console.log('[LLM Chat] Setting up Ctrl+Enter listener.'); chatInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { if (DEBUG) console.log('[LLM Chat] Ctrl+Enter detected.'); event.preventDefault(); if (sendButton && !sendButton.disabled) { if (DEBUG) console.log('[LLM Chat] Clicking Send button programmatically.'); sendButton.click(); } else { if (DEBUG) console.log('[LLM Chat] Send button not available or disabled.'); } } }); }
