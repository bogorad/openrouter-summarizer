// == OpenRouter Summarizer Content Script ==

const LANGUAGE_DISPLAY = {
  english: "English", spanish: "Spanish", french: "French", mandarin: "Mandarin",
  arabic: "Arabic", hebrew: "Hebrew", russian: "Russian"
};

const numToWord = { 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };

function getSystemPrompt(bulletCount, translate, translateLanguage) {
  const bcNum = Number(bulletCount) || 5;
  const word = numToWord[bcNum] || "five";
  let prompt = `input is raw html. treat is as article_text.
using US English, prepare a summary of article_text in ${word} bullet points.
each bullet point should contain a bold tag-like and a colon at the start of the line.
this tag shows the theme of this bullet point.
for example - <b>Other countries too</b>: It's not just Canadian situation, same was observed all over Asia.
format this summary as a json array of strings.`;
  if (translate) {
    const langName = LANGUAGE_DISPLAY[translateLanguage.toLowerCase()] || translateLanguage;
    prompt += ` \ntranslate the summary you created into ${langName}. drop the original summary, only return the translated summary.`;
  }
  prompt += `
do not add any comments. do not output your deliberations.
just provide the requested json array as result.`;
  return prompt;
}

let selectedElement = null;
let lastHighlighted = null;
let altKeyDown = false;
let previewHighlighted = null;
let floatingIcon = null;
let DEBUG = false;
let lastSummary = '';          // Stores last summary as plain text
let lastSummaryHtml = '';      // Stores last summary as HTML for popup/chat context
let lastModelUsed = '';        // Stores model string used for the *last successful* summary

// --- Initialization ---
chrome.storage.sync.get(['debug'], (result) => {
  DEBUG = !!result.debug;
  if (DEBUG) console.log('[LLM Content] Debug mode enabled');
});

// --- Event Listeners for ALT Key, Mouse Movement, Clicks ---
window.addEventListener('keydown', (e) => { if (e.key === 'Alt') altKeyDown = true; });
window.addEventListener('keyup', (e) => {
  if (e.key === 'Alt') {
    altKeyDown = false;
    if (previewHighlighted) {
      previewHighlighted.classList.remove('llm-highlight-preview');
      previewHighlighted = null;
    }
  }
});
window.addEventListener('mouseout', (e) => {
  // If mouse leaves the window while ALT is down, clear preview
  if (!e.relatedTarget && previewHighlighted) {
    previewHighlighted.classList.remove('llm-highlight-preview');
    previewHighlighted = null;
  }
});

document.addEventListener('mousemove', (e) => {
  if (!altKeyDown) {
    if (previewHighlighted) {
      previewHighlighted.classList.remove('llm-highlight-preview');
      previewHighlighted = null;
    }
    return;
  }

  let target = document.elementFromPoint(e.clientX, e.clientY);

  // Ignore elements within our UI or invalid targets
  if (!target || target.closest('.summarizer-popup') || target.closest('.summarizer-btn') || target.classList.contains('llm-floating-icon')) {
    if (previewHighlighted) {
      previewHighlighted.classList.remove('llm-highlight-preview');
      previewHighlighted = null;
    }
    return;
  }

  // Avoid highlighting the body/html directly unless it's the only option
  if ((target === document.body || target === document.documentElement) && document.elementsFromPoint(e.clientX, e.clientY).length > 1) {
      const deeperTarget = document.elementsFromPoint(e.clientX, e.clientY)[1]; // Try the element underneath
      if (deeperTarget && !deeperTarget.closest('.summarizer-popup') && !deeperTarget.closest('.summarizer-btn') && !deeperTarget.classList.contains('llm-floating-icon')) {
          target = deeperTarget;
      } else {
          // If the element underneath is still invalid, remove highlight
          if (previewHighlighted) {
              previewHighlighted.classList.remove('llm-highlight-preview');
              previewHighlighted = null;
          }
          return;
      }
  }


  // Don't double-highlight the selected element
  if (target === selectedElement) {
    if (previewHighlighted && previewHighlighted !== selectedElement) {
      previewHighlighted.classList.remove('llm-highlight-preview');
      previewHighlighted = null;
    }
    return;
  }

  // Update preview highlight if target changed
  if (previewHighlighted !== target) {
     if (previewHighlighted) {
        previewHighlighted.classList.remove('llm-highlight-preview');
     }
     previewHighlighted = target;
     if (previewHighlighted) { // Ensure target is valid
        previewHighlighted.classList.add('llm-highlight-preview');
     }
  }
}, true); // Use capture phase

