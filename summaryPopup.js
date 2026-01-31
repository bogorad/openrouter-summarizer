// summaryPopup.js
/**
 * summaryPopup.js
 * Short Spec: Manages the summary popup UI with Shadow DOM encapsulation.
 * Provides functions to show, hide, and update the popup content.
 * Dependencies: marked (optional for inline parsing).
 */

// --- CSS STYLES ---
// Extracted from pageInteraction.css and isolated within this module.
const POPUP_STYLES = `
  /* --- Globals --- */
  :host {
    all: initial; /* Reset all inherited styles */
    display: block;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Segoe UI Emoji", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", "Noto Color Emoji", sans-serif !important;
  }

  /* --- Main Popup Container --- */
  .summarizer-popup {
    position: fixed;
    top: 10vh;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    width: auto;
    max-width: 750px;
    min-width: 320px;
    height: min-content;
    background-color: #ffffff;
    border: 1.5px solid #2196F3;
    border-radius: 14px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
    color: #333;
    font-size: 16px;
    overflow: hidden;
    opacity: 0;
    transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
    transform: translateX(-50%) translateY(-10px);
  }

  .summarizer-popup.visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  /* --- Popup Header Container --- */
  .summarizer-header-container {
    padding: 14px 20px;
    background-color: #2196F3;
    color: #ffffff;
    flex-shrink: 0;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  /* --- Popup Header (Summary Title) --- */
  .summarizer-header {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0;
    text-align: center;
  }

  /* --- Popup Body (Main Content Area) --- */
  .summarizer-body {
    padding: 18px 20px;
    background-color: #f7faff;
    color: #1e2333;
    font-size: 1em;
    line-height: 1.6;
    min-height: 50px;
    max-height: 65vh;
    overflow-y: auto;
    word-wrap: break-word;
    border-radius: 0;
    margin: 0;
  }

  .summarizer-body ul {
    padding-left: 20px;
    margin: 0.5em 0;
  }
  .summarizer-body li {
    margin-bottom: 0.6em;
  }
  .summarizer-body b,
  .summarizer-body strong {
    font-weight: 600;
  }
  .summarizer-body i,
  .summarizer-body em {
    font-style: italic;
  }

  /* --- Popup Actions (Footer with Buttons) --- */
  .summarizer-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 15px 20px;
    background-color: #f7faff;
    border-top: 1px solid #e0e8f0;
    flex-shrink: 0;
    margin: 0;
  }

  /* --- Buttons (Base Style) --- */
  .summarizer-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 0.95em;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    text-align: center;
    white-space: nowrap;
    transition: background-color 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    vertical-align: middle;
    height: 36px;
    min-width: 40px;
  }
  .summarizer-btn:hover {
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }
  .summarizer-btn:active {
    transform: translateY(0px);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
  }
  .summarizer-btn:disabled {
    background-color: #bdbdbd !important;
    color: #757575 !important;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
    opacity: 0.7;
  }
  .summarizer-btn img {
    height: 1.2em;
    width: auto;
    display: block;
    max-width: 100%;
  }

  /* Specific Button Colors */
  .summarizer-btn.copy-btn { background-color: #1976D2; color: #ffffff; padding: 8px 20px; }
  .summarizer-btn.copy-btn:hover:not(:disabled) { background-color: #1565C0; }
  .summarizer-btn.chat-btn { background-color: #28a745; color: #ffffff; padding: 8px 20px; }
  .summarizer-btn.chat-btn:hover:not(:disabled) { background-color: #218838; }
  .summarizer-btn.close-btn { background-color: #e53935; color: #ffffff; padding: 8px 20px; }
  .summarizer-btn.close-btn:hover:not(:disabled) { background-color: #d32f2f; }
  .summarizer-btn.newsblur-btn { background-color: #8B4513; color: #ffffff; padding: 8px 20px; }
  .summarizer-btn.newsblur-btn:hover:not(:disabled) { background-color: #652a0d; }

  /* --- Responsive Adjustments --- */
  @media (max-width: 780px) {
    .summarizer-popup {
      width: 95vw;
      max-width: 95vw;
      min-width: 95vw;
      top: 2.5vh;
    }

    .summarizer-header-container,
    .summarizer-body,
    .summarizer-actions {
      padding-left: 15px;
      padding-right: 15px;
    }

    .summarizer-actions { gap: 8px; padding-top: 12px; padding-bottom: 12px; }
    .summarizer-btn { padding: 6px 12px; height: 34px; }
    .summarizer-btn.copy-btn, .summarizer-btn.chat-btn, .summarizer-btn.close-btn { padding: 6px 16px; }
  }
`;

