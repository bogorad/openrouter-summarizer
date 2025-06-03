// @description Manages the summary popup UI for the OpenRouter Summarizer extension, including rich text copying.
import { marked } from "marked"; // Import marked library
console.log(`[LLM Popup] Script Loaded (v3.0.17)`); // Updated version

// --- Constants ---
const POPUP_CLASS = "summarizer-popup";
const POPUP_HEADER_CONTAINER_CLASS = "summarizer-header-container";
const POPUP_HEADER_CLASS = "summarizer-header";
const POPUP_BODY_CLASS = "summarizer-body";
const POPUP_ACTIONS_CLASS = "summarizer-actions";
const POPUP_BTN_CLASS = "summarizer-btn";
const POPUP_COPY_BTN_CLASS = "copy-btn"; // This class will be used for the new single Copy button
const POPUP_CHAT_BTN_CLASS = "chat-btn"; // Class for the dynamic chat/options button
const POPUP_NEWSBLUR_BTN_CLASS = "newsblur-btn"; // New: Class for NewsBlur button
const POPUP_CLOSE_BTN_CLASS = "close-btn";
// const NEWSBLUR_SYMBOL_CLASS = "newsblur-symbol"; // REMOVED: Class for the NewsBlur symbol

// --- HTML Template String ---
// Updated template for a single "Copy" button
const POPUP_TEMPLATE_HTML = `
<div class="${POPUP_CLASS}" style="display: none;">
    <div class="${POPUP_HEADER_CONTAINER_CLASS}">
        <div class="${POPUP_HEADER_CLASS}">Summary</div>
    </div>
    <div class="${POPUP_BODY_CLASS}"></div>
    <div class="${POPUP_ACTIONS_CLASS}">
        <button class="${POPUP_BTN_CLASS} ${POPUP_COPY_BTN_CLASS}">Copy</button>
        <!-- Single Chat Button -->
        <button class="${POPUP_BTN_CLASS} ${POPUP_CHAT_BTN_CLASS}">Chat</button>
        <!-- New: NewsBlur Button -->
        <button class="${POPUP_BTN_CLASS} ${POPUP_NEWSBLUR_BTN_CLASS}">↔ NewsBlur</button>
        <!-- End NewsBlur Button -->
        <!-- End Single Chat Button -->
        <button class="${POPUP_BTN_CLASS} ${POPUP_CLOSE_BTN_CLASS}">Close</button>
    </div>
</div>
`;

// --- Module State ---
let popup = null;
let currentContent = ""; // Stores the HTML/text content being displayed
let popupCallbacks = {
  onCopy: null,
  onChat: null,
  onClose: null,
  onOptions: null,
  onNewsblur: null,
}; // Initialize new callback
let copyTimeoutId = null;
let DEBUG = false;

let currentOriginalMarkdownArray = null; // To store the array of original Markdown strings
let currentPageURL = null; // To store the page URL
let currentPageTitle = null; // To store the page title
let isErrorState = false; // To track if the popup is in an error state

