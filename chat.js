// chat.js
// v2.20

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
  // Keep one unconditional log to know the script started
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
  // Log element finding conditionally later

  if (typeof marked !== 'undefined') {
    marked.setOptions({ breaks: true, gfm: true });
    // Log marked config conditionally later
  } else {
    console.warn("Marked library failed to load! Markdown rendering will use basic newline conversion."); // Keep warning unconditional
  }

  // Fetch initial context AND debug state from background
  initializeChat();
});

function initializeChat() {
  // Request context (which now includes debug state)
  chrome.runtime.sendMessage({ action: "getChatContext" }, (response) => {
    if (chrome.runtime.lastError) { console.error('[LLM Chat] Error getting context from background:', chrome.runtime.lastError); showError(`Error loading chat context: ${chrome.runtime.lastError.message}. Please close this tab and try again.`); disableChatFunctionality(); return; }

    // --- Set DEBUG state from response ---
    DEBUG = !!response?.debug;
    // --- Now we can log conditionally ---
    if (DEBUG) {
      console.log('[LLM Chat] Debug mode enabled via background context.');
      console.log('[LLM Chat] Found essential UI elements.'); // Log element finding
      if (typeof marked !== 'undefined') {
        console.log('[LLM Chat] Marked library loaded and configured.'); // Log marked config
      }
      console.log('[LLM Chat] Initializing chat page...');
      console.log('[LLM Chat] Received context response from background:', response);
    }
    // --- End Set DEBUG state ---


    if (response && Array.isArray(response.models) && response.models.length > 0 && response.models.every(m => typeof m === 'object' && m.id)) {
      models = response.models;
      populateModelDropdown(response.summaryModel);

      if (response.domSnippet && response.summary !== undefined && response.summary !== null) {
        chatContext.domSnippet = response.domSnippet;
        chatContext.summary = response.summary; // Raw JSON string
        chatContext.chatTargetLanguage = response.chatTargetLanguage;

        if (DEBUG) console.log('[LLM Chat] Context received. Raw summary assigned:', typeof chatContext.summary === 'string' ? chatContext.summary.substring(0, 300) + '...' : chatContext.summary);
        if (DEBUG) console.log('[LLM Chat] Chat Target Language:', chatContext.chatTargetLanguage);

        let initialContent;
        let parseError = false;

        if (DEBUG) console.log('[LLM Chat Debug] Attempting to parse summary. Type:', typeof chatContext.summary);
        const summaryBeforeStrip = chatContext.summary;
        const strippedInitialSummary = stripCodeFences(summaryBeforeStrip);
        if (DEBUG) console.log('[LLM Chat Debug] Summary after stripCodeFences:', typeof strippedInitialSummary === 'string' ? strippedInitialSummary.substring(0, 300) + '...' : strippedInitialSummary);
        if (DEBUG && summaryBeforeStrip !== strippedInitialSummary) console.log('[LLM Chat Debug] stripCodeFences modified the summary.');

        // Use default logWarningOnFail=true for initial summary parse attempt
        const parsedInitialSummary = tryParseJson(strippedInitialSummary);

        if (parsedInitialSummary !== null && Array.isArray(parsedInitialSummary)) {
          if (DEBUG) console.log('[LLM Chat Init] Successfully parsed initial summary JSON into array:', parsedInitialSummary);
          initialContent = parsedInitialSummary.every(item => typeof item === 'string')
            ? parsedInitialSummary
            : parsedInitialSummary.map(item => String(item));
        } else {
          console.warn("[LLM Chat Init] Failed to parse initial summary JSON or it wasn't an array. Using raw string. Parsed value was:", parsedInitialSummary);
          initialContent = chatContext.summary;
          if (initialContent?.trim() && typeof initialContent === 'string') {
            initialContent = `<Error: Could not display initial summary in list format. Parsing failed.>\n\`\`\`json\n${initialContent}\n\`\`\``;
            parseError = true;
          } else {
            initialContent = "(No initial summary provided or summary was empty)";
          }
        }

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
        console.warn('[LLM Chat] Context received from background is incomplete (missing snippet or summary). Response keys:', Object.keys(response || {}));
        messages = [];
        renderMessages();
        showError('Could not load initial summary context.', false);
      }
      focusInput(); // Keep focus unconditional
    } else {
      console.error('[LLM Chat] Failed to get valid context or models list.', response);
      showError('Error: Could not load models list from settings.');
      disableChatFunctionality();
    }
  });
  // Attach listeners (keep unconditional)
  chatForm.removeEventListener('submit', handleFormSubmit); chatForm.addEventListener('submit', handleFormSubmit);
  setupStreamListeners(); setupTextareaResize();
  downloadMdBtn.addEventListener('click', handleDownloadMd); copyMdBtn.addEventListener('click', handleCopyMd); downloadJsonBtn.addEventListener('click', handleDownloadJson);
  setupCtrlEnterListener();
  // Log completion conditionally
  if (DEBUG) console.log('[LLM Chat] Initialization complete.');
}