// --- HTML Template String ---
const POPUP_TEMPLATE_HTML = `
<div class="summarizer-popup" style="display: none;">
    <div class="summarizer-header-container">
        <div class="summarizer-header">Summary</div>
    </div>
    <div class="summarizer-body"></div>
    <div class="summarizer-actions">
        <button class="summarizer-btn copy-btn">Cop[y]</button>
        <button class="summarizer-btn chat-btn">Cha[t]</button>
        <button class="summarizer-btn newsblur-btn">Newsblu[r]</button>
        <button class="summarizer-btn close-btn">Clos[e]</button>
    </div>
</div>
`;

// --- Constants ---
const POPUP_CLASS = "summarizer-popup";
const POPUP_HEADER_CONTAINER_CLASS = "summarizer-header-container";
const POPUP_HEADER_CLASS = "summarizer-header";
const POPUP_BODY_CLASS = "summarizer-body";
const POPUP_ACTIONS_CLASS = "summarizer-actions";
const POPUP_BTN_CLASS = "summarizer-btn";
const POPUP_COPY_BTN_CLASS = "copy-btn";
const POPUP_CHAT_BTN_CLASS = "chat-btn";
const POPUP_NEWSBLUR_BTN_CLASS = "newsblur-btn";
const POPUP_CLOSE_BTN_CLASS = "close-btn";

// --- Module State ---
let host = null; // The host element (fixed position)
let shadow = null; // The ShadowRoot
let currentContent = "";
let currentOriginalMarkdownArray = null;
let currentPageURL = null;
let currentPageTitle = null;
let isErrorState = false;
let currentModelName = null;
let popupCallbacks = {
  onCopy: null,
  onChat: null,
  onClose: null,
  onOptions: null,
  onNewsblur: null,
};
let copyTimeoutId = null;
let handlePopupKeydown = null;

// --- Helper Functions ---

