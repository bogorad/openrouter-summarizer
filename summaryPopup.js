// summaryPopup.js
/**
 * summaryPopup.js
 * Short Spec: Manages the summary popup UI with Shadow DOM encapsulation.
 * Provides functions to show, hide, and update the popup content.
 * Dependencies: marked (optional for inline parsing).
 */

import { createButton, setButtonDisabled } from "./js/ui/buttons.js";
import { createElement } from "./js/ui/dom.js";
import { sanitizeHtml } from "./js/htmlSanitizer.js";
import { createPopup } from "./js/ui/popup.js";
import { renderTarget, RENDER_TARGET_MODES } from "./js/ui/renderTarget.js";

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
let popupController = null;
let currentContent = "";
let currentOriginalMarkdownArray = null;
let currentPageURL = null;
let currentPageTitle = null;
let isErrorState = false;
let currentHasNewsblurToken = false;
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
let buttonCleanups = [];

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
      htmlToCopy = sanitizeHtml(htmlToCopy);
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

function getActionButtons() {
  return {
    chatBtn: getShadowElement(`.${POPUP_CHAT_BTN_CLASS}`),
    closeBtn: getShadowElement(`.${POPUP_CLOSE_BTN_CLASS}`),
    copyBtn: getShadowElement(`.${POPUP_COPY_BTN_CLASS}`),
    newsblurBtn: getShadowElement(`.${POPUP_NEWSBLUR_BTN_CLASS}`),
  };
}

function createPopupButton({ label, title, className, disabled = false, onClick }) {
  const button = createButton({
    label,
    title,
    className: POPUP_BTN_CLASS,
    classes: [className],
    disabled,
    onClick,
  });

  buttonCleanups.push(button.cleanup);
  return button.element;
}

function renderSummaryContent(contentDiv, content) {
  if (!contentDiv) return;

  if (typeof content !== "string") {
    renderTarget(contentDiv, {
      mode: RENDER_TARGET_MODES.TEXT,
      content: "Error: Invalid content type.",
    });
    return;
  }

  const trimmed = content.trimStart();
  const isHtmlList = /^<(ul|ol)\b/i.test(trimmed);
  renderTarget(contentDiv, {
    mode: isHtmlList ? RENDER_TARGET_MODES.HTML : RENDER_TARGET_MODES.TEXT,
    content: isHtmlList ? trimmed : content,
  });
}