function disableChatFunctionality() { console.warn('[LLM Chat] Disabling chat functionality.'); if (chatInput) chatInput.disabled = true; if (sendButton) sendButton.disabled = true; if (modelSelect) modelSelect.disabled = true; if (downloadMdBtn) downloadMdBtn.disabled = true; if (copyMdBtn) copyMdBtn.disabled = true; if (downloadJsonBtn) downloadJsonBtn.disabled = true; }

function populateModelDropdown(preferredModelId) {
  if (!modelSelect) return;
  modelSelect.innerHTML = ''; modelSelect.disabled = false;
  if (!models || models.length === 0) { console.error("[LLM Chat] No models available for dropdown."); const opt = document.createElement('option'); opt.value = ""; opt.textContent = "No models configured"; opt.disabled = true; modelSelect.appendChild(opt); modelSelect.disabled = true; selectedModelId = ""; return; }
  models.forEach(model => { const opt = document.createElement('option'); opt.value = model.id; opt.textContent = model.label || model.id; modelSelect.appendChild(opt); });
  const availableModelIds = models.map(m => m.id);
  if (preferredModelId && typeof preferredModelId === 'string' && availableModelIds.includes(preferredModelId)) { modelSelect.value = preferredModelId; selectedModelId = preferredModelId; }
  else if (models.length > 0) { modelSelect.value = models[0].id; selectedModelId = models[0].id; }
  else { selectedModelId = ""; }
  if (DEBUG) console.log(`[LLM Chat] Model dropdown populated. Initial selection: ${selectedModelId}`);
  modelSelect.onchange = function() { selectedModelId = this.value; if (DEBUG) console.log(`[LLM Chat] Model selection changed to: ${selectedModelId}`); };
}