// Helper function to escape HTML special characters
function escapeHTML(str) {
  if (typeof str !== "string") return "";
  // A robust way to escape HTML: create a text node and get its HTML representation.
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// Handles rich text copy logic
async function handleRichTextCopyClick(contentDiv, copyBtn) {
  if (!copyBtn) return;
  if (copyTimeoutId) clearTimeout(copyTimeoutId);

  let htmlToCopy = "";
  let textToCopy = "";

  if (currentOriginalMarkdownArray && currentOriginalMarkdownArray.length > 0) {
    // Construct HTML list from original markdown items
    htmlToCopy = "<ul>"; // Use literal tags
    currentOriginalMarkdownArray.forEach((item) => {
      // Convert Markdown item to HTML using marked, then add to list
      // Use parseInline to avoid wrapping in <p> tags if item is simple
      htmlToCopy += `<li>${marked.parseInline(item)}</li>`;
    });
    htmlToCopy += "</ul>"; // Use literal tags

    // Construct plain text list
    textToCopy = currentOriginalMarkdownArray
      .map((item) => `* ${item}`)
      .join("\n");

    if (currentPageURL) {
      // MODIFIED: Use currentPageTitle if available, otherwise fallback to currentPageURL for the link text
      const linkText = currentPageTitle
        ? escapeHTML(currentPageTitle)
        : escapeHTML(currentPageURL);
      htmlToCopy += `<br><p>Source: <a href="${escapeHTML(currentPageURL)}">${linkText}</a></p>`; // Use literal tags, escape URL content
      textToCopy += `\n\nSource: ${currentPageURL}`;
      if (currentPageTitle) {
        // ADDED
        textToCopy += ` (${currentPageTitle})`; // ADDED
      }
    }
    if (DEBUG)
      console.log(
        "[LLM Popup] Preparing rich text and plain text from original markdown array.",
      );
  } else if (contentDiv && contentDiv.innerHTML.trim() !== "") {
    // Fallback: Use the innerHTML of the contentDiv for rich text
    // and textContent for plain text
    htmlToCopy = contentDiv.innerHTML;
    textToCopy = contentDiv.textContent.replace(/\u00A0/g, " ").trim() || "";

    const listItems = contentDiv.querySelectorAll("li");
    if (listItems.length > 0 && !textToCopy.includes("\n")) {
      textToCopy = Array.from(listItems)
        .map((li) => `* ${li.textContent.replace(/\u00A0/g, " ").trim()}`)
        .join("\n");
    }

    if (DEBUG)
      console.log(
        "[LLM Popup] Fallback: Preparing rich/plain text from visible popup content.",
      );
  } else if (
    typeof currentContent === "string" &&
    !currentContent.startsWith("<")
  ) {
    // Fallback for simple text like "Thinking..."
    htmlToCopy = `<p>${escapeHTML(currentContent.trim())}</p>`; // Use literal tags
    textToCopy = currentContent.trim();
    if (DEBUG)
      console.log(
        "[LLM Popup] Fallback: Preparing rich/plain text from currentContent string.",
      );
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
      if (DEBUG) console.log("[LLM Popup] Rich text copied successfully.");
    } catch (err) {
      console.error("[LLM Popup] Failed to copy rich text: ", err);
      try {
        await navigator.clipboard.writeText(textToCopy);
        copyBtn.textContent = "Copied (Text)!";
        if (DEBUG)
          console.log(
            "[LLM Popup] Rich text failed, plain text copied as fallback.",
          );
      } catch (textErr) {
        console.error(
          "[LLM Popup] Failed to copy plain text as fallback: ",
          textErr,
        );
        copyBtn.textContent = "Error";
      }
    }
  } else {
    if (DEBUG) console.warn("[LLM Popup] Nothing to copy (HTML or Text).");
    copyBtn.textContent = "Empty";
  }

  copyTimeoutId = setTimeout(() => {
    copyBtn.textContent = "Copy"; // Button text is now "Copy"
    copyTimeoutId = null;
  }, 1500);
}

// --- Public Functions ---

/**
 * Creates and shows the summary popup using an HTML template.
 * Returns a Promise that resolves when the popup is visible and ready.
 * @param {string} content - The initial HTML or text content to display.
 * @param {object} callbacks - Object containing onCopy, onChat, onClose, and onOptions callbacks.
 * @param {string[] | null} [originalMarkdownArray=null] - Optional array of original Markdown strings.
 * @param {string | null} [pageURL=null] - Optional page URL.
 * @param {boolean} [errorState=false] - Indicates if the popup is in an error state.
 * @returns {Promise<void>} A Promise that resolves when the popup is ready.
 */
