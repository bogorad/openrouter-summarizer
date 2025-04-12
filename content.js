// == OpenRouter Summarizer Content Script ==

// Language display names map
const LANGUAGE_DISPLAY = {
  english: "English",
  spanish: "Spanish",
  french: "French",
  mandarin: "Mandarin",
  arabic: "Arabic",
  hebrew: "Hebrew",
  russian: "Russian"
};

const numToWord = {
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight"
};

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

chrome.storage.sync.get(['debug'], (result) => {
  DEBUG = !!result.debug;
  if (DEBUG) console.log('[LLM] Debug mode enabled');
});

// ALT highlighting and icon logic
window.addEventListener('keydown', (e) => {
  if (e.key === 'Alt') altKeyDown = true;
});
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
  }
}, true);

function removeFloatingIcon() {
  if (floatingIcon && floatingIcon.parentNode) {
    floatingIcon.parentNode.removeChild(floatingIcon);
    floatingIcon = null;
  }
}

function createFloatingIcon(x, y, targetElement) {
  removeFloatingIcon();

  floatingIcon = document.createElement('div');
  floatingIcon.className = 'llm-floating-icon';
  floatingIcon.setAttribute('aria-label', 'Summarize this element');
  floatingIcon.setAttribute('tabindex', '0');
  floatingIcon.title = 'Summarize this element';

  let iconUrl = '';
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
    iconUrl = chrome.runtime.getURL('icons/icon32.png');
  }

  const iconImg = document.createElement('img');
  iconImg.src = iconUrl;
  iconImg.alt = 'Summarize';

  iconImg.onerror = function() {
    iconImg.style.display = 'none';
    if (!floatingIcon.querySelector('.llm-fallback-icon')) {
      const fallback = document.createElement('span');
      fallback.className = 'llm-fallback-icon';
      fallback.textContent = '💡';
      fallback.style.fontSize = '22px';
      floatingIcon.appendChild(fallback);
    }
  };
  if (!iconUrl) iconImg.onerror();

  floatingIcon.appendChild(iconImg);

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

  const maxX = window.scrollX + window.innerWidth - 36;
  const maxY = window.scrollY + window.innerHeight - 36;
  if (iconX > maxX) floatingIcon.style.left = `${maxX}px`;
  if (iconY > maxY) floatingIcon.style.top = `${maxY}px`;

  floatingIcon.style.pointerEvents = 'auto';

  floatingIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    removeFloatingIcon();
    processSelectedElement();
  });

  floatingIcon.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      removeFloatingIcon();
      processSelectedElement();
    }
  });

  document.body.appendChild(floatingIcon);
}

document.addEventListener('mousedown', e => {
  if (e.target.closest('.llm-floating-icon')) return;

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
    } else {
      if (lastHighlighted) lastHighlighted.classList.remove('llm-highlight');
      selectedElement = e.target;
      lastHighlighted = e.target;
      selectedElement.classList.add('llm-highlight');
      createFloatingIcon(e.pageX, e.pageY, selectedElement);
    }
    return;
  }

  if (!e.altKey && e.button === 0) {
    if (selectedElement) {
      selectedElement.classList.remove('llm-highlight');
      selectedElement = null;
      lastHighlighted = null;
      removeFloatingIcon();
    }
  }
}, true);

function showPopup(content) {
  const existing = document.querySelector('.llm-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'llm-popup';

  const header = document.createElement('div');
  header.textContent = 'Summary';
  header.className = 'llm-popup-header';
  popup.appendChild(header);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'llm-popup-content';

  // this might be unsafe, but fuck it :)
  if (typeof content === 'string') {
    contentDiv.innerHTML = content;
  } else if (content instanceof Node) {
    contentDiv.appendChild(content);
  }

  popup.appendChild(contentDiv);

  const btnContainer = document.createElement('div');
  btnContainer.style.marginTop = '10px';
  btnContainer.style.textAlign = 'center';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'llm-copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.onclick = () => {
    let val = '';
    if (
      contentDiv.querySelector('ul') &&
      contentDiv.querySelectorAll('li').length > 0
    ) {
      val = Array.from(contentDiv.querySelectorAll('li'))
        .map((li, idx) => (idx + 1) + '. ' + li.textContent)
        .join('\n');
    } else {
      val = typeof content === 'string' ? content : contentDiv.textContent;
    }
    navigator.clipboard.writeText(val).then(() => {
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
}

// Extract JSON array from LLM response
function tryExtractJSONArray(text) {
  let output = text.trim();
  const codeFenceRegex = /^```(?:json[^\n]*)?\n([\s\S]+?)\n```$/im;
  const match = output.match(codeFenceRegex);
  if (match && match[1]) {
    output = match[1].trim();
  }
  let arr = null;
  try {
    arr = JSON.parse(output);
    if (Array.isArray(arr) && arr.every(x => typeof x === "string")) return arr;
  } catch {}
  const arrayRegex = /\[[\s\S]*\]/;
  const arrayMatch = output.match(arrayRegex);
  if (arrayMatch) {
    try {
      arr = JSON.parse(arrayMatch[0]);
      if (Array.isArray(arr) && arr.every(x => typeof x === "string")) return arr;
    } catch {}
  }
  throw new Error('Invalid array');
}

function renderJSONArrayList(arr) {
  const ul = document.createElement('ul');
  arr.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = item; // Respect tags
    ul.appendChild(li);
  });
  return ul;
}

function sendToLLM(selectedText, apiKey, model, systemPrompt) {
  showPopup('Thinking...');

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: selectedText }
    ],
    structured_outputs: "true"
  };

  fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://yourdomain.com',
      'X-Title': 'OpenRouterSummarizer'
    },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(data => {
      const modelOutput = data.choices?.[0]?.message?.content || 'No response.';
      let arr = null;
      try {
        arr = tryExtractJSONArray(modelOutput);
        const listEl = renderJSONArrayList(arr);
        showPopup(listEl);
      } catch (e) {
        showPopup("Intermittent LLM error, try again later.");
        // Only dump to the console if DEBUG is true:
        if (DEBUG) {
          console.warn('[LLM][Invalid JSON array from LLM] Raw output:', modelOutput);
        }
      }
    })
    .catch(err => {
      showPopup('Error: ' + err.message);
    });
}

function processSelectedElement() {
  if (!selectedElement) {
    showPopup('Please Alt+click an element first.');
    return;
  }

  chrome.storage.sync.get(['apiKey', 'model', 'bulletCount', 'translate', 'translateLanguage'], (config) => {
    const apiKey = config.apiKey;
    const model = config.model;
    const bulletCount = config.bulletCount || 5;
    const translate = !!config.translate;
    const translateLanguage = config.translateLanguage || "english";
    if (!apiKey || !model) {
      showPopup('Please set your API key and model in Options.');
      return;
    }

    const html = selectedElement.outerHTML || selectedElement.innerHTML || selectedElement.textContent || '';
    const systemPrompt = getSystemPrompt(bulletCount, translate, translateLanguage);

    sendToLLM(html, apiKey, model, systemPrompt);
  });
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'processSelection') {
    processSelectedElement();
  }
});