function renderMessages() {
  const wrap = chatMessagesInnerDiv; if (!wrap) { console.error("Cannot render messages: .chat-messages-inner div not found."); return; }
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
        if (index === 0 && Array.isArray(msg.content)) {
          if (DEBUG) console.log('[LLM Chat Render] Rendering initial summary from array:', msg.content);
          try { const listHtml = '<ul>' + msg.content.map(item => `<li>${item}</li>`).join('') + '</ul>'; contentSpan.innerHTML = listHtml; }
          catch (e) { console.error("[LLM Chat Render] Error creating list HTML for initial summary:", e); contentSpan.textContent = "Error displaying initial summary."; }
        } else if (index === 0 && typeof msg.content === 'string' && msg.content.startsWith("<Error: Could not display initial summary")) {
          if (DEBUG) console.log('[LLM Chat Render] Rendering initial summary parsing error message.');
          if (typeof marked !== 'undefined') { try { contentSpan.innerHTML = marked.parse(msg.content); } catch (e) { console.error("[LLM Chat Render] Error parsing initial error message with marked:", e); contentSpan.textContent = msg.content; } }
          else { contentSpan.textContent = msg.content; }
        } else if (typeof msg.content === 'string') {
          if (DEBUG) console.log(`[LLM Chat Render] Rendering message index ${index} with marked:`, msg.content.substring(0, 100) + '...');
          if (typeof marked !== 'undefined') { try { contentSpan.innerHTML = marked.parse(msg.content); } catch (e) { console.error(`[LLM Chat Render] Error parsing message index ${index} with marked:`, e); contentSpan.textContent = msg.content; contentSpan.innerHTML = contentSpan.innerHTML.replace(/\n/g, '<br>'); } }
          else { console.warn("[LLM Chat Render] Marked library not loaded, using basic newline conversion."); contentSpan.textContent = msg.content; contentSpan.innerHTML = contentSpan.innerHTML.replace(/\n/g, '<br>'); }
        } else { console.warn(`[LLM Chat Render] Unexpected content type for message index ${index}:`, msg.content); contentSpan.textContent = "[Error: Unexpected message format]"; }
        msgDiv.appendChild(contentSpan); if (modelLabelDiv) { wrap.appendChild(modelLabelDiv); } wrap.appendChild(msgDiv);
      } else if (msg.role === 'user') {
        msgDiv.classList.add('user');
        if (typeof marked !== 'undefined') { try { msgDiv.innerHTML = marked.parse(msg.content); } catch (e) { console.warn("[LLM Chat Render] Error parsing user message with marked:", e); msgDiv.textContent = msg.content; msgDiv.innerHTML = msgDiv.innerHTML.replace(/\n/g, '<br>'); } }
        else { msgDiv.textContent = msg.content; msgDiv.innerHTML = msgDiv.innerHTML.replace(/\n/g, '<br>'); }
        wrap.appendChild(msgDiv);
      }
    });
  }
  scrollToBottom();
}

function scrollToBottom() { if (chatMessages) { setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; if (DEBUG) console.log('[LLM Chat] Scrolled to bottom.'); }, 0); } else { console.error("Cannot scroll: #chatMessages container not found."); } }
function focusInput() { setTimeout(() => { if (chatInput) { chatInput.focus(); if (DEBUG) console.log('[LLM Chat] Focused input.'); } else { console.error("Cannot focus: #chatInput not found."); } }, 150); }