document.addEventListener('mousedown', e => {
  // Ignore clicks on the floating icon itself
  if (e.target.closest('.llm-floating-icon')) return;

  // --- ALT+Click logic ---
  if (e.altKey && e.button === 0) { // Primary button (left click)
    e.preventDefault();
    e.stopPropagation(); // Prevent triggering other listeners if possible

    if (previewHighlighted) {
      previewHighlighted.classList.remove('llm-highlight-preview');
      previewHighlighted = null;
    }
    removeFloatingIcon();

    const clickedTarget = e.target;

    // Deselect if clicking the currently selected element
    if (selectedElement === clickedTarget) {
      selectedElement.classList.remove('llm-highlight');
      selectedElement = null;
      lastHighlighted = null;
      removeFloatingIcon();
      if (DEBUG) console.log('[LLM Content] Deselected element via Alt+Click on same element.');
    } else {
      // Select the new element
      if (lastHighlighted) {
        lastHighlighted.classList.remove('llm-highlight');
      }
      selectedElement = clickedTarget;
      lastHighlighted = clickedTarget;
      if (selectedElement) {
        selectedElement.classList.add('llm-highlight');
        createFloatingIcon(e.pageX, e.pageY);
        if (DEBUG) console.log('[LLM Content] Selected element:', selectedElement);
      } else {
          if (DEBUG) console.warn('[LLM Content] Alt+Click detected but target was null?');
      }
    }
    return; // Handled Alt+Click
  }

  // --- Regular click (no Alt key) ---
  if (!e.altKey && e.button === 0) {
      // Check if the click is outside the selected element, AND outside the floating icon, AND outside the popup
      if (selectedElement &&
          !selectedElement.contains(e.target) &&         // Click wasn't *inside* the selected element
          !e.target.closest('.llm-floating-icon') && // Click wasn't on the floating icon
          !e.target.closest('.summarizer-popup')) {    // Click wasn't inside the popup
          // If all conditions are true, then the click was truly "outside" our active UI elements. Deselect.
          if (DEBUG) console.log('[LLM Content] Click outside selected element, icon, AND popup detected. Deselecting.');
          selectedElement.classList.remove('llm-highlight');
          selectedElement = null;
          lastHighlighted = null;
          removeFloatingIcon();
          // Optional: Close the popup when deselecting?
          // const existingPopup = document.querySelector('.summarizer-popup');
          // if (existingPopup) existingPopup.remove();
      } else {
          // If the click was inside the selected element, or on the icon, or inside the popup, do nothing (don't deselect).
          if (DEBUG && selectedElement) console.log('[LLM Content] Regular click detected, but it was inside selected element, icon, or popup. No deselection.');
      }
  }
}, true); // Use capture phase


