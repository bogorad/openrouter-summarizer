// summaryPopup.js
// Manages the summary popup UI

// --- Constants ---
const POPUP_CLASS = 'summarizer-popup';
const POPUP_HEADER_CONTAINER_CLASS = 'summarizer-header-container';
const POPUP_HEADER_CLASS = 'summarizer-header';
const POPUP_FLAGS_CLASS = 'summarizer-flags';
const POPUP_BODY_CLASS = 'summarizer-body';
const POPUP_ACTIONS_CLASS = 'summarizer-actions';
const POPUP_BTN_CLASS = 'summarizer-btn';
const POPUP_COPY_BTN_CLASS = 'copy-btn';
const POPUP_CHAT_BTN_CLASS = 'chat-btn';
const POPUP_CLOSE_BTN_CLASS = 'close-btn';
const LANGUAGE_FLAG_CLASS = 'language-flag';
const MAX_FLAGS_DISPLAY = 5;

// --- Module State ---
let popup = null; // Reference to the current popup element
let currentContent = ''; // Store the raw content (text or HTML string)
let currentAvailableLanguages = []; // Store languages for flag rendering
let popupCallbacks = { onCopy: null, onChat: null, onClose: null }; // Callbacks for button actions
let copyTimeoutId = null; // Timeout ID for 'Copied!' message
let DEBUG = false;

// --- Language Data (Set by Initializer) ---
let ALL_LANGUAGE_NAMES_MAP = {};
let svgPathPrefixUrl = '';
let fallbackSvgPathUrl = '';

// --- Internal Helpers ---

function findLanguageByName(name) {
    if (!name || typeof name !== 'string' || !ALL_LANGUAGE_NAMES_MAP) return undefined;
    const cleanName = name.trim().toLowerCase();
    const languageData = ALL_LANGUAGE_NAMES_MAP[cleanName];
    return languageData ? languageData : undefined; // Returns { code, name } or undefined
}

function renderHeaderFlags() {
    if (!popup) return;
    const flagsContainer = popup.querySelector(`.${POPUP_FLAGS_CLASS}`);
    if (!flagsContainer) {
        console.warn("[LLM Popup] Flags container not found in popup DOM.");
        return;
    }
    flagsContainer.innerHTML = '';

    if (!Array.isArray(currentAvailableLanguages) || currentAvailableLanguages.length === 0 || !svgPathPrefixUrl) {
        flagsContainer.style.display = 'none';
        return;
    }

    const validLanguageData = currentAvailableLanguages
        .map(name => findLanguageByName(name)) // Get {code, name} objects
        .filter(lang => lang !== undefined); // Filter out not found languages

    if (validLanguageData.length === 0) {
        flagsContainer.style.display = 'none';
        return;
    }

    flagsContainer.style.display = 'flex';
    const flagsToDisplay = validLanguageData.slice(1, MAX_FLAGS_DISPLAY); // Skip first, limit count

    flagsToDisplay.forEach(lang => { // lang is {code, name}
        const flagImg = document.createElement('img');
        flagImg.className = LANGUAGE_FLAG_CLASS;
        flagImg.src = `${svgPathPrefixUrl}${lang.code.toLowerCase()}.svg`;
        flagImg.alt = `${lang.name} flag`;
        flagImg.title = `Translate summary and chat in ${lang.name}`;

        flagImg.onerror = function() {
            this.src = fallbackSvgPathUrl || ''; // Use fallback URL
            this.alt = 'Flag not found';
            this.title = 'Flag not found';
            if (DEBUG) console.warn(`[LLM Popup] Missing SVG for code: ${lang.code}, using fallback.`);
        };

        flagImg.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (DEBUG) console.log(`[LLM Popup] Flag clicked for language: ${lang.name}`);
            if (popupCallbacks.onChat) {
                popupCallbacks.onChat(lang.name); // Pass target language name
            } else {
                 console.warn("[LLM Popup] onChat callback not defined.");
            }
        });

        flagsContainer.appendChild(flagImg);
    });
}