function sendChatRequestToBackground(userText) {
  if (DEBUG) console.log('[LLM Chat] sendChatRequestToBackground triggered with text:', userText.substring(0, 100) + '...');
  if (streaming) { if (DEBUG) console.log('[LLM Chat] Ignoring send: Already streaming.'); return; }
  if (!selectedModelId) { showError("Cannot send message: No model selected or configured.", false); return; }
  streaming = true; currentStreamModel = selectedModelId; currentStreamRawContent = "";
  const messagesWrap = chatMessagesInnerDiv; if (!messagesWrap) { console.error("Cannot append streaming elements: .chat-messages-inner not found."); streaming = false; return; }
  const modelLabelDiv = document.createElement('div'); modelLabelDiv.className = 'assistant-model-label'; modelLabelDiv.textContent = `Model: ${currentStreamModel}`; messagesWrap.appendChild(modelLabelDiv);
  let streamContainer = document.createElement("div"); streamContainer.className = 'msg assistant'; streamContainer.innerHTML = `<span class="assistant-inner" id="activeStreamSpan"></span>`; messagesWrap.appendChild(streamContainer);
  currentStreamMsgSpan = streamContainer.querySelector('#activeStreamSpan'); if (!currentStreamMsgSpan) { console.error("Failed to create #activeStreamSpan!"); streaming = false; return; }
  showLoadingIndicator(true); scrollToBottom();
  let apiMessages = [];
  apiMessages.push({ role: "system", content: "Be concise and factual. Format responses using Markdown where appropriate, but you can include simple HTML like <b> and <i>. If asked to elaborate on a previous structured response, try to provide the elaboration as natural text or Markdown, not necessarily repeating the JSON structure unless it makes sense for clarity." });
  const userMessageCount = messages.filter(m => m.role === 'user').length; const isFirstUserTurn = userMessageCount === 1;
  if (isFirstUserTurn && chatContext.domSnippet && chatContext.summary !== undefined && chatContext.summary !== null) {
    if (DEBUG) console.log("[LLM Chat] Preparing messages for FIRST user turn (including full snippet and raw summary).");
    apiMessages.push({ role: "user", content: `Context - Original HTML Snippet:\n\`\`\`html\n${chatContext.domSnippet}\n\`\`\`\n\nInitial Summary (JSON Array of HTML strings):\n${chatContext.summary}` });
    apiMessages.push({ role: "user", content: userText });
  } else {
    if (DEBUG) console.log("[LLM Chat] Preparing messages for SUBSEQUENT turn (injecting truncated snippet and recent history).");
    const historyLimit = 10; const historyBeforeCurrent = messages.slice(0, messages.length - 1);
    const recentHistory = historyBeforeCurrent.slice(1).filter(m => typeof m.content === 'string').filter(m => m.role === 'user' || m.role === 'assistant').slice(-historyLimit);
    if (chatContext.domSnippet) {
      let snippetForContext = chatContext.domSnippet; let truncated = false;
      if (snippetForContext.length > SNIPPET_TRUNCATION_LIMIT) { snippetForContext = snippetForContext.substring(0, SNIPPET_TRUNCATION_LIMIT); truncated = true; if (DEBUG) console.log(`[LLM Chat] Snippet truncated to ${SNIPPET_TRUNCATION_LIMIT} chars.`); }
      apiMessages.push({ role: "user", content: `Context - Original HTML Snippet (may be truncated):\n\`\`\`html\n${snippetForContext}${truncated ? '\n[...truncated]' : ''}\n\`\`\`` });
    }
    apiMessages = apiMessages.concat(recentHistory.map(m => ({ role: m.role, content: m.content })));
    apiMessages.push({ role: "user", content: userText });
  }
  if (DEBUG) console.log('[LLM Chat] Sending message request to background. Model:', selectedModelId, 'Payload messages:', apiMessages);
  chrome.runtime.sendMessage({ action: "llmChatStream", messages: apiMessages, model: selectedModelId });
}

function handleFormSubmit(e) {
  if (e) e.preventDefault(); if (DEBUG) console.log('[LLM Chat] Form submit triggered.'); if (streaming) { if (DEBUG) console.log('[LLM Chat] Ignoring submit: Already streaming.'); return; } if (!chatInput) { console.error("Cannot send: Input field not found!"); return; }
  const text = chatInput.value.trim(); if (!text) return;
  messages.push({ role: "user", content: text }); renderMessages(); chatInput.value = ''; chatInput.style.height = '40px'; chatInput.focus();
  sendChatRequestToBackground(text);
}