// --- Floating Icon ---
function removeFloatingIcon() {
  if (floatingIcon && floatingIcon.parentNode) {
    floatingIcon.parentNode.removeChild(floatingIcon);
    floatingIcon = null;
  }
}
function createFloatingIcon(clickX, clickY) {
  removeFloatingIcon();

  floatingIcon = document.createElement('div');
  floatingIcon.className = 'llm-floating-icon';
  floatingIcon.setAttribute('aria-label', 'Summarize this element');
  floatingIcon.setAttribute('role', 'button'); // Better semantics
  floatingIcon.setAttribute('tabindex', '0');
  floatingIcon.title = 'Summarize this element (Click or press Enter)';

  let iconUrl = '';
  try { // Use try-catch for chrome object access
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
        iconUrl = chrome.runtime.getURL('icons/icon32.png');
      }
  } catch (e) {
      console.warn("[LLM Content] Could not get icon URL via chrome.runtime.getURL", e);
  }

  const iconImg = document.createElement('img');
  iconImg.src = iconUrl;
  iconImg.alt = 'Summarize';
  iconImg.style.pointerEvents = 'none'; // Clicks should go to the parent div
  iconImg.onerror = function() {
    iconImg.style.display = 'none';
    if (!floatingIcon.querySelector('.llm-fallback-icon')) {
      const fallback = document.createElement('span');
      fallback.className = 'llm-fallback-icon';
      fallback.textContent = '💡';
      fallback.style.pointerEvents = 'none';
      floatingIcon.appendChild(fallback);
    }
  };
  if (!iconUrl) iconImg.onerror();
  floatingIcon.appendChild(iconImg);


  // Position calculation (center icon over click point, constrained by viewport)
  const iconSize = 32;
  const margin = 5;
  let iconX = clickX - iconSize / 2;
  let iconY = clickY - iconSize / 2;

  // Ensure position is relative to the viewport, not just document coordinates
  iconX = Math.max(window.scrollX + margin, Math.min(iconX, window.scrollX + window.innerWidth - iconSize - margin));
  iconY = Math.max(window.scrollY + margin, Math.min(iconY, window.scrollY + window.innerHeight - iconSize - margin));

  floatingIcon.style.left = `${iconX}px`;
  floatingIcon.style.top = `${iconY}px`;
  floatingIcon.style.pointerEvents = 'auto';

  floatingIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent potential side-effects
    if (DEBUG) console.log('[LLM Content] Floating icon clicked.');
    removeFloatingIcon();
    processSelectedElement();
  });
  floatingIcon.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (DEBUG) console.log('[LLM Content] Floating icon activated via keyboard.');
      removeFloatingIcon();
      processSelectedElement();
    }
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (DEBUG) console.log('[LLM Content] Floating icon dismissed via Escape.');
        removeFloatingIcon();
        if (selectedElement) {
            selectedElement.classList.remove('llm-highlight');
            selectedElement = null;
            lastHighlighted = null;
        }
    }
  });

  document.body.appendChild(floatingIcon);
  // Only focus if appropriate (might be disruptive)
  // floatingIcon.focus();
}