function escapeHTML(str) {
  if (typeof str !== "string") return "";
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

async function handleRichTextCopyClick(contentDiv, copyBtn) {
  if (!copyBtn) return;
  if (copyTimeoutId) clearTimeout(copyTimeoutId);

  let htmlToCopy = "";
  let textToCopy = "";

  if (currentOriginalMarkdownArray && currentOriginalMarkdownArray.length > 0) {
    // Construct HTML list from original markdown items
    htmlToCopy = "<ul>";
    currentOriginalMarkdownArray.forEach((item) => {
      htmlToCopy += `<li>${marked.parseInline(item)}</li>`;
    });
    htmlToCopy += "</ul>";

    // Construct plain text list
    textToCopy = currentOriginalMarkdownArray
      .map((item) => `* ${item}`)
      .join("\n");

    if (currentPageURL) {
      const linkText = currentPageTitle ? escapeHTML(currentPageTitle) : escapeHTML(currentPageURL);
      htmlToCopy += `<br><p>Source: <a href="${escapeHTML(currentPageURL)}">${linkText}</a></p>`;
      textToCopy += `\n\nSource: ${currentPageURL}`;
      if (currentPageTitle) {
        textToCopy += ` (${currentPageTitle})`;
      }
    }
  } else if (contentDiv && contentDiv.innerHTML.trim() !== "") {
    // Use currentContent if it's HTML (safer than innerHTML for clipboard)
    if (typeof currentContent === "string" && currentContent.startsWith("<ul>")) {
      htmlToCopy = currentContent;
    } else {
      htmlToCopy = contentDiv.innerHTML;
    }
    const listItems = contentDiv.querySelectorAll("li");
    if (listItems.length > 0) {
      textToCopy = Array.from(listItems)
        .map((li) => {
          let itemText = li.innerHTML
            .replace(/<b>/gi, "**")
            .replace(/<\/b>/gi, "**")
            .replace(/<[^>]*>/g, "")
            .replace(/\u00A0/g, " ")
            .trim();
          return `* ${itemText}`;
        })
        .join("\n");
    } else {
      textToCopy = contentDiv.innerHTML
        .replace(/<b>/gi, "**")
        .replace(/<\/b>/gi, "**")
        .replace(/<[^>]*>/g, "")
        .replace(/\u00A0/g, " ")
        .trim() || "";
    }
    if (currentPageURL) {
      const linkText = currentPageTitle ? escapeHTML(currentPageTitle) : escapeHTML(currentPageURL);
      htmlToCopy += `<br><p>Source: <a href="${escapeHTML(currentPageURL)}">${linkText}</a></p>`;
      textToCopy += `\n\nSource: ${currentPageURL}`;
      if (currentPageTitle) {
        textToCopy += ` (${currentPageTitle})`;
      }
    }
  } else if (typeof currentContent === "string" && !currentContent.startsWith("<")) {
    htmlToCopy = `<p>${escapeHTML(currentContent.trim())}</p>`;
    textToCopy = currentContent.trim();
  }

  if (htmlToCopy && textToCopy) {
    try {
      const htmlBlob = new Blob([htmlToCopy], { type: "text/html" });
      const textBlob = new Blob([textToCopy], { type: "text/plain" });
      const clipboardItem = new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      });
      await navigator.clipboard.write([clipboardItem]);
      copyBtn.textContent = "Copied!";
    } catch (err) {
      console.error("[LLM Popup] Failed to copy rich text: ", err);
      try {
        await navigator.clipboard.writeText(textToCopy);
        copyBtn.textContent = "Copied (Text)!";
      } catch (textErr) {
        console.error("[LLM Popup] Failed to copy plain text as fallback: ", textErr);
        copyBtn.textContent = "Error";
      }
    }
  } else {
    copyBtn.textContent = "Empty";
  }

  copyTimeoutId = setTimeout(() => {
    copyBtn.textContent = "Copy";
    copyTimeoutId = null;
  }, 1500);
}

function getShadowElement(selector) {
  return shadow.querySelector(selector);
}

// --- Public Functions ---