function setupStreamListeners() {
  if (messageListenerAttached) { if (DEBUG) console.log("[LLM Chat] Stream listeners already attached."); return; }
  if (DEBUG) console.log("[LLM Chat] Setting up stream listeners.");
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (!req || !req.action) return;
    switch (req.action) {
      case "llmChatStreamChunk":
        if (streaming && currentStreamMsgSpan && typeof req.delta === 'string') {
          currentStreamRawContent += req.delta;
          if (typeof marked !== 'undefined') { try { currentStreamMsgSpan.innerHTML = marked.parse(currentStreamRawContent); } catch (e) { console.warn("[LLM Chat Stream] Marked parsing error during chunking:", e); currentStreamMsgSpan.textContent = currentStreamRawContent; } }
          else { currentStreamMsgSpan.textContent = currentStreamRawContent; }
          scrollToBottom();
        } else if (DEBUG) { console.warn('[LLM Chat] Received chunk conditions not met:', { streaming, currentStreamMsgSpanExists: !!currentStreamMsgSpan, delta: req.delta }); }
        break;
      case "llmChatStreamDone":
        if (streaming) {
          if (DEBUG) console.log('[LLM Chat] Stream finished. Model reported:', req.model); if (DEBUG) console.log('[LLM Chat] Raw content received:', currentStreamRawContent);
          let processedContent = currentStreamRawContent; let jsonExtractedText = null; let trailingText = ""; let leadingText = "";
          const jsonMatch = currentStreamRawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/); let potentialJsonString = null;
          if (jsonMatch?.[1]) { potentialJsonString = jsonMatch[1].trim(); leadingText = currentStreamRawContent.substring(0, jsonMatch.index).trim(); trailingText = currentStreamRawContent.substring(jsonMatch.index + jsonMatch[0].length).trim(); if (DEBUG) console.log('[LLM Chat JSON] Found fenced JSON. Content to parse:', potentialJsonString.substring(0, 100)+'...'); if (DEBUG && leadingText) console.log('[LLM Chat JSON] Captured leading text:', leadingText.substring(0, 100)+'...'); if (DEBUG && trailingText) console.log('[LLM Chat JSON] Captured trailing text:', trailingText.substring(0, 100)+'...'); }
          else { potentialJsonString = currentStreamRawContent.trim(); if (DEBUG) console.log('[LLM Chat JSON] No fences found, attempting to parse raw content as JSON:', potentialJsonString.substring(0, 100)+'...'); }
          let parsedJson = null; if (potentialJsonString) {
            // Pass false to suppress warnings for non-initial messages
            parsedJson = tryParseJson(potentialJsonString, false);
          }
          if (parsedJson !== null) { if (DEBUG) console.log('[LLM Chat JSON] Successfully parsed potential JSON (subsequent message).'); jsonExtractedText = extractTextFromJson(parsedJson); if (jsonExtractedText === null) { if (DEBUG) console.warn('[LLM Chat JSON] Parsed JSON but could not extract recognizable text structure.'); } else { if (DEBUG) console.log('[LLM Chat JSON] Successfully extracted text from parsed JSON.'); } }
          else { if (DEBUG) console.log('[LLM Chat JSON] Failed to parse potential JSON (subsequent message - warning suppressed).'); if (jsonMatch) { processedContent = (leadingText + (leadingText && trailingText ? '\n\n' : '') + trailingText).trim(); if (DEBUG) console.log('[LLM Chat JSON] Parsing failed, using text outside fences:', processedContent.substring(0, 100)+'...'); } else { processedContent = currentStreamRawContent.trim(); if (DEBUG) console.log('[LLM Chat JSON] No fences and parsing failed, using raw content as text.'); } }
          let finalContentParts = []; if (leadingText) finalContentParts.push(leadingText);
          if (jsonExtractedText !== null) { finalContentParts.push(jsonExtractedText); if (trailingText) finalContentParts.push(trailingText); }
          else { finalContentParts.push(processedContent); }
          processedContent = finalContentParts.filter(part => part.trim() !== '').join('\n\n');
          if (!processedContent.trim()) { console.warn(`[LLM Chat] Model ${req.model || currentStreamModel} returned an empty or non-processable response.`); messages.push({ role: "assistant", content: "(Model returned empty response)", model: req.model || currentStreamModel }); }
          else { messages.push({ role: "assistant", content: processedContent, model: req.model || currentStreamModel }); }
          streaming = false; currentStreamMsgSpan = null; currentStreamRawContent = ""; currentStreamModel = ""; showLoadingIndicator(false); renderMessages(); focusInput();
        } else if (DEBUG) { console.warn('[LLM Chat] Received stream DONE but not streaming.'); }
        break;
      case "llmChatStreamError":
        console.error('[LLM Chat] Stream Error from background:', req.error); showError(`LLM Error: ${req.error || "Unknown failure"}`, false);
        if (streaming) { const tempLabel = document.querySelector('.assistant-model-label:last-of-type'); const tempMsg = document.querySelector('.msg.assistant:last-of-type'); if (tempMsg?.querySelector('#activeStreamSpan')) { if (tempLabel) tempLabel.remove(); tempMsg.remove(); } else { messages.push({ role: "assistant", content: `Error receiving stream: ${req.error || "Unknown error"}`, model: currentStreamModel || 'Error' }); renderMessages(); } }
        streaming = false; currentStreamMsgSpan = null; currentStreamRawContent = ""; currentStreamModel = ""; showLoadingIndicator(false); focusInput();
        break;
    }
  });
  messageListenerAttached = true;
}