export function showPopup(
  content,
  callbacks,
  originalMarkdownArray = null,
  pageURL = null,
  pageTitle = null, // MODIFIED: Added pageTitle parameter
  errorState = false,
  hasNewsblurToken = false, // New: Add hasNewsblurToken parameter
) {
  return new Promise((resolve) => {
    hidePopup(); // Clears previous state

    if (
      !callbacks ||
      typeof callbacks.onCopy !== "function" || // onCopy is still expected by the caller, though not used by the button directly
      typeof callbacks.onChat !== "function" ||
      typeof callbacks.onClose !== "function" ||
      typeof callbacks.onOptions !== "function" ||
      typeof callbacks.onNewsblur !== "function" // New: Check for onNewsblur callback
    ) {
      console.error(
        "[LLM Popup] showPopup failed: Required callbacks missing.",
      );
      resolve();
      return;
    }
    popupCallbacks = callbacks;
    currentContent = content;
    currentOriginalMarkdownArray = originalMarkdownArray;
    currentPageURL = pageURL;
    currentPageTitle = pageTitle; // ADDED: Store pageTitle
    isErrorState = errorState;

    try {
      const template = document.createElement("template");
      template.innerHTML = POPUP_TEMPLATE_HTML.trim();
      popup = template.content.firstChild.cloneNode(true);
    } catch (e) {
      console.error("[LLM Popup] Error parsing or cloning popup template:", e);
      popup = null;
      resolve();
      return;
    }

    const contentDiv = popup.querySelector(`.${POPUP_BODY_CLASS}`);
    const copyBtn = popup.querySelector(`.${POPUP_COPY_BTN_CLASS}`);
    const chatBtn = popup.querySelector(`.${POPUP_CHAT_BTN_CLASS}`);
    const newsblurBtn = popup.querySelector(`.${POPUP_NEWSBLUR_BTN_CLASS}`); // New: NewsBlur button element
    const closeBtn = popup.querySelector(`.${POPUP_CLOSE_BTN_CLASS}`);

    if (contentDiv) {
      if (typeof content === "string") {
        if (content.startsWith("<ul>")) {
          // Check for HTML list
          contentDiv.innerHTML = content;
        } else {
          contentDiv.textContent = content;
        }
      } else {
        contentDiv.textContent = "Error: Invalid content type.";
        console.error(
          "[LLM Popup] Invalid content type passed to showPopup:",
          content,
        );
      }
    } else {
      console.error(
        "[LLM Popup] Cannot set initial content: Popup body div not found.",
      );
    }

    if (copyBtn) {
      // Attach the new rich text copy handler
      copyBtn.onclick = () => handleRichTextCopyClick(contentDiv, copyBtn);
    } else {
      console.error(
        "[LLM Popup] Could not attach copy listener: Button missing.",
      );
    }

    if (chatBtn) {
      if (isErrorState) {
        chatBtn.textContent = "Options";
        chatBtn.title = "Open options to adjust settings";
        chatBtn.onclick = () => popupCallbacks.onOptions();
        chatBtn.disabled = false;
        if (DEBUG)
          console.log(
            "[LLM Popup] Button set to 'Options' due to error state.",
          );
      } else {
        chatBtn.textContent = "Chat";
        chatBtn.title = "Open chat with summary context";
        chatBtn.onclick = () => popupCallbacks.onChat(null);
        chatBtn.disabled = true; // Keep disabled until content is ready
        if (DEBUG)
          console.log("[LLM Popup] Button set to 'Chat' for normal state.");
      }
    } else {
      console.error(
        "[LLM Popup] Could not attach chat/options listener: Button missing.",
      );
    }

    if (newsblurBtn) {
      // New: Attach listener for NewsBlur button
      newsblurBtn.onclick = () => popupCallbacks.onNewsblur(hasNewsblurToken); // Pass hasNewsblurToken to callback
      newsblurBtn.style.display = hasNewsblurToken ? "inline-block" : "none"; // Control visibility
    } else {
      console.error(
        "[LLM Popup] Could not attach NewsBlur listener: Button missing.",
      );
    }

    if (closeBtn) {
      closeBtn.onclick = () => popupCallbacks.onClose();
    } else {
      console.error(
        "[LLM Popup] Could not attach close listener: Button missing.",
      );
    }

    document.body.appendChild(popup);
    if (DEBUG) console.log("[LLM Popup] Popup added to page from template.");

    popup.style.display = "flex";
    requestAnimationFrame(() => {
      if (popup) {
        popup.classList.add("visible");
        if (DEBUG)
          console.log("[LLM Popup] Popup visibility transition started.");
        resolve();
      } else {
        resolve(); // Should not happen if parsing was successful
      }
    });
  });
}

/**
 * Hides and removes the summary popup from the DOM.
 */
export function hidePopup() {
  if (popup) {
    const popupElement = popup;
    popup = null;
    // Reset callbacks and state
    popupCallbacks = {
      onCopy: null,
      onChat: null,
      onClose: null,
      onOptions: null,
      onNewsblur: null,
    }; // Reset new callback
    currentContent = "";
    currentOriginalMarkdownArray = null;
    currentPageURL = null;
    currentPageTitle = null; // ADDED: Reset pageTitle
    if (copyTimeoutId) clearTimeout(copyTimeoutId);
    copyTimeoutId = null;
    isErrorState = false;

    popupElement.classList.remove("visible");
    const computedStyle = window.getComputedStyle(popupElement);
    const transitionDuration =
      parseFloat(computedStyle.transitionDuration) * 1000;
    setTimeout(
      () => {
        if (popupElement?.parentNode) {
          popupElement.parentNode.removeChild(popupElement);
          if (DEBUG) console.log("[LLM Popup] Popup hidden and removed.");
        }
      },
      transitionDuration > 0 ? transitionDuration + 50 : 10,
    );
  }
}

