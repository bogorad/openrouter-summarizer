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

// --- State Variables ---
let selectedElement = null;
let lastHighlighted = null;
let altKeyDown = false; // <<< Our target state variable
let previewHighlighted = null;
let floatingIcon = null;
let DEBUG = false;
let lastSummary = '';
let lastSummaryHtml = '';
let lastModelUsed = '';

// --- Initialization ---
chrome.storage.sync.get(['debug'], (result) => {
  DEBUG = !!result.debug;
  if (DEBUG) console.log('[LLM Content] Debug mode enabled');
});

// --- Helper Function to Reset Alt State ---
function resetAltState() {
    // Only log/act if state actually needs resetting
    if (altKeyDown || previewHighlighted) {
        if (DEBUG) console.log('[LLM Content Alt State] Resetting Alt key state and clearing preview.');
        altKeyDown = false;
        if (previewHighlighted) {
            // Check if the element still exists in the DOM before trying to modify it
            if (document.body.contains(previewHighlighted)) {
                previewHighlighted.classList.remove('llm-highlight-preview');
            }
            previewHighlighted = null;
        }
    }
}

// --- Event Listeners for ALT Key, Focus, Visibility ---

// Keydown: Set alt flag
window.addEventListener('keydown', (e) => {
    // Only set if Alt is pressed and wasn't already considered down
    if (e.key === 'Alt' && !altKeyDown) {
        // Check if the active element is an input/textarea to avoid interfering
        // with standard Alt shortcuts in text fields (like Alt+Backspace)
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
             if (DEBUG) console.log('[LLM Content Alt State] Ignoring Alt down in input field.');
             return;
        }

        altKeyDown = true;
        if (DEBUG) console.log('[LLM Content Alt State] Alt key down.');
    }
});

// Keyup: Reset alt flag
window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
        // Always reset on Alt keyup, regardless of previous state
        if (DEBUG) console.log('[LLM Content Alt State] Alt key up.');
        resetAltState();
    }
});

// Blur: Reset alt flag when window loses focus (covers Alt+Tab away)
window.addEventListener('blur', () => {
    if (DEBUG) console.log('[LLM Content Alt State] Window blurred.');
    resetAltState();
});

// Visibility Change: Reset alt flag when tab becomes hidden
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        if (DEBUG) console.log('[LLM Content Alt State] Document hidden.');
        resetAltState();
    }
});


// --- Mouse Listeners (Highlighting & Selection) ---

// Mouseout: Clear preview if mouse leaves window while Alt might be down
window.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget && previewHighlighted) {
    if (DEBUG) console.log('[LLM Content] Mouse left window, clearing preview.');
    // Don't reset altKeyDown here, just the visual preview
    if (document.body.contains(previewHighlighted)) { // Check existence
        previewHighlighted.classList.remove('llm-highlight-preview');
    }
    previewHighlighted = null;
  }
});

// Mousemove: Handle preview highlighting
document.addEventListener('mousemove', (e) => {
  // If Alt key state is not considered active, ensure preview is cleared and stop
  if (!altKeyDown) {
    if (previewHighlighted) {
        if (document.body.contains(previewHighlighted)) { // Check existence
             previewHighlighted.classList.remove('llm-highlight-preview');
        }
        previewHighlighted = null;
    }
    return;
  }

  // --- Alt key IS considered active ---
  let target = document.elementFromPoint(e.clientX, e.clientY);

  // Ignore elements within our UI or invalid targets
  if (!target || target.closest('.summarizer-popup') || target.closest('.summarizer-btn') || target.classList.contains('llm-floating-icon')) {
    if (previewHighlighted) { // If hovering over invalid target, remove preview from previous valid one
        if (document.body.contains(previewHighlighted)) {
            previewHighlighted.classList.remove('llm-highlight-preview');
        }
        previewHighlighted = null;
    }
    return; // Stop processing for invalid targets
  }

  // Avoid highlighting the body/html directly unless it's the only option
  if ((target === document.body || target === document.documentElement) && document.elementsFromPoint(e.clientX, e.clientY).length > 1) {
      const deeperTarget = document.elementsFromPoint(e.clientX, e.clientY)[1];
      if (deeperTarget && !deeperTarget.closest('.summarizer-popup') && !deeperTarget.closest('.summarizer-btn') && !deeperTarget.classList.contains('llm-floating-icon')) {
          target = deeperTarget;
      } else {
          if (previewHighlighted) { // Remove preview if deeper target is also invalid
              if (document.body.contains(previewHighlighted)) {
                 previewHighlighted.classList.remove('llm-highlight-preview');
              }
              previewHighlighted = null;
          }
          return;
      }
  }

  // Don't double-highlight the selected element during preview
  if (target === selectedElement) {
    if (previewHighlighted && previewHighlighted !== selectedElement) { // Clear preview if it was on a different element
        if (document.body.contains(previewHighlighted)) {
            previewHighlighted.classList.remove('llm-highlight-preview');
        }
        previewHighlighted = null;
    }
    return; // Don't apply preview style to already selected element
  }

  // Update preview highlight if target changed
  if (previewHighlighted !== target) {
     if (previewHighlighted) { // Remove from old target
         if (document.body.contains(previewHighlighted)) {
            previewHighlighted.classList.remove('llm-highlight-preview');
         }
     }
     previewHighlighted = target; // Set new target
     if (previewHighlighted) { // Add to new target (check target isn't null)
        previewHighlighted.classList.add('llm-highlight-preview');
     }
  }
}, true); // Use capture phase