export function showPopup(
  content,
  callbacks,
  originalMarkdownArray = null,
  pageURL = null,
  pageTitle = null,
  errorState = false,
  hasNewsblurToken = false
) {
  return new Promise((resolve) => {
    hidePopup();

    if (!callbacks || typeof callbacks.onCopy !== "function" || typeof callbacks.onChat !== "function" ||
        typeof callbacks.onClose !== "function" || typeof callbacks.onOptions !== "function" ||
        typeof callbacks.onNewsblur !== "function") {
      console.error("[LLM Popup] showPopup failed: Required callbacks missing.");
      resolve();
      return;
    }
    popupCallbacks = callbacks;
    currentContent = content;
    currentOriginalMarkdownArray = originalMarkdownArray;
    currentPageURL = pageURL;
    currentPageTitle = pageTitle;
    isErrorState = errorState;

    try {
      // Create Host
      host = document.createElement("div");
      host.id = "summarizer-popup-host";
      host.setAttribute("data-extension-ui", "true");
      host.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        z-index: 2147483647;
      `;

      // Attach Shadow DOM
      shadow = host.attachShadow({ mode: "open" });

      // Inject Styles and Template
      shadow.innerHTML = `<style>${POPUP_STYLES}</style>${POPUP_TEMPLATE_HTML.trim()}`;

      document.body.appendChild(host);
    } catch (e) {
      console.error("[LLM Popup] Error creating Shadow DOM:", e);
      host = null;
      shadow = null;
      resolve();
      return;
    }

    const contentDiv = getShadowElement(`.${POPUP_BODY_CLASS}`);
    const copyBtn = getShadowElement(`.${POPUP_COPY_BTN_CLASS}`);
    const chatBtn = getShadowElement(`.${POPUP_CHAT_BTN_CLASS}`);
    const newsblurBtn = getShadowElement(`.${POPUP_NEWSBLUR_BTN_CLASS}`);
    const closeBtn = getShadowElement(`.${POPUP_CLOSE_BTN_CLASS}`);
    const popupElement = getShadowElement(`.${POPUP_CLASS}`);

    if (contentDiv) {
      if (typeof content === "string") {
        if (content.startsWith("<ul>")) {
          // Sanitize HTML content to prevent XSS attacks from malicious LLM responses
          if (typeof DOMPurify !== "undefined") {
            contentDiv.innerHTML = DOMPurify.sanitize(content, {
              ALLOWED_TAGS: ['ul', 'li', 'b', 'strong', 'i', 'em', 'br', 'p'],
              ALLOWED_ATTR: []
            });
          } else {
            // Fallback: use textContent if DOMPurify not available (safer but loses formatting)
            contentDiv.textContent = content;
          }
        } else {
          contentDiv.textContent = content;
        }
      } else {
        contentDiv.textContent = "Error: Invalid content type.";
      }
    }

    if (copyBtn) {
      copyBtn.onclick = () => handleRichTextCopyClick(contentDiv, copyBtn);
      copyBtn.disabled = true;
    }

    if (chatBtn) {
      if (isErrorState) {
        chatBtn.textContent = "Options";
        chatBtn.title = "Open options to adjust settings";
        chatBtn.onclick = () => popupCallbacks.onOptions();
        chatBtn.disabled = false;
      } else {
        chatBtn.textContent = "Cha[t]";
        chatBtn.title = "Open chat with summary context";
        chatBtn.onclick = () => popupCallbacks.onChat(null);
        chatBtn.disabled = true;
      }
    }

    if (newsblurBtn) {
      newsblurBtn.onclick = () => popupCallbacks.onNewsblur(hasNewsblurToken);
      newsblurBtn.style.display = hasNewsblurToken ? "inline-block" : "none";
    }

    if (closeBtn) {
      closeBtn.onclick = () => popupCallbacks.onClose();
    }

    // Define and add the keydown listener for multiple hotkeys
    handlePopupKeydown = (event) => {
      const key = event.key.toLowerCase();
      const isHotkeyPressed = ['e', 'y', 't', 'r', 'escape'].includes(key);

      if (isHotkeyPressed) {
        event.preventDefault();
        event.stopPropagation();

        switch (key) {
          case "e":
          case "escape":
            if (popupCallbacks.onClose) popupCallbacks.onClose();
            break;
          case "y":
          {
            const cBtn = getShadowElement(`.${POPUP_COPY_BTN_CLASS}`);
            if (cBtn) cBtn.click();
          }
          break;
          case "t":
          {
            const chBtn = getShadowElement(`.${POPUP_CHAT_BTN_CLASS}`);
            if (chBtn && !chBtn.disabled) chBtn.click();
          }
          break;
          case "r":
          {
            const nBtn = getShadowElement(`.${POPUP_NEWSBLUR_BTN_CLASS}`);
            if (nBtn && nBtn.style.display !== "none") nBtn.click();
          }
          break;
        }
      }
    };
    document.addEventListener("keydown", handlePopupKeydown, true);

    if (popupElement) {
      popupElement.style.display = "flex";
      requestAnimationFrame(() => {
        if (popupElement) {
          popupElement.classList.add("visible");
          resolve();
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

export function hidePopup() {
  if (host) {
    if (handlePopupKeydown) {
      document.removeEventListener("keydown", handlePopupKeydown, true);
      handlePopupKeydown = null;
    }

    const popupElement = getShadowElement(`.${POPUP_CLASS}`);
    if (popupElement) {
      popupElement.classList.remove("visible");
      const computedStyle = window.getComputedStyle(popupElement);
      const transitionDuration = parseFloat(computedStyle.transitionDuration) * 1000;
      setTimeout(() => {
        if (host && host.parentNode) {
          host.parentNode.removeChild(host);
        }
        host = null;
        shadow = null;
      }, transitionDuration > 0 ? transitionDuration + 50 : 10);
    } else {
      if (host.parentNode) {
        host.parentNode.removeChild(host);
      }
      host = null;
      shadow = null;
    }

    // Reset callbacks and state
    popupCallbacks = {
      onCopy: null,
      onChat: null,
      onClose: null,
      onOptions: null,
      onNewsblur: null,
    };
    currentContent = "";
    currentOriginalMarkdownArray = null;
    currentPageURL = null;
    currentPageTitle = null;
    currentModelName = null;
    if (copyTimeoutId) clearTimeout(copyTimeoutId);
    copyTimeoutId = null;
    isErrorState = false;
  }
}

export function updatePopupContent(
  newContent,
  originalMarkdownArray = null,
  pageURL = null,
  pageTitle = null,
  errorState = false,
  hasNewsblurToken = false,
  modelName = null
) {
  if (!host || !shadow) return;

  currentContent = newContent;
  currentOriginalMarkdownArray = originalMarkdownArray;
  currentPageURL = pageURL;
  currentPageTitle = pageTitle;
  isErrorState = errorState;
  currentModelName = modelName;

  const contentDiv = getShadowElement(`.${POPUP_BODY_CLASS}`);
  const headerDiv = getShadowElement(`.${POPUP_HEADER_CLASS}`);

  // Update header with model name if provided
  if (headerDiv) {
    if (modelName && !errorState) {
      headerDiv.textContent = `Summary (${modelName})`;
    } else {
      headerDiv.textContent = "Summary";
    }
  }
  const chatBtn = getShadowElement(`.${POPUP_CHAT_BTN_CLASS}`);
  const newsblurBtn = getShadowElement(`.${POPUP_NEWSBLUR_BTN_CLASS}`);

  if (contentDiv) {
    if (typeof newContent === "string") {
      if (newContent.startsWith("<ul>")) {
        // Sanitize HTML content to prevent XSS attacks from malicious LLM responses
        if (typeof DOMPurify !== "undefined") {
          contentDiv.innerHTML = DOMPurify.sanitize(newContent, {
            ALLOWED_TAGS: ['ul', 'li', 'b', 'strong', 'i', 'em', 'br', 'p'],
            ALLOWED_ATTR: []
          });
        } else {
          // Fallback: use textContent if DOMPurify not available (safer but loses formatting)
          contentDiv.textContent = newContent;
        }
      } else {
        contentDiv.textContent = newContent;
      }
    }
  }

  if (chatBtn) {
    if (isErrorState) {
      chatBtn.textContent = "Options";
      chatBtn.title = "Open options to adjust settings";
      chatBtn.onclick = () => popupCallbacks.onOptions();
      chatBtn.disabled = false;
    } else {
      chatBtn.textContent = "Cha[t]";
      chatBtn.title = "Open chat with summary context";
      chatBtn.onclick = () => popupCallbacks.onChat(null);
      chatBtn.disabled = false;
    }
  }

  if (newsblurBtn) {
    newsblurBtn.onclick = () => popupCallbacks.onNewsblur(hasNewsblurToken);
    newsblurBtn.style.display = hasNewsblurToken ? "inline-block" : "none";
  }
}

export function enableButtons(enable) {
  if (!host || !shadow) return;
  const chatBtn = getShadowElement(`.${POPUP_CHAT_BTN_CLASS}`);
  const copyBtn = getShadowElement(`.${POPUP_COPY_BTN_CLASS}`);

  if (chatBtn) {
    if (isErrorState && chatBtn.textContent === "Options") {
      // Keep state
    } else {
      chatBtn.disabled = !enable;
    }
  }

  if (copyBtn) {
    copyBtn.disabled = !enable;
  }
}

export function initializePopupManager(options) {
  // DEBUG is handled via options if needed in future
}