// --- Popup Display ---
function showPopup(content) {
  // Remove existing popup first
  const existing = document.querySelector('.summarizer-popup');
  if (existing) {
      if (DEBUG) console.log('[LLM Content] Removing existing popup.');
      existing.remove();
  }

  const popup = document.createElement('div');
  popup.className = 'summarizer-popup';

  const header = document.createElement('div');
  header.className = 'summarizer-header';
  header.textContent = 'Summary';
  popup.appendChild(header);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'summarizer-body';

  // Reset summaries before potentially setting them
  lastSummaryHtml = '';
  lastSummary = '';

  if (typeof content === 'string') {
    // Handle plain text messages ("Thinking...", errors)
    if (content === 'Thinking...' || content.startsWith('Error:') || content.startsWith('Intermittent LLM error')) {
        contentDiv.textContent = content;
        lastSummary = content; // Store the plain text error/status
        if (DEBUG) console.log('[LLM Content] Showing popup with text:', content);
    } else {
        // This case shouldn't normally happen if LLM returns JSON array correctly
        contentDiv.innerHTML = content; // Assume it might be simple HTML if not an error/status
        lastSummaryHtml = content;
        lastSummary = contentDiv.textContent || content;
        if (DEBUG) console.warn('[LLM Content] Showing popup with unexpected string content:', content);
    }
  } else if (content instanceof Node) {
    // Handle the UL element from renderJSONArrayList
    contentDiv.appendChild(content);
    lastSummaryHtml = contentDiv.innerHTML; // Store the generated HTML (e.g., "<ul><li>...</li></ul>")
    lastSummary = contentDiv.textContent; // Store the extracted plain text
    if (DEBUG) console.log('[LLM Content] Showing popup with HTML node:', lastSummaryHtml);
  } else {
      contentDiv.textContent = "Error: Invalid content type for popup.";
      lastSummary = contentDiv.textContent;
      if (DEBUG) console.error('[LLM Content] Invalid content type passed to showPopup:', content);
  }
  popup.appendChild(contentDiv);

  // Actions (Buttons)
  const actions = document.createElement('div');
  actions.className = 'summarizer-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'summarizer-btn copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.onclick = () => {
    let val = '';
    const listItems = contentDiv.querySelectorAll('li');
    if (listItems.length > 0) {
      // Format as a readable list for copying
      val = Array.from(listItems).map((li, idx) => `${idx + 1}. ${li.innerText.trim()}`).join('\n'); // Use innerText to ignore internal tags for copy
    } else {
      val = lastSummary || contentDiv.textContent || ''; // Fallback to plain text
    }
    navigator.clipboard.writeText(val.trim()).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy', 1500);
    }).catch(err => {
        console.error('[LLM Content] Failed to copy text: ', err);
        copyBtn.textContent = 'Error';
        setTimeout(() => copyBtn.textContent = 'Copy', 1500);
    });
  };
  actions.appendChild(copyBtn);

  const chatBtn = document.createElement('button');
  chatBtn.className = 'summarizer-btn chat-btn';
  chatBtn.textContent = 'Chat';
  // Disable chat button initially if there's no valid summary yet
  chatBtn.disabled = !(lastSummaryHtml || (lastSummary && !lastSummary.startsWith('Error:') && lastSummary !== 'Thinking...'));
  chatBtn.onclick = openChatWithContext;
  actions.appendChild(chatBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'summarizer-btn close-btn';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => popup.remove();
  actions.appendChild(closeBtn);

  popup.appendChild(actions);
  document.body.appendChild(popup);
  if (DEBUG) console.log('[LLM Content] New popup added to page.');

   // Re-enable chat button once summary is loaded (if it was initially disabled)
   if (lastSummaryHtml || (lastSummary && !lastSummary.startsWith('Error:') && lastSummary !== 'Thinking...')) {
       chatBtn.disabled = false;
   }
}


// --- Chat Context Handling ---
function openChatWithContext() {
  if (!selectedElement) {
    alert("Cannot open chat: Original element selection lost.");
    if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: selectedElement is null. This might happen if you clicked outside the popup after the summary appeared.');
    return;
  }
  if (!lastSummaryHtml && !(lastSummary && !lastSummary.startsWith('Error:'))) {
      alert("Cannot open chat: No valid summary available.");
      if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: No valid summary found (HTML/Text).');
      return;
  }

  const domSnippet = selectedElement.outerHTML || selectedElement.innerHTML || selectedElement.textContent || "";

  if (DEBUG) {
      console.log('[LLM Chat Context] Preparing to send context to background:');
      console.log('  DOM Snippet Length:', domSnippet.length);
      console.log('  Summary (HTML pref):', lastSummaryHtml || lastSummary);
      console.log('  Model used for summary:', lastModelUsed || '(Not recorded)');
  }

  // Step 1: Send context to background script for temporary storage
  chrome.runtime.sendMessage({
    action: "setChatContext",
    domSnippet: domSnippet,
    summary: lastSummaryHtml || lastSummary, // Prefer HTML, fallback to text
    summaryModel: lastModelUsed // Send the model that generated this summary
  }, function(response) { // Step 2: Callback after context is set (or failed)
    if (chrome.runtime.lastError) {
        console.error('[LLM Chat Context] Error sending context to background:', chrome.runtime.lastError);
        alert(`Error preparing chat: ${chrome.runtime.lastError.message}`);
        return;
    }

    if (response && response.status === 'ok') {
      if (DEBUG) console.log('[LLM Chat Context] Background confirmed context received. Requesting chat tab open.');

      // Step 3: Ask background to open the chat tab
      chrome.runtime.sendMessage({ action: "openChatTab" }, (openResponse) => {
          // Step 4: Callback after attempting to open tab (optional handling)
          if (chrome.runtime.lastError) {
              console.error('[LLM Chat Context] Error requesting chat tab open:', chrome.runtime.lastError);
              // Alert user that opening failed, but context might be set
              alert(`Error opening chat tab: ${chrome.runtime.lastError.message}. Context might be ready if you open chat manually.`);
          } else {
              if (DEBUG) console.log('[LLM Chat Context] Background acknowledged openChatTab request. Response:', openResponse);
              // Optional: Close the popup now that the tab should be opening
              const existingPopup = document.querySelector('.summarizer-popup');
              if (existingPopup) existingPopup.remove();
          }
      });
      // *** Line 422 (chrome.tabs.create) was removed from here ***

    } else {
      console.error('[LLM Chat Context] Background script did not confirm context storage. Response:', response);
      alert('Failed to prepare chat context. Please try summarizing again.');
    }
  });
}