/**
 * Updates the content of the existing popup body.
 * @param {string} newContent - The new HTML or text content to display.
 * @param {string[] | null} [originalMarkdownArray=null] - Optional array of original Markdown strings.
 * @param {string | null} [pageURL=null] - Optional page URL.
 * @param {boolean} [errorState=false] - Indicates if the popup is in an error state.
 * @param {boolean} [hasNewsblurToken=false] - New: Indicates if a NewsBlur token is available.
 */
export function updatePopupContent(
  newContent,
  originalMarkdownArray = null,
  pageURL = null,
  pageTitle = null, // MODIFIED: Added pageTitle parameter
  errorState = false,
  hasNewsblurToken = false, // New: Add hasNewsblurToken parameter
) {
  if (!popup) {
    if (DEBUG)
      console.warn(
        "[LLM Popup] updatePopupContent called but popup doesn't exist.",
      );
    return;
  }
  currentContent = newContent;
  currentOriginalMarkdownArray = originalMarkdownArray; // Store for copy
  currentPageURL = pageURL; // Store for copy
  currentPageTitle = pageTitle; // ADDED: Store pageTitle
  isErrorState = errorState;

  const contentDiv = popup.querySelector(`.${POPUP_BODY_CLASS}`);
  const chatBtn = popup.querySelector(`.${POPUP_CHAT_BTN_CLASS}`);
  const newsblurBtn = popup.querySelector(`.${POPUP_NEWSBLUR_BTN_CLASS}`); // New: NewsBlur button element

  if (contentDiv) {
    if (typeof newContent === "string") {
      if (newContent.startsWith("<ul>")) {
        // Check for HTML list
        contentDiv.innerHTML = newContent;
      } else {
        contentDiv.textContent = newContent;
      }
      if (DEBUG) console.log("[LLM Popup] Popup content updated.");
    } else {
      contentDiv.textContent = "Error: Invalid content type.";
      console.error(
        "[LLM Popup] Invalid content type passed to updatePopupContent:",
        newContent,
      );
    }
  } else {
    console.error(
      "[LLM Popup] Cannot update content: Popup body div not found.",
    );
  }

  if (chatBtn) {
    if (isErrorState) {
      chatBtn.textContent = "Options";
      chatBtn.title = "Open options to adjust settings";
      chatBtn.onclick = () => popupCallbacks.onOptions();
      chatBtn.disabled = false;
      if (DEBUG)
        console.log(
          "[LLM Popup] Button updated to 'Options' due to error state in updatePopupContent.",
        );
    } else {
      chatBtn.textContent = "Chat";
      chatBtn.title = "Open chat with summary context";
      chatBtn.onclick = () => popupCallbacks.onChat(null);
      // Chat button should be enabled/disabled by enableChatButton based on summary generation status
      // chatBtn.disabled = true; // Re-evaluate: keep existing logic from enableChatButton
      if (DEBUG)
        console.log(
          "[LLM Popup] Button updated to 'Chat' for normal state in updatePopupContent.",
        );
    }
  }
  if (newsblurBtn) {
    // New: Control NewsBlur button visibility and pass token status
    newsblurBtn.onclick = () => popupCallbacks.onNewsblur(hasNewsblurToken); // Ensure callback always gets token status
    newsblurBtn.style.display = hasNewsblurToken ? "inline-block" : "none";
  }
}

/**
 * Enables or disables the Chat button in the popup.
 */
export function enableChatButton(enable) {
  if (!popup) return;
  const chatBtn = popup.querySelector(`.${POPUP_CHAT_BTN_CLASS}`);

  if (chatBtn) {
    // Only enable if not in an error state where it should show "Options"
    if (isErrorState && chatBtn.textContent === "Options") {
      // Don't change disabled state if it's an "Options" button
    } else {
      chatBtn.disabled = !enable;
    }
  }

  if (DEBUG)
    console.log(
      `[LLM Popup] Chat button ${enable ? "enabled" : "disabled (or kept as Options)"}.`,
    );
}

/**
 * Initializes the popup manager module.
 */
export function initializePopupManager(options) {
  DEBUG = !!options?.initialDebugState;
  if (DEBUG) console.log("[LLM Popup] Initialized.");
}
