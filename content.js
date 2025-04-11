// == OpenRouter Summarizer Content Script ==

const DEFAULT_PROMPT = "Summarize this article in 5 bullet points. Ignore HTML tags. Do not comment on output.";

let selectedElement = null;
let lastHighlighted = null;
let altKeyDown = false;
let previewHighlighted = null;
let floatingIcon = null;

// Debug flag, default to false
let DEBUG = false;
chrome.storage.sync.get(['debug'], (result) => {
  DEBUG = !!result.debug;
  if (DEBUG) console.log('[LLM] Debug mode enabled');
});

// Inject highlight and popup styles once
if (!document.getElementById('llm-style')) {
  const style = document.createElement('style');
  style.id = 'llm-style';
  style.textContent = `
.llm-popup {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  max-width: 80vw;
  max-height: 80vh;
  overflow: auto;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding:15px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  z-index: 999999;
  font-family: "Segoe UI", "Roboto", "Helvetica", sans-serif;
  font-size: 15px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.llm-highlight {
  outline: 2px solid orange !important;
}
.llm-highlight-preview {
  outline: 2px dashed #1976d2 !important;
  background-color: rgba(25, 118, 210, 0.08) !important;
}
.llm-copy-btn {
  font-family: inherit;
  font-size: 14px;
  border: none;
  background-color: #2196F3;
  color: #fff;
  border-radius: 4px;
  padding: 6px 12px;
  margin: 10px 5px 0 0;
  cursor: pointer;
}
.llm-popup-content { margin-top: 10px; }
.llm-floating-icon {
  position: absolute;
  z-index: 1000000;
  width: 32px;
  height: 32px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  border: 1px solid #1976d2;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: box-shadow 0.2s;
}
.llm-floating-icon:hover {
  box-shadow: 0 4px 16px rgba(25,118,210,0.25);
  border-color: #2196F3;
}
.llm-floating-icon img {
  width: 22px;
  height: 22px;
  display: block;
}
`;
  document.head.appendChild(style);
}

// Track ALT key state
window.addEventListener('keydown', (e) => {
  if (e.key === 'Alt') {
    altKeyDown = true;
    if (DEBUG) console.log('[LLM] ALT key down');
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Alt') {
    altKeyDown = false;
    if (DEBUG) console.log('[LLM] ALT key up');
    if (previewHighlighted) {
      previewHighlighted.classList.remove('llm-highlight-preview');
      previewHighlighted = null;
    }
  }
});

// Remove preview highlight if mouse leaves the document
window.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget && previewHighlighted) {
    previewHighlighted.classList.remove('llm-highlight-preview');
    previewHighlighted = null;
    if (DEBUG) console.log('[LLM] Mouse left document, removed preview highlight');
  }
});

// Mouse move: highlight element under mouse if ALT is held
document.addEventListener('mousemove', (e) => {
  if (!altKeyDown) {
    if (previewHighlighted) {
      previewHighlighted.classList.remove('llm-highlight-preview');
      previewHighlighted = null;
      if (DEBUG) console.log('[LLM] ALT not held, removed preview highlight');
    }
    return;
  }

  let target = e.target;

  if (target === selectedElement) {
    if (previewHighlighted && previewHighlighted !== selectedElement) {
      previewHighlighted.classList.remove('llm-highlight-preview');
      previewHighlighted = null;
    }
    return;
  }

  if (previewHighlighted && previewHighlighted !== target) {
    previewHighlighted.classList.remove('llm-highlight-preview');
    previewHighlighted = null;
  }

  if (target && target !== selectedElement && !target.classList.contains('llm-popup') && !target.classList.contains('llm-floating-icon')) {
    previewHighlighted = target;
    previewHighlighted.classList.add('llm-highlight-preview');
    if (DEBUG) console.log('[LLM] Preview highlight on', target);
  }
}, true);

function removeFloatingIcon() {
  if (floatingIcon && floatingIcon.parentNode) {
    floatingIcon.parentNode.removeChild(floatingIcon);
    floatingIcon = null;
    if (DEBUG) console.log('[LLM] Floating icon removed');
  }
}