// Mousedown: Handle element selection and deselection
document.addEventListener('mousedown', e => {
  // Ignore clicks on the floating icon itself
  if (e.target.closest('.llm-floating-icon')) return;

  // --- ALT+Click logic ---
  if (e.altKey && e.button === 0) {
    e.preventDefault();
    e.stopPropagation();

    // Use the target from the mousedown event directly
    const clickedTarget = e.target;

    // If a preview was active, remove its style (should ideally be handled by mousemove/blur already)
    if (previewHighlighted) {
        if (document.body.contains(previewHighlighted)) {
            previewHighlighted.classList.remove('llm-highlight-preview');
        }
        previewHighlighted = null;
    }
    removeFloatingIcon(); // Remove any existing icon

    // Deselect if clicking the currently selected element
    if (selectedElement === clickedTarget) {
      if (document.body.contains(selectedElement)) {
          selectedElement.classList.remove('llm-highlight');
      }
      selectedElement = null;
      lastHighlighted = null;
      removeFloatingIcon();
      if (DEBUG) console.log('[LLM Content] Deselected element via Alt+Click on same element.');
    } else {
      // Select the new element
      if (lastHighlighted && document.body.contains(lastHighlighted)) {
        lastHighlighted.classList.remove('llm-highlight');
      }
      // Ensure clicked target is valid before selecting
      if (clickedTarget && !clickedTarget.closest('.summarizer-popup')) {
          selectedElement = clickedTarget;
          lastHighlighted = clickedTarget;
          selectedElement.classList.add('llm-highlight');
          createFloatingIcon(e.pageX, e.pageY);
          if (DEBUG) console.log('[LLM Content] Selected element:', selectedElement);
      } else {
          if (DEBUG) console.warn('[LLM Content] Alt+Click detected but target was invalid or inside popup.');
          selectedElement = null; // Ensure nothing is selected
          lastHighlighted = null;
      }
    }
    // Explicitly set altKeyDown = true here? No, rely on keydown listener.
    // But ensure the preview state is clean.
    previewHighlighted = null;
    return; // Handled Alt+Click
  }

  // --- Regular click (no Alt key) ---
  if (!e.altKey && e.button === 0) {
      // Check if the click is outside the selected element, AND outside the floating icon, AND outside the popup
      if (selectedElement &&
          !selectedElement.contains(e.target) &&
          !e.target.closest('.llm-floating-icon') &&
          !e.target.closest('.summarizer-popup')) {
          if (DEBUG) console.log('[LLM Content] Click outside selected element, icon, AND popup detected. Deselecting.');
          if (document.body.contains(selectedElement)) {
             selectedElement.classList.remove('llm-highlight');
          }
          selectedElement = null;
          lastHighlighted = null;
          removeFloatingIcon();
      } else {
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
        if (selectedElement && document.body.contains(selectedElement)) {
            selectedElement.classList.remove('llm-highlight');
            selectedElement = null;
            lastHighlighted = null;
        }
    }
  });

  document.body.appendChild(floatingIcon);
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
              alert(`Error opening chat tab: ${chrome.runtime.lastError.message}. Context might be ready if you open chat manually.`);
          } else {
              if (DEBUG) console.log('[LLM Chat Context] Background acknowledged openChatTab request. Response:', openResponse);
              // Optional: Close the popup now that the tab should be opening
              const existingPopup = document.querySelector('.summarizer-popup');
              if (existingPopup) existingPopup.remove();
          }
      });

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
    }
  } catch (e) {
      if (DEBUG) console.log('[LLM Raw Output] Initial JSON.parse failed:', e.message);
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

  console.error('[LLM Error] Failed to extract valid JSON array from LLM response.');
  throw new Error('Invalid JSON array format received from LLM.');
}

function renderJSONArrayList(arr) {
  const ul = document.createElement('ul');
  arr.forEach((item) => {
    const li = document.createElement('li');
    // Basic sanitization (already present)
    li.innerHTML = item.replace(/<(?!\/?(b|i|em|strong|ul|ol|li)\b)[^>]*>/gi, '');
    ul.appendChild(li);
  });
  return ul;
}

function sendToLLM(selectedHtml, apiKey, model, systemPrompt) {
  if (DEBUG) console.log(`[LLM Request] Sending to model: ${model} with prompt:`, systemPrompt);
  showPopup('Thinking...');

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: selectedHtml }
    ],
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
          return response.text().then(text => { throw new Error(`API Error: ${response.status} ${response.statusText} - ${text}`); });
      }
      return response.json();
  })
  .then(data => {
      if (DEBUG) console.log('[LLM Response] Received data:', data);
      const modelOutput = data.choices?.[0]?.message?.content;
      if (!modelOutput) { throw new Error('No response content received from LLM.'); }

      let arr = null;
      try {
        arr = tryExtractJSONArray(modelOutput);
        const listEl = renderJSONArrayList(arr);
        lastModelUsed = model; // Store model used for successful summary
        showPopup(listEl);
      } catch (e) {
        showPopup(`Intermittent LLM error or invalid format. LLM Raw Output:\n"${modelOutput.substring(0, 200)}${modelOutput.length > 200 ? '...' : ''}"`);
        console.error('[LLM Error] Failed to process LLM response:', e);
        if (DEBUG) console.log('[LLM Error] Raw output causing failure:', modelOutput);
      }
    })
  .catch(err => {
      console.error('[LLM Fetch Error]', err);
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
    const translateLanguage = config.translateLanguage || "english"; // Should use "none" or language name now

    if (!apiKey || !model) {
      showPopup('Error: API key or model not configured. Please check Options.');
      return;
    }

    const htmlContent = selectedElement.outerHTML || selectedElement.innerHTML || selectedElement.textContent || '';
    if (!htmlContent.trim()) {
        showPopup('Error: Selected element has no content.');
        return;
    }
    // Pass the correct language value ('none' or name) to getSystemPrompt
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
});