function stripCodeFences(text) {
  if (typeof text !== 'string') return text;
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
  return match?.[1] ? match[1].trim() : text.trim();
}

/**
 * Attempts to parse a string as JSON. Logs success/failure.
 * @param {string} text - The string to parse.
 * @param {boolean} [logWarningOnFail=true] - Whether to log a console warning if parsing fails.
 * @returns {object | array | null} - The parsed JSON object/array, or null if parsing fails.
 */
function tryParseJson(text, logWarningOnFail = true) { // Added logWarningOnFail parameter
  if (typeof text !== 'string' || text.trim() === '') {
    if (DEBUG && logWarningOnFail) console.log('[LLM Chat JSON: tryParseJson] Input is not a string or is empty.'); // Only log if requested
    return null;
  }
  const trimmedText = text.trim();
  // Allow parsing attempt even if it doesn't start with [ or {
  try {
    const parsed = JSON.parse(trimmedText);
    if (DEBUG) console.log('[LLM Chat JSON: tryParseJson] Successfully parsed JSON.');
    return parsed;
  } catch (e) {
    // Only log the warning if requested
    if (DEBUG && logWarningOnFail) {
      console.warn('[LLM Chat JSON: tryParseJson] Parsing failed:', e.message, 'Input was:', text.substring(0, 300) + '...');
    }
    return null;
  }
}


