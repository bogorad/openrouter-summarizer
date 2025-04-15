// == OpenRouter Summarizer Content Script ==
// Fix: Preserve raw Markdown summary for chat context

const LANGUAGE_DISPLAY = {
  english: "English", spanish: "Spanish", french: "French", mandarin: "Mandarin",
  arabic: "Arabic", hebrew: "Hebrew", russian: "Russian"
};

const numToWord = { 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };

// --- Prompt Function ---
function getSystemPrompt(bulletCount, translate, translateLanguage, customFormatInstructions) {
  const bcNum = Number(bulletCount) || 5;
  const word = numToWord[bcNum] || "five";
  const DEFAULT_FORMAT_INSTRUCTIONS = `Each bullet point should start with a bold tag-like marker and a colon, followed by the description. Use Markdown for the bold tag.\nFor example: **Other countries too**: It's not just Canadian situation, same was observed all over Asia.`;
  const PROMPT_PREAMBLE_TEXT = (bulletWord) => `Input is raw HTML. Treat it as article_text.\nUsing US English, prepare a summary of article_text in ${bulletWord} bullet points.`;
  const PROMPT_TRANSLATION_TEXT = (langName) => `Translate the Markdown summary you created into ${langName}. Drop the original summary, only return the translated Markdown summary. Ensure the translated summary retains the same Markdown formatting (bold tags, newlines).`;
  const PROMPT_POSTAMBLE_TEXT = `Separate each bullet point with a newline character.\nFormat the entire summary as a single Markdown string.\nDo not add any comments before or after the Markdown summary. Do not output your deliberations.\nJust provide the requested Markdown summary string as the result.`;

  const formatInstructions = (customFormatInstructions && customFormatInstructions.trim() !== '') ? customFormatInstructions : DEFAULT_FORMAT_INSTRUCTIONS;
  let prompt = PROMPT_PREAMBLE_TEXT(word) + "\n" + formatInstructions;
  if (translate && translateLanguage !== 'none') { const langName = LANGUAGE_DISPLAY[translateLanguage.toLowerCase()] || translateLanguage; prompt += "\n" + PROMPT_TRANSLATION_TEXT(langName); }
  prompt += "\n" + PROMPT_POSTAMBLE_TEXT;
  return prompt;
}

// --- Helper Function to Render Simple Markdown List ---
function renderSimpleMarkdownListToHtml(markdownString) {
    if (!markdownString || typeof markdownString !== 'string') { return markdownString || ''; }
    let processedString = markdownString.trim();
    const codeFenceRegex = /^\s*```(?:markdown)?\s*\n([\s\S]*?)\n\s*```\s*$/;
    const match = processedString.match(codeFenceRegex);
    if (match && match[1]) { processedString = match[1].trim(); if (DEBUG) console.log('[LLM Content] Extracted content from Markdown code fence.'); }
    else { if (DEBUG) console.log('[LLM Content] No Markdown code fence detected, processing raw string.'); }
    const lines = processedString.split('\n');
    const listItems = lines.map(line => line.trim()).filter(line => line.length > 0 && !line.startsWith('```'))
        .map(line => { const escapedLine = line.replace(/</g, "<").replace(/>/g, ">"); const formattedLine = escapedLine.replace(/^\*\*(.*?)\*\*:/, '<b>$1</b>:'); return `<li>${formattedLine}</li>`; });
    if (listItems.length > 0) { return `<ul>${listItems.join('')}</ul>`; }
    else { if (DEBUG) console.log('[LLM Content] No list items generated, returning escaped original.'); return processedString.replace(/</g, "<").replace(/>/g, ">"); }
}

// --- State Variables ---
let selectedElement = null; let lastHighlighted = null; let altKeyDown = false;
let previewHighlighted = null; let floatingIcon = null; let DEBUG = false;
let lastSummary = ''; // <<< Holds the RAW text/Markdown from LLM or status messages
let lastSummaryHtml = ''; // <<< Holds the HTML version generated for the popup
let lastModelUsed = '';

// --- Initialization ---
chrome.storage.sync.get(['debug'], (result) => { DEBUG = !!result.debug; if (DEBUG) console.log('[LLM Content] Debug mode enabled'); });