function handleCopyClick(contentDiv, copyBtn) {
    if (copyTimeoutId) clearTimeout(copyTimeoutId);
    let val = '';
    const listItems = contentDiv.querySelectorAll('li');
    if (listItems.length > 0) {
        val = Array.from(listItems).map(li => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = li.innerHTML;
            return tempDiv.textContent.trim();
        }).filter(text => text !== '').map((text, idx) => `${idx + 1}. ${text}`).join('\n');
    } else {
        val = contentDiv.textContent || ''; // Fallback for plain text/error
    }
    navigator.clipboard.writeText(val.trim()).then(() => {
        copyBtn.textContent = 'Copied!';
        copyTimeoutId = setTimeout(() => { copyBtn.textContent = 'Copy'; copyTimeoutId = null; }, 1500);
    }).catch(err => {
        console.error('[LLM Popup] Failed to copy text: ', err);
        copyBtn.textContent = 'Error';
        copyTimeoutId = setTimeout(() => { copyBtn.textContent = 'Copy'; copyTimeoutId = null; }, 1500);
    });
}

// --- Public Functions ---

/**
 * Creates and shows the summary popup.
 * @param {string} content - The initial content (text or HTML string like '<ul>...</ul>').
 * @param {string[]} availableLanguages - Array of configured language names.
 * @param {object} callbacks - Object containing button callbacks { onCopy, onChat, onClose }.
 */