// --- LLM Interaction ---
function tryExtractJSONArray(text) {
  let output = text.trim();
  if (DEBUG) console.log('[LLM Raw Output] Received:', output);

  // Try extracting from ```json ... ``` code blocks first
  const codeFenceRegex = /```(?:json)?\s*([\s\S]+?)\s*```/im;
  const match = output.match(codeFenceRegex);
  if (match && match[1]) {
      output = match[1].trim();
      if (DEBUG) console.log('[LLM Raw Output] Extracted from code fence:', output);
  }

  // Try parsing the (potentially extracted) string as JSON
  try {
    let arr = JSON.parse(output);
    if (Array.isArray(arr) && arr.every(x => typeof x === "string")) {
        if (DEBUG) console.log('[LLM Raw Output] Successfully parsed as JSON array.');
        return arr;
    } else {
        if (DEBUG) console.warn('[LLM Raw Output] Parsed JSON is not an array of strings:', arr);
        // Fall through to regex attempt if structure is wrong
    }
  } catch (e) {
      if (DEBUG) console.log('[LLM Raw Output] Initial JSON.parse failed:', e.message);
      // JSON parse failed, try regex for array-like structure as fallback
  }

  // Fallback: Regex to find the most likely array structure
  const arrayRegex = /(\[[\s\S]*?\])/; // Find first non-greedy array pattern
  const arrayMatch = output.match(arrayRegex);
  if (arrayMatch && arrayMatch[0]) {
      if (DEBUG) console.log('[LLM Raw Output] Found array-like structure with regex:', arrayMatch[0]);
      try {
          let arr = JSON.parse(arrayMatch[0]);
          if (Array.isArray(arr) && arr.every(x => typeof x === "string")) {
              if (DEBUG) console.log('[LLM Raw Output] Successfully parsed regex match as JSON array.');
              return arr;
          } else {
               if (DEBUG) console.warn('[LLM Raw Output] Parsed regex match is not an array of strings:', arr);
          }
      } catch (e2) {
          if (DEBUG) console.warn('[LLM Raw Output] Could not parse regex match as JSON:', e2.message);
      }
  }

  // If all attempts fail
  console.error('[LLM Error] Failed to extract valid JSON array from LLM response.');
  throw new Error('Invalid JSON array format received from LLM.');
}