function extractTextFromJson(jsonData) {
  if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Input type:', Array.isArray(jsonData) ? 'array' : typeof jsonData);
  if (Array.isArray(jsonData)) {
    const isArrayOfStringsLike = jsonData.every(item => typeof item !== 'object' && item !== null && String(item).trim() !== '');
    if (isArrayOfStringsLike) { if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Handling array of strings/primitives.'); const extracted = jsonData.map(item => String(item).trim()).filter(item => item !== '').join('\n\n'); if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Extracted from array of strings:', extracted.substring(0, 100)+'...'); return extracted.trim() !== '' ? extracted : null; }
    const isArrayOfObjects = jsonData.every(item => typeof item === 'object' && item !== null && !Array.isArray(item));
    if (isArrayOfObjects) {
      if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Handling array of objects.'); let result = [];
      for (const item of jsonData) {
        let pointText = item.point || item.title || item.header || ''; let elaborationText = item.elaboration || item.details || item.content || item.text || '';
        if (!pointText && !elaborationText) { if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Standard keys not found, searching object properties.'); for (const key in item) { if (typeof item[key] === 'string' && item[key].trim() !== '') { pointText = item[key].trim(); if (DEBUG) console.log(`[LLM Chat JSON: extractTextFromJson] Found property "${key}" for point:`, pointText.substring(0, 50)+'...'); break; } } }
        else { if (typeof pointText === 'string') pointText = pointText.trim(); else pointText = ''; if (typeof elaborationText === 'string') elaborationText = elaborationText.trim(); else elaborationText = ''; if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Used standard keys. Point:', pointText.substring(0, 50)+'...', 'Elaboration:', elaborationText.substring(0, 50)+'...'); }
        let formattedItem = ""; if (pointText) { formattedItem += `${pointText}`; } if (elaborationText && elaborationText !== pointText) { formattedItem += (pointText ? `\n${elaborationText}` : `${elaborationText}`); }
        if (formattedItem) { result.push(formattedItem); } else { if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Item in array of objects yielded no text.'); }
      }
      if (result.length > 0) { const extracted = result.join('\n\n'); if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Extracted from array of objects:', extracted.substring(0, 100)+'...'); return extracted; }
      else { if (DEBUG) console.warn('[LLM Chat JSON: extractTextFromJson] No extractable text found in array of objects.'); return null; }
    }
    if (DEBUG) console.warn('[LLM Chat JSON: extractTextFromJson] Array structure not recognized.'); return null;
  } else if (typeof jsonData === 'object' && jsonData !== null) {
    if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Handling simple object.'); let result = [];
    for (const key in jsonData) {
      if (typeof jsonData[key] === 'string' && jsonData[key].trim() !== '') { result.push(jsonData[key].trim()); }
      else if (typeof jsonData[key] === 'object' && jsonData[key] !== null) { if (DEBUG) console.log(`[LLM Chat JSON: extractTextFromJson] Found nested object/array under key "${key}", attempting recursive extraction.`); const nestedText = extractTextFromJson(jsonData[key]); if (nestedText) { result.push(nestedText); } else { if (DEBUG) console.log(`[LLM Chat JSON: extractTextFromJson] Recursive extraction from "${key}" yielded no text.`); } }
      else { if (DEBUG) console.log(`[LLM Chat JSON: extractTextFromJson] Skipping non-string, non-object property "${key}".`); }
    }
    if (result.length > 0) { const extracted = result.join('\n\n'); if (DEBUG) console.log('[LLM Chat JSON: extractTextFromJson] Extracted from simple object:', extracted.substring(0, 100)+'...'); return extracted; }
    else { if (DEBUG) console.warn('[LLM Chat JSON: extractTextFromJson] No extractable text found in simple object.'); return null; }
  }
  if (DEBUG) console.warn('[LLM Chat JSON: extractTextFromJson] Input is not a recognized object or array type.'); return null;
}

function showLoadingIndicator(show) { const existingIndicator = document.getElementById('loadingIndicator'); if (existingIndicator) existingIndicator.remove(); if (show && chatMessagesInnerDiv) { const indicator = document.createElement('div'); indicator.id = 'loadingIndicator'; indicator.className = 'loading-indicator'; indicator.innerHTML = '<span></span><span></span><span></span>'; chatMessagesInnerDiv.appendChild(indicator); scrollToBottom(); } }
function showError(message, isFatal = true) { if (!errorDisplay) { errorDisplay = document.createElement('div'); errorDisplay.id = 'errorDisplay'; errorDisplay.style.display = 'none'; const chatContainer = document.querySelector('.chat-container'); if (chatContainer && chatMessages) { chatContainer.insertBefore(errorDisplay, chatMessages); } else if (chatContainer) { chatContainer.insertBefore(errorDisplay, chatContainer.firstChild); } else { document.body.insertBefore(errorDisplay, document.body.firstChild); } } errorDisplay.style.cssText = 'display: block; color: red; background-color: #ffebee; padding: 10px; border: 1px solid red; border-radius: 4px; margin: 10px auto; width: 80vw; max-width: 800px;'; errorDisplay.textContent = message; if (isFatal) { disableChatFunctionality(); } }
function setupTextareaResize() { if (chatInput) { if (DEBUG) console.log('[LLM Chat] Setting up textarea resize.'); const initialHeight = chatInput.style.height || '40px'; const maxHeight = 150; const resizeTextarea = () => { chatInput.style.height = 'auto'; const scrollHeight = chatInput.scrollHeight; chatInput.style.height = `${Math.min(scrollHeight, maxHeight)}px`; }; chatInput.addEventListener('input', resizeTextarea); chatInput.addEventListener('focus', resizeTextarea); chatInput.addEventListener('blur', () => { if (!chatInput.value.trim()) { chatInput.style.height = initialHeight; } }); } else { console.error("Textarea #chatInput not found for resize setup."); } }

function formatChatAsMarkdown() {
  if (!messages || messages.length === 0) return ""; let markdownContent = `# Chat Export\n\n`;
  messages.forEach((msg, index) => {
    if (msg.role === 'user') { markdownContent += `**User:**\n${msg.content}\n\n`; }
    else if (msg.role === 'assistant') {
      const modelInfo = msg.model ? ` (Model: ${msg.model})` : ''; markdownContent += `**Assistant${modelInfo}:**\n`;
      if (index === 0 && Array.isArray(msg.content)) { if (DEBUG) console.log("[Export MD] Formatting initial summary array:", msg.content); msg.content.forEach((item, itemIndex) => { let mdItem = String(item).replace(/<b>(.*?)<\/b>/gi, '**$1**').replace(/<i>(.*?)<\/i>/gi, '*$1*'); markdownContent += `${itemIndex + 1}. ${mdItem}\n`; }); markdownContent += '\n'; }
      else if (index === 0 && typeof msg.content === 'string' && msg.content.startsWith("<Error: Could not display initial summary")) { markdownContent += `[Error displaying initial summary]:\n\n${msg.content}\n\n`; }
      else if (typeof msg.content === 'string') { if (DEBUG) console.log(`[Export MD] Formatting message index ${index}:`, msg.content.substring(0,100)+'...'); markdownContent += `${msg.content}\n\n`; }
      else { markdownContent += `[Error: Could not format message content]\n\n`; }
    }
  }); return markdownContent.trim();
}
function triggerDownload(content, filename, contentType) { try { const blob = new Blob([content], { type: `${contentType};charset=utf-8` }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); if (DEBUG) console.log(`[LLM Chat Export] Triggered download for ${filename}`); } catch (error) { console.error(`[LLM Chat Export] Error triggering download for ${filename}:`, error); showError(`Failed to initiate download: ${error.message}`, false); } }
function handleDownloadMd() { if (DEBUG) console.log('[LLM Chat Export] Download MD clicked.'); if (messages.length === 0) { showError("Cannot download: Chat history is empty.", false); return; } const markdownContent = formatChatAsMarkdown(); const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); triggerDownload(markdownContent, `chat_export_${timestamp}.md`, 'text/markdown'); }
function handleCopyMd() { if (DEBUG) console.log('[LLM Chat Export] Copy MD clicked.'); if (messages.length === 0) { showError("Cannot copy: Chat history is empty.", false); return; } const markdownContent = formatChatAsMarkdown(); if (!navigator.clipboard?.writeText) { console.error('[LLM Chat Export] Clipboard API not available.'); showError('Cannot copy: Clipboard API is not available.', false); return; } navigator.clipboard.writeText(markdownContent).then(() => { if (DEBUG) console.log('[LLM Chat Export] Markdown copied.'); const originalText = copyMdBtn.textContent; copyMdBtn.textContent = 'Copied!'; copyMdBtn.disabled = true; setTimeout(() => { copyMdBtn.textContent = originalText; copyMdBtn.disabled = false; }, 1500); }).catch(err => { console.error('[LLM Chat Export] Failed to copy Markdown:', err); showError(`Failed to copy: ${err.message}`, false); const originalText = copyMdBtn.textContent; copyMdBtn.textContent = 'Error!'; setTimeout(() => { copyMdBtn.textContent = originalText; }, 2000); }); }
function handleDownloadJson() { if (DEBUG) console.log('[LLM Chat Export] Download JSON clicked.'); if (messages.length === 0) { showError("Cannot download: Chat history is empty.", false); return; } try { const jsonContent = JSON.stringify(messages, null, 2); const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); triggerDownload(jsonContent, `chat_export_${timestamp}.json`, 'application/json'); } catch (error) { console.error('[LLM Chat Export] Failed to stringify messages:', error); showError(`Failed to create JSON data: ${error.message}`, false); } }

function setupCtrlEnterListener() { if (!chatInput) { console.error("Cannot setup Ctrl+Enter: Textarea not found."); return; } if (DEBUG) console.log('[LLM Chat] Setting up Ctrl+Enter listener.'); chatInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { if (DEBUG) console.log('[LLM Chat] Ctrl+Enter detected.'); event.preventDefault(); if (sendButton && !sendButton.disabled) { if (DEBUG) console.log('[LLM Chat] Clicking Send button programmatically.'); sendButton.click(); } else { if (DEBUG) console.log('[LLM Chat] Send button not available or disabled.'); } } }); }