// --- Helper Function to Reset Alt State ---
function resetAltState() { if (altKeyDown || previewHighlighted) { if (DEBUG) console.log('[LLM Content Alt State] Resetting Alt state.'); altKeyDown = false; if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } } }

// --- Event Listeners for ALT Key, Focus, Visibility ---
window.addEventListener('keydown', (e) => { if (e.key === 'Alt' && !altKeyDown) { const activeEl = document.activeElement; if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) { if (DEBUG) console.log('[LLM Content Alt State] Ignoring Alt down in input.'); return; } altKeyDown = true; if (DEBUG) console.log('[LLM Content Alt State] Alt key down.'); } });
window.addEventListener('keyup', (e) => { if (e.key === 'Alt') { if (DEBUG) console.log('[LLM Content Alt State] Alt key up.'); resetAltState(); } });
window.addEventListener('blur', () => { if (DEBUG) console.log('[LLM Content Alt State] Window blurred.'); resetAltState(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { if (DEBUG) console.log('[LLM Content Alt State] Document hidden.'); resetAltState(); } });

// --- Mouse Listeners (Highlighting & Selection) ---
window.addEventListener('mouseout', (e) => { if (!e.relatedTarget && previewHighlighted) { if (DEBUG) console.log('[LLM Content] Mouse left window.'); if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } });
document.addEventListener('mousemove', (e) => { if (!altKeyDown) { if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } return; } let target = document.elementFromPoint(e.clientX, e.clientY); if (!target || target.closest('.summarizer-popup') || target.closest('.summarizer-btn') || target.classList.contains('llm-floating-icon')) { if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } return; } if ((target === document.body || target === document.documentElement) && document.elementsFromPoint(e.clientX, e.clientY).length > 1) { const deeperTarget = document.elementsFromPoint(e.clientX, e.clientY)[1]; if (deeperTarget && !deeperTarget.closest('.summarizer-popup') && !deeperTarget.closest('.summarizer-btn') && !deeperTarget.classList.contains('llm-floating-icon')) { target = deeperTarget; } else { if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } return; } } if (target === selectedElement) { if (previewHighlighted && previewHighlighted !== selectedElement) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } return; } if (previewHighlighted !== target) { if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } } previewHighlighted = target; if (previewHighlighted) { previewHighlighted.classList.add('llm-highlight-preview'); } } }, true);
document.addEventListener('mousedown', e => { if (e.target.closest('.llm-floating-icon')) return; if (e.altKey && e.button === 0) { e.preventDefault(); e.stopPropagation(); const clickedTarget = e.target; if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } removeFloatingIcon(); if (selectedElement === clickedTarget) { if (document.body.contains(selectedElement)) { selectedElement.classList.remove('llm-highlight'); } selectedElement = null; lastHighlighted = null; removeFloatingIcon(); if (DEBUG) console.log('[LLM Content] Deselected element.'); } else { if (lastHighlighted && document.body.contains(lastHighlighted)) { lastHighlighted.classList.remove('llm-highlight'); } if (clickedTarget && !clickedTarget.closest('.summarizer-popup')) { selectedElement = clickedTarget; lastHighlighted = clickedTarget; selectedElement.classList.add('llm-highlight'); createFloatingIcon(e.pageX, e.pageY); if (DEBUG) console.log('[LLM Content] Selected element:', selectedElement); } else { if (DEBUG) console.warn('[LLM Content] Alt+Click target invalid.'); selectedElement = null; lastHighlighted = null; } } previewHighlighted = null; return; } if (!e.altKey && e.button === 0) { if (selectedElement && !selectedElement.contains(e.target) && !e.target.closest('.llm-floating-icon') && !e.target.closest('.summarizer-popup')) { if (DEBUG) console.log('[LLM Content] Click outside detected. Deselecting.'); if (document.body.contains(selectedElement)) { selectedElement.classList.remove('llm-highlight'); } selectedElement = null; lastHighlighted = null; removeFloatingIcon(); } else { if (DEBUG && selectedElement) console.log('[LLM Content] Regular click inside detected.'); } } }, true);