function createFloatingIcon(x, y, targetElement) {
  removeFloatingIcon();

  floatingIcon = document.createElement('div');
  floatingIcon.className = 'llm-floating-icon';
  floatingIcon.setAttribute('aria-label', 'Summarize this element');
  floatingIcon.setAttribute('tabindex', '0');
  floatingIcon.title = 'Summarize this element';

  const iconUrl = chrome.runtime.getURL('icons/icon32.png');
  const iconImg = document.createElement('img');
  iconImg.src = iconUrl;
  iconImg.alt = 'Summarize';

  iconImg.onerror = function() {
    iconImg.style.display = 'none';
    const fallback = document.createElement('span');
    fallback.textContent = '💡';
    fallback.style.fontSize = '22px';
    floatingIcon.appendChild(fallback);
  };

  floatingIcon.appendChild(iconImg);

  // Position the icon
  const rect = targetElement.getBoundingClientRect();
  let iconX = rect.right + window.scrollX - 16;
  let iconY = rect.top + window.scrollY - 16;

  if (
    x >= rect.left + window.scrollX &&
    x <= rect.right + window.scrollX &&
    y >= rect.top + window.scrollY &&
    y <= rect.bottom + window.scrollY
  ) {
    iconX = x - 16;
    iconY = y - 16;
  }

  floatingIcon.style.left = `${iconX}px`;
  floatingIcon.style.top = `${iconY}px`;

  // Prevent icon from being off-screen
  const maxX = window.scrollX + window.innerWidth - 36;
  const maxY = window.scrollY + window.innerHeight - 36;
  if (iconX > maxX) floatingIcon.style.left = `${maxX}px`;
  if (iconY > maxY) floatingIcon.style.top = `${maxY}px`;

  floatingIcon.style.pointerEvents = 'auto';

  floatingIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    if (DEBUG) {
      console.log('[LLM] Floating icon clicked');
      console.log('[LLM] selectedElement:', selectedElement);
    }
    processSelectedElement();
  });

  floatingIcon.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (DEBUG) console.log('[LLM] Floating icon activated by keyboard');
      processSelectedElement();
    }
  });

  document.body.appendChild(floatingIcon);
  if (DEBUG) console.log('[LLM] Floating icon created');
}

document.addEventListener('mousedown', e => {
  // Ignore clicks on the floating icon
  if (e.target.closest('.llm-floating-icon')) {
    if (DEBUG) console.log('[LLM] Click on floating icon, ignoring document mousedown');
    return;
  }

  if (e.altKey && e.button === 0) {
    e.preventDefault();

    if (previewHighlighted) {
      previewHighlighted.classList.remove('llm-highlight-preview');
      previewHighlighted = null;
    }

    removeFloatingIcon();

    if (selectedElement === e.target) {
      selectedElement.classList.remove('llm-highlight');
      selectedElement = null;
      lastHighlighted = null;
      removeFloatingIcon();
      if (DEBUG) console.log('[LLM] Deselected element');
    } else {
      if (lastHighlighted) lastHighlighted.classList.remove('llm-highlight');
      selectedElement = e.target;
      lastHighlighted = e.target;
      selectedElement.classList.add('llm-highlight');
      createFloatingIcon(e.pageX, e.pageY, selectedElement);
      if (DEBUG) console.log('[LLM] Selected element', selectedElement);
    }
    return;
  }

  // Remove highlight and floating icon on normal click
  if (!e.altKey && e.button === 0) {
    if (selectedElement) {
      selectedElement.classList.remove('llm-highlight');
      selectedElement = null;
      lastHighlighted = null;
      removeFloatingIcon();
      if (DEBUG) console.log('[LLM] Deselected element by normal click');
    }
  }
}, true);

function showPopup(content) {
  const existing = document.querySelector('.llm-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'llm-popup';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'llm-popup-content';
  contentDiv.textContent = content;
  popup.appendChild(contentDiv);

  const btnContainer = document.createElement('div');
  btnContainer.style.marginTop = '10px';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'llm-copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(content).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy', 1500);
    });
  };
  btnContainer.appendChild(copyBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'llm-copy-btn';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => popup.remove();
  btnContainer.appendChild(closeBtn);

  popup.appendChild(btnContainer);
  document.body.appendChild(popup);
  if (DEBUG) console.log('[LLM] Popup shown');
}

function sendToLLM(finalPrompt, apiKey, model) {
  showPopup('Thinking...');

  fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://yourdomain.com',
      'X-Title': 'YourExtensionName'
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      temperature: 0.7,
      messages: [{ role: 'user', content: finalPrompt }]
    })
  })
    .then(r => r.json())
    .then(data => {
      const text = data.choices?.[0]?.message?.content || 'No response.';
      showPopup(text.trim());
      if (DEBUG) console.log('[LLM] LLM response:', text.trim());
    })
    .catch(err => {
      if (DEBUG) console.error('[LLM] Error:', err);
      showPopup('Error: ' + err.message);
    });
}

function processSelectedElement() {
  if (DEBUG) console.log('[LLM] processSelectedElement called, selectedElement:', selectedElement);
  if (!selectedElement) {
    showPopup('Please Alt+click an element first.');
    return;
  }

  chrome.storage.sync.get(['apiKey', 'model', 'prompt'], (config) => {
    const apiKey = config.apiKey;
    const model = config.model;
    const promptTemplate = config.prompt || DEFAULT_PROMPT;

    if (!apiKey || !model) {
      showPopup('Please set your API key and model in Options.');
      if (DEBUG) console.warn('[LLM] Missing API key or model');
      return;
    }

    const text = selectedElement.innerText || selectedElement.textContent || '';
    const fullPrompt = `${promptTemplate}\n\n${text}`;
    if (DEBUG) console.log('[LLM] Sending prompt:', fullPrompt);
    sendToLLM(fullPrompt, apiKey, model);
  });
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'processSelection') {
    processSelectedElement();
  }
});