function renderJSONArrayList(arr) {
  const ul = document.createElement('ul');
  arr.forEach((item) => {
    const li = document.createElement('li');
    // Basic sanitization: Allow only safe tags (b, i, em, strong, ul, ol, li)
    // This is NOT foolproof security, but prevents basic script injection.
    // A more robust approach would use a proper sanitizer library if available in content scripts.
    const allowedTags = /<\/?(b|i|em|strong|ul|ol|li)>/gi;
    li.innerHTML = item.replace(/<(?!\/?(b|i|em|strong|ul|ol|li)\b)[^>]*>/gi, ''); // Strip disallowed tags
    ul.appendChild(li);
  });
  return ul;
}

function sendToLLM(selectedHtml, apiKey, model, systemPrompt) {
  if (DEBUG) console.log(`[LLM Request] Sending to model: ${model} with prompt:`, systemPrompt);
  showPopup('Thinking...'); // Show initial status

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: selectedHtml }
    ],
    // structured_outputs: "true" // This seems non-standard for OpenAI/OpenRouter chat API? Remove unless specifically supported.
    // If you need JSON reliably, ensure the prompt *requests* JSON format.
  };

  fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/bogorad/openrouter-summarizer', // Example Referer
      'X-Title': 'OpenRouterSummarizer' // Example Title
    },
    body: JSON.stringify(payload)
  })
  .then(response => {
      if (!response.ok) {
          // Try to get error message from response body
          return response.text().then(text => {
              throw new Error(`API Error: ${response.status} ${response.statusText} - ${text}`);
          });
      }
      return response.json();
  })
  .then(data => {
      if (DEBUG) console.log('[LLM Response] Received data:', data);
      const modelOutput = data.choices?.[0]?.message?.content;

      if (!modelOutput) {
          throw new Error('No response content received from LLM.');
      }

      let arr = null;
      try {
        arr = tryExtractJSONArray(modelOutput);
        const listEl = renderJSONArrayList(arr);
        lastModelUsed = model; // Successfully got summary, store the model used
        showPopup(listEl); // Display the formatted list
      } catch (e) {
        // If JSON extraction failed, show the raw output (or part of it) as an error
        showPopup(`Intermittent LLM error or invalid format. LLM Raw Output:\n"${modelOutput.substring(0, 200)}${modelOutput.length > 200 ? '...' : ''}"`);
        console.error('[LLM Error] Failed to process LLM response:', e);
        if (DEBUG) console.log('[LLM Error] Raw output causing failure:', modelOutput);
      }
    })
  .catch(err => {
      console.error('[LLM Fetch Error]', err);
      // Display the error in the popup
      showPopup(`Error: ${err.message}`);
  });
}

function processSelectedElement() {
  if (!selectedElement) {
    showPopup('Error: No element selected. Please Alt+Click an element first.');
    return;
  }
  chrome.storage.sync.get(['apiKey', 'model', 'bulletCount', 'translate', 'translateLanguage', 'debug'], (config) => {
    DEBUG = !!config.debug; // Update debug status
    const apiKey = config.apiKey;
    const model = config.model;
    const bulletCount = config.bulletCount || 5;
    const translate = !!config.translate;
    const translateLanguage = config.translateLanguage || "english";

    if (!apiKey || !model) {
      showPopup('Error: API key or model not configured. Please check Options.');
      // Consider opening options page automatically?
      // chrome.runtime.sendMessage({ action: "openOptionsPage" }); // Requires listener in background
      return;
    }

    const htmlContent = selectedElement.outerHTML || selectedElement.innerHTML || selectedElement.textContent || '';
    if (!htmlContent.trim()) {
        showPopup('Error: Selected element has no content.');
        return;
    }
    const systemPrompt = getSystemPrompt(bulletCount, translate, translateLanguage);

    sendToLLM(htmlContent, apiKey, model, systemPrompt);
  });
}

// --- Message Listener from Background ---
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'processSelection') {
    if (DEBUG) console.log('[LLM Content] Received processSelection command.');
    processSelectedElement();
    sendResponse({status: "processing"}); // Optional: acknowledge
  }
  // Add other message handlers if needed
});