function createPopupActions(contentDiv) {
  const copyBtn = createPopupButton({
    label: "Cop[y]",
    title: "Copy summary",
    className: POPUP_COPY_BTN_CLASS,
    disabled: true,
    onClick: () => handleRichTextCopyClick(contentDiv, copyBtn),
  });

  const chatBtn = createPopupButton({
    label: isErrorState ? "Options" : "Cha[t]",
    title: isErrorState ? "Open options to adjust settings" : "Open chat with summary context",
    className: POPUP_CHAT_BTN_CLASS,
    disabled: !isErrorState,
    onClick: () => {
      if (isErrorState) {
        popupCallbacks.onOptions();
        return;
      }

      popupCallbacks.onChat(null);
    },
  });

  const newsblurBtn = createPopupButton({
    label: "Newsblu[r]",
    title: "Share summary to NewsBlur",
    className: POPUP_NEWSBLUR_BTN_CLASS,
    onClick: () => popupCallbacks.onNewsblur(currentHasNewsblurToken),
  });
  newsblurBtn.style.display = currentHasNewsblurToken ? "inline-block" : "none";

  const closeBtn = createPopupButton({
    label: "Clos[e]",
    title: "Close summary popup",
    className: POPUP_CLOSE_BTN_CLASS,
    onClick: () => popupCallbacks.onClose(),
  });

  return [
    copyBtn,
    chatBtn,
    newsblurBtn,
    closeBtn,
  ];
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
    currentHasNewsblurToken = hasNewsblurToken;

    try {
      popupController = createPopup({
        id: "summarizer-popup-host",
        useShadowRoot: true,
        styles: POPUP_STYLES,
        title: "Summary",
        includeCloseButton: false,
        closeOnEscape: false,
        closeOnOutsideClick: false,
        trapFocus: false,
        restoreFocus: false,
        autoFocus: false,
        surfaceClassName: POPUP_CLASS,
        headerClassName: POPUP_HEADER_CONTAINER_CLASS,
        titleClassName: POPUP_HEADER_CLASS,
        bodyClassName: POPUP_BODY_CLASS,
        actionsClassName: POPUP_ACTIONS_CLASS,
        hostAttrs: {
          style: `
            position: fixed;
            top: 0;
            left: 0;
            width: 0;
            height: 0;
            z-index: 2147483647;
          `,
        },
        body: () => createElement("span"),
        actions: ({ body }) => createPopupActions(body),
      });

      host = popupController.host;
      shadow = popupController.root;
    } catch (e) {
      console.error("[LLM Popup] Error creating Shadow DOM:", e);
      host = null;
      shadow = null;
      popupController = null;
      resolve();
      return;
    }

    const contentDiv = getShadowElement(`.${POPUP_BODY_CLASS}`);
    const popupElement = getShadowElement(`.${POPUP_CLASS}`);

    renderSummaryContent(contentDiv, content);

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
          {
            const closeBtn = getShadowElement(`.${POPUP_CLOSE_BTN_CLASS}`);
            if (closeBtn && !closeBtn.disabled && popupCallbacks.onClose) popupCallbacks.onClose();
          }
            break;
          case "y":
          {
            const cBtn = getShadowElement(`.${POPUP_COPY_BTN_CLASS}`);
            if (cBtn && !cBtn.disabled) cBtn.click();
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
            if (nBtn && nBtn.style.display !== "none" && !nBtn.disabled) nBtn.click();
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
    const hostToCleanup = host;
    const popupControllerToCleanup = popupController;
    const buttonCleanupsToRun = buttonCleanups;
    buttonCleanups = [];

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
        buttonCleanupsToRun.forEach((buttonCleanup) => buttonCleanup());
        if (popupControllerToCleanup) popupControllerToCleanup.cleanup();
        if (host === hostToCleanup) {
          host = null;
          shadow = null;
          popupController = null;
        }
      }, transitionDuration > 0 ? transitionDuration + 50 : 10);
    } else {
      buttonCleanupsToRun.forEach((buttonCleanup) => buttonCleanup());
      if (popupControllerToCleanup) popupControllerToCleanup.cleanup();
      if (host === hostToCleanup) {
        host = null;
        shadow = null;
        popupController = null;
      }
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
    currentHasNewsblurToken = false;
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
  currentHasNewsblurToken = hasNewsblurToken;
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

  renderSummaryContent(contentDiv, newContent);

  if (chatBtn) {
    if (isErrorState) {
      chatBtn.textContent = "Options";
      chatBtn.title = "Open options to adjust settings";
      setButtonDisabled(chatBtn, false);
    } else {
      chatBtn.textContent = "Cha[t]";
      chatBtn.title = "Open chat with summary context";
      setButtonDisabled(chatBtn, false);
    }
  }

  if (newsblurBtn) {
    newsblurBtn.style.display = hasNewsblurToken ? "inline-block" : "none";
  }
}

export function enableButtons(enable) {
  if (!host || !shadow) return;
  const {
    chatBtn,
    closeBtn,
    copyBtn,
    newsblurBtn,
  } = getActionButtons();

  if (chatBtn) {
    if (isErrorState && chatBtn.textContent === "Options") {
      // Keep state
    } else {
      setButtonDisabled(chatBtn, !enable);
    }
  }

  if (copyBtn) {
    setButtonDisabled(copyBtn, !enable);
  }

  if (newsblurBtn) {
    setButtonDisabled(newsblurBtn, !enable);
  }

  if (closeBtn) {
    setButtonDisabled(closeBtn, !enable);
  }
}

export function setActionsDisabled(disabled) {
  enableButtons(!disabled);
}

export function setAllActionsDisabled(disabled) {
  setActionsDisabled(disabled);
}

export function setActionButtonsDisabled(disabled) {
  setActionsDisabled(disabled);
}

export function initializePopupManager(options) {
  // DEBUG is handled via options if needed in future
}

export function cleanup() {
  hidePopup();
}