export function showPopup(content, availableLanguages = [], callbacks) {
    hidePopup(); // Remove any existing popup first

    if (!callbacks || typeof callbacks.onCopy !== 'function' || typeof callbacks.onChat !== 'function' || typeof callbacks.onClose !== 'function') {
        console.error('[LLM Popup] showPopup failed: Required callbacks missing.');
        return;
    }
    popupCallbacks = callbacks;
    currentAvailableLanguages = availableLanguages;
    currentContent = content; // Store initial content

    popup = document.createElement('div');
    popup.className = POPUP_CLASS;

    // Header Container
    const headerContainer = document.createElement('div');
    headerContainer.className = POPUP_HEADER_CONTAINER_CLASS;
    const header = document.createElement('div');
    header.className = POPUP_HEADER_CLASS;
    header.textContent = 'Summary';
    const flagsArea = document.createElement('div');
    flagsArea.className = POPUP_FLAGS_CLASS;
    headerContainer.appendChild(header);
    headerContainer.appendChild(flagsArea);
    popup.appendChild(headerContainer);

    // Body
    const contentDiv = document.createElement('div');
    contentDiv.className = POPUP_BODY_CLASS;
    if (typeof content === 'string') {
        if (content === 'Thinking...' || content.startsWith('Error:')) {
            contentDiv.textContent = content;
        } else {
            // Assume HTML string for successful summary
            contentDiv.innerHTML = content;
        }
    } else {
        contentDiv.textContent = "Error: Invalid content type.";
        console.error('[LLM Popup] Invalid content type passed to showPopup:', content);
    }
    popup.appendChild(contentDiv);

    // Actions
    const actions = document.createElement('div');
    actions.className = POPUP_ACTIONS_CLASS;

    const copyBtn = document.createElement('button');
    copyBtn.className = `${POPUP_BTN_CLASS} ${POPUP_COPY_BTN_CLASS}`;
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = () => handleCopyClick(contentDiv, copyBtn); // Use internal handler
    actions.appendChild(copyBtn);

    const chatBtn = document.createElement('button');
    chatBtn.className = `${POPUP_BTN_CLASS} ${POPUP_CHAT_BTN_CLASS}`;
    chatBtn.textContent = 'Chat';
    // Disable chat initially if content is not valid HTML (i.e., loading or error)
    chatBtn.disabled = !(typeof content === 'string' && content.startsWith('<ul>'));
    chatBtn.onclick = () => popupCallbacks.onChat(null); // Call chat callback without targetLang initially
    actions.appendChild(chatBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = `${POPUP_BTN_CLASS} ${POPUP_CLOSE_BTN_CLASS}`;
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => popupCallbacks.onClose(); // Call close callback
    actions.appendChild(closeBtn);

    popup.appendChild(actions);
    document.body.appendChild(popup);
    if (DEBUG) console.log('[LLM Popup] Popup added to page.');

    // Render flags based on the provided languages
    renderHeaderFlags();

    // Show with transition (if CSS supports it)
    popup.style.display = 'flex';
    requestAnimationFrame(() => {
        if (popup) popup.classList.add('visible'); // Check if popup still exists
    });
}

/**
 * Hides and removes the summary popup from the DOM.
 */
export function hidePopup() {
    if (popup) {
        const popupElement = popup; // Capture reference
        popup = null; // Clear global reference immediately
        popupCallbacks = { onCopy: null, onChat: null, onClose: null }; // Clear callbacks
        currentAvailableLanguages = [];
        currentContent = '';
        if (copyTimeoutId) clearTimeout(copyTimeoutId); copyTimeoutId = null;

        popupElement.classList.remove('visible'); // Trigger transition

        const computedStyle = window.getComputedStyle(popupElement);
        const transitionDuration = parseFloat(computedStyle.transitionDuration) * 1000;

        setTimeout(() => {
            if (popupElement && popupElement.parentNode) {
                popupElement.parentNode.removeChild(popupElement);
                if (DEBUG) console.log("[LLM Popup] Popup hidden and removed.");
            }
        }, transitionDuration > 0 ? transitionDuration + 50 : 10);
    }
}

/**
 * Updates the content of the existing popup body.
 * @param {string} newContent - The new content (text or HTML string).
 */
export function updatePopupContent(newContent) {
    if (!popup) {
        if (DEBUG) console.warn("[LLM Popup] updatePopupContent called but popup doesn't exist.");
        return;
    }
    currentContent = newContent; // Update stored content
    const contentDiv = popup.querySelector(`.${POPUP_BODY_CLASS}`);
    if (contentDiv) {
        if (typeof newContent === 'string') {
            if (newContent === 'Thinking...' || newContent.startsWith('Error:')) {
                contentDiv.textContent = newContent;
            } else {
                contentDiv.innerHTML = newContent; // Assume HTML string
            }
            if (DEBUG) console.log("[LLM Popup] Popup content updated.");
        } else {
            contentDiv.textContent = "Error: Invalid content type.";
            console.error('[LLM Popup] Invalid content type passed to updatePopupContent:', newContent);
        }
    } else {
         console.error("[LLM Popup] Cannot update content: Popup body div not found.");
    }
}

/**
 * Enables or disables the Chat button in the popup.
 * @param {boolean} enable - True to enable, false to disable.
 */
export function enableChatButton(enable) {
    if (!popup) return;
    const chatBtn = popup.querySelector(`.${POPUP_CHAT_BTN_CLASS}`);
    if (chatBtn) {
        chatBtn.disabled = !enable;
        if (DEBUG) console.log(`[LLM Popup] Chat button ${enable ? 'enabled' : 'disabled'}.`);
    }
}

/**
 * Initializes the popup manager module.
 * @param {object} options - Configuration options.
 * @param {object} options.languageData - Object containing { ALL_LANGUAGE_NAMES_MAP, svgPathPrefixUrl, fallbackSvgPathUrl }.
 * @param {boolean} [options.initialDebugState=false] - Initial debug logging state.
 */
export function initializePopupManager(options) {
    DEBUG = !!options?.initialDebugState;
    if (options?.languageData) {
        ALL_LANGUAGE_NAMES_MAP = options.languageData.ALL_LANGUAGE_NAMES_MAP || {};
        svgPathPrefixUrl = options.languageData.svgPathPrefixUrl || '';
        fallbackSvgPathUrl = options.languageData.fallbackSvgPathUrl || '';
        if (DEBUG) console.log('[LLM Popup] Initialized with language data.');
    } else {
        console.warn('[LLM Popup] Initialized without language data. Flags will not render.');
    }
}