// --- Floating Icon ---
function removeFloatingIcon() { if (floatingIcon && floatingIcon.parentNode) { floatingIcon.parentNode.removeChild(floatingIcon); floatingIcon = null; } }
function createFloatingIcon(clickX, clickY) { removeFloatingIcon(); floatingIcon = document.createElement('div'); floatingIcon.className = 'llm-floating-icon'; floatingIcon.setAttribute('aria-label', 'Summarize this element'); floatingIcon.setAttribute('role', 'button'); floatingIcon.setAttribute('tabindex', '0'); floatingIcon.title = 'Summarize this element (Click or press Enter)'; let iconUrl = ''; try { if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') { iconUrl = chrome.runtime.getURL('icons/icon32.png'); } } catch (e) { console.warn("[LLM Content] Could not get icon URL", e); } const iconImg = document.createElement('img'); iconImg.src = iconUrl; iconImg.alt = 'Summarize'; iconImg.style.pointerEvents = 'none'; iconImg.onerror = function() { iconImg.style.display = 'none'; if (!floatingIcon.querySelector('.llm-fallback-icon')) { const fallback = document.createElement('span'); fallback.className = 'llm-fallback-icon'; fallback.textContent = '💡'; fallback.style.pointerEvents = 'none'; floatingIcon.appendChild(fallback); } }; if (!iconUrl) iconImg.onerror(); floatingIcon.appendChild(iconImg); const iconSize = 32; const margin = 5; let iconX = clickX - iconSize / 2; let iconY = clickY - iconSize / 2; iconX = Math.max(window.scrollX + margin, Math.min(iconX, window.scrollX + window.innerWidth - iconSize - margin)); iconY = Math.max(window.scrollY + margin, Math.min(iconY, window.scrollY + window.innerHeight - iconSize - margin)); floatingIcon.style.left = `${iconX}px`; floatingIcon.style.top = `${iconY}px`; floatingIcon.style.pointerEvents = 'auto'; floatingIcon.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); if (DEBUG) console.log('[LLM Content] Floating icon clicked.'); removeFloatingIcon(); processSelectedElement(); }); floatingIcon.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (DEBUG) console.log('[LLM Content] Floating icon activated via keyboard.'); removeFloatingIcon(); processSelectedElement(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (DEBUG) console.log('[LLM Content] Floating icon dismissed via Escape.'); removeFloatingIcon(); if (selectedElement && document.body.contains(selectedElement)) { selectedElement.classList.remove('llm-highlight'); selectedElement = null; lastHighlighted = null; } } }); document.body.appendChild(floatingIcon); }

// --- Popup Display (MODIFIED) ---
function showPopup(content) {
  const existing = document.querySelector('.summarizer-popup'); if (existing) { if (DEBUG) console.log('[LLM Content] Removing existing popup.'); existing.remove(); }
  const popup = document.createElement('div'); popup.className = 'summarizer-popup'; const header = document.createElement('div'); header.className = 'summarizer-header'; header.textContent = 'Summary'; popup.appendChild(header); const contentDiv = document.createElement('div'); contentDiv.className = 'summarizer-body';
  let copyTimeoutId = null;

  // Reset only HTML version. lastSummary should hold raw content set by caller.
  lastSummaryHtml = '';

  if (typeof content === 'string') {
    // Handle plain text messages (Thinking..., errors) OR the generated HTML string
    if (content === 'Thinking...' || content.startsWith('Error:') || content.startsWith('Intermittent LLM error')) {
        contentDiv.textContent = content;
        // lastSummary is already set by caller (sendToLLM or processSelectedElement)
        lastSummaryHtml = ''; // No HTML representation for status/error
        if (DEBUG) console.log('[LLM Content] Showing popup with text:', content);
    } else {
        // Assume it's the HTML string generated from Markdown by renderSimpleMarkdownListToHtml
        contentDiv.innerHTML = content; // Render the HTML list
        lastSummaryHtml = content; // Store the generated HTML
        // *** DO NOT OVERWRITE lastSummary here ***
        // lastSummary should still hold the raw Markdown set by sendToLLM
        if (DEBUG) console.log('[LLM Content] Showing popup with generated HTML:', lastSummaryHtml);
        if (DEBUG) console.log('[LLM Content] Raw summary state (lastSummary):', lastSummary); // Verify raw state
    }
  } else {
      contentDiv.textContent = "Error: Invalid content type for popup.";
      lastSummary = contentDiv.textContent; // Update lastSummary only on error type
      lastSummaryHtml = '';
      if (DEBUG) console.error('[LLM Content] Invalid content type passed to showPopup:', content);
  }
  popup.appendChild(contentDiv);

  // Actions (Buttons) - Copy logic remains the same, uses rendered text
  const actions = document.createElement('div'); actions.className = 'summarizer-actions'; const copyBtn = document.createElement('button'); copyBtn.className = 'summarizer-btn copy-btn'; copyBtn.textContent = 'Copy';
  copyBtn.onclick = () => { if (copyTimeoutId) clearTimeout(copyTimeoutId); let val = ''; const listItems = contentDiv.querySelectorAll('li'); if (listItems.length > 0) { val = Array.from(listItems).map((li, idx) => `${idx + 1}. ${li.innerText.trim()}`).join('\n'); } else { val = contentDiv.textContent || ''; } navigator.clipboard.writeText(val.trim()).then(() => { copyBtn.textContent = 'Copied!'; copyTimeoutId = setTimeout(() => { copyBtn.textContent = 'Copy'; copyTimeoutId = null; }, 1500); }).catch(err => { console.error('[LLM Content] Failed to copy text: ', err); copyBtn.textContent = 'Error'; copyTimeoutId = setTimeout(() => { copyBtn.textContent = 'Copy'; copyTimeoutId = null; }, 1500); }); }; actions.appendChild(copyBtn);
  const chatBtn = document.createElement('button'); chatBtn.className = 'summarizer-btn chat-btn'; chatBtn.textContent = 'Chat';
  // Enable chat button if we have *either* generated HTML *or* a valid raw summary
  chatBtn.disabled = !(lastSummaryHtml || (lastSummary && !lastSummary.startsWith('Error:') && lastSummary !== 'Thinking...'));
  chatBtn.onclick = openChatWithContext; actions.appendChild(chatBtn);
  const closeBtn = document.createElement('button'); closeBtn.className = 'summarizer-btn close-btn'; closeBtn.textContent = 'Close'; closeBtn.onclick = () => popup.remove(); actions.appendChild(closeBtn);
  popup.appendChild(actions); document.body.appendChild(popup); if (DEBUG) console.log('[LLM Content] New popup added to page.');
   if (lastSummaryHtml || (lastSummary && !lastSummary.startsWith('Error:') && lastSummary !== 'Thinking...')) { chatBtn.disabled = false; }
}


// --- Chat Context Handling (MODIFIED) ---
function openChatWithContext() {
  if (!selectedElement) { alert("Cannot open chat: Original element selection lost."); if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: selectedElement is null.'); return; }
  // *** Use lastSummary (which should hold the raw Markdown/text) ***
  if (!lastSummary || lastSummary === 'Thinking...' || lastSummary.startsWith('Error:') || lastSummary.startsWith('Intermittent LLM error')) {
      alert("Cannot open chat: No valid summary available.");
      if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: No valid summary found in lastSummary.');
      return;
  }
  const domSnippet = selectedElement.outerHTML || selectedElement.innerHTML || selectedElement.textContent || "";
  const summaryForChat = lastSummary; // <<< Send the raw summary text
  if (DEBUG) { console.log('[LLM Chat Context] Preparing context:', { snippetLen: domSnippet.length, summary: summaryForChat, model: lastModelUsed }); }
  chrome.runtime.sendMessage({ action: "setChatContext", domSnippet: domSnippet, summary: summaryForChat, summaryModel: lastModelUsed }, function(response) {
    if (chrome.runtime.lastError) { console.error('[LLM Chat Context] Error sending context:', chrome.runtime.lastError); alert(`Error preparing chat: ${chrome.runtime.lastError.message}`); return; }
    if (response && response.status === 'ok') { if (DEBUG) console.log('[LLM Chat Context] Background confirmed context. Requesting tab open.'); chrome.runtime.sendMessage({ action: "openChatTab" }, (openResponse) => { if (chrome.runtime.lastError) { console.error('[LLM Chat Context] Error requesting tab open:', chrome.runtime.lastError); alert(`Error opening chat tab: ${chrome.runtime.lastError.message}.`); } else { if (DEBUG) console.log('[LLM Chat Context] Background ack openChatTab:', openResponse); const existingPopup = document.querySelector('.summarizer-popup'); if (existingPopup) existingPopup.remove(); } }); }
    else { console.error('[LLM Chat Context] Background did not confirm context storage:', response); alert('Failed to prepare chat context.'); }
  });
}

// --- LLM Interaction (MODIFIED) ---
function sendToLLM(selectedHtml, apiKey, model, systemPrompt) {
  if (DEBUG) console.log(`[LLM Request] Sending to model: ${model}`);
  lastSummary = 'Thinking...'; // Set raw summary state
  lastSummaryHtml = ''; // Clear HTML state
  showPopup('Thinking...'); // Show status

  const payload = { model, messages: [ { role: "system", content: systemPrompt }, { role: "user", content: selectedHtml } ] };
  fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com/bogorad/openrouter-summarizer', 'X-Title': 'OpenRouterSummarizer' }, body: JSON.stringify(payload) })
  .then(response => { if (!response.ok) { return response.text().then(text => { throw new Error(`API Error: ${response.status} ${response.statusText} - ${text}`); }); } return response.json(); })
  .then(data => {
      if (DEBUG) console.log('[LLM Response] Received data:', data);
      const modelOutput = data.choices?.[0]?.message?.content;
      if (!modelOutput) { throw new Error('No response content received from LLM.'); }
      try {
        lastSummary = modelOutput; // <<< Store raw output FIRST
        const summaryHtml = renderSimpleMarkdownListToHtml(modelOutput); // Generate HTML for popup
        lastModelUsed = model;
        showPopup(summaryHtml); // Display the generated HTML (this call no longer overwrites lastSummary)
      } catch (e) {
        lastSummary = modelOutput; // Store raw output even on error
        lastSummaryHtml = ''; // No valid HTML
        showPopup(`Error rendering summary. Raw Output:\n"${modelOutput.substring(0, 200)}${modelOutput.length > 200 ? '...' : ''}"`);
        console.error('[LLM Error] Failed to process LLM Markdown response:', e);
        if (DEBUG) console.log('[LLM Error] Raw output causing failure:', modelOutput);
      }
    })
  .catch(err => {
      console.error('[LLM Fetch Error]', err);
      lastSummary = `Error: ${err.message}`; // Store error message in raw summary state
      lastSummaryHtml = '';
      showPopup(`Error: ${err.message}`);
  });
}

// --- processSelectedElement ---
function processSelectedElement() {
  if (!selectedElement) { showPopup('Error: No element selected.'); return; }
  chrome.storage.sync.get([ 'apiKey', 'model', 'bulletCount', 'translate', 'translateLanguage', 'debug', 'prompt_custom_format_instructions' ], (config) => {
    DEBUG = !!config.debug; const apiKey = config.apiKey; const model = config.model; const bulletCount = config.bulletCount || 5; const translate = config.translate; const translateLanguage = config.translateLanguage || 'none'; const customFormatInstructions = config.prompt_custom_format_instructions;
    if (!apiKey || !model) { showPopup('Error: API key or model not configured.'); return; }
    const htmlContent = selectedElement.outerHTML || selectedElement.innerHTML || selectedElement.textContent || '';
    if (!htmlContent.trim()) { showPopup('Error: Selected element has no content.'); return; }
    const systemPrompt = getSystemPrompt(bulletCount, translate, translateLanguage, customFormatInstructions);
    if (DEBUG) console.log("Using System Prompt:", systemPrompt);
    sendToLLM(htmlContent, apiKey, model, systemPrompt);
  });
}

// --- Message Listener from Background ---
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => { if (req.action === 'processSelection') { if (DEBUG) console.log('[LLM Content] Received processSelection command.'); processSelectedElement(); sendResponse({status: "processing"}); } });

