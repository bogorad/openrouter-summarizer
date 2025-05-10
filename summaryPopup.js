console.log(`[LLM Popup] Script Loaded (v3.0.15)`); // Updated version

// --- Constants ---
const POPUP_CLASS = "summarizer-popup";
const POPUP_HEADER_CONTAINER_CLASS = "summarizer-header-container";
const POPUP_HEADER_CLASS = "summarizer-header";
const POPUP_BODY_CLASS = "summarizer-body";
const POPUP_ACTIONS_CLASS = "summarizer-actions";
const POPUP_BTN_CLASS = "summarizer-btn";
const POPUP_COPY_BTN_CLASS = "copy-btn";
const POPUP_CHAT_BTN_CLASS = "chat-btn"; // Class for the dynamic chat/options button
const POPUP_CLOSE_BTN_CLASS = "close-btn";

// --- HTML Template String ---
// Simplified chat button structure
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
        <!-- End Single Chat Button -->

        <button class="${POPUP_BTN_CLASS} ${POPUP_CLOSE_BTN_CLASS}">Close</button>
    </div>
</div>
`;

// --- Module State ---
let popup = null;
let currentContent = ""; // Stores the HTML/text content being displayed
let popupCallbacks = { onCopy: null, onChat: null, onClose: null, onOptions: null };
let copyTimeoutId = null;
let DEBUG = false;

let currentOriginalMarkdownArray = null; // To store the array of original Markdown strings
let currentPageURL = null; // To store the page URL
let isErrorState = false; // To track if the popup is in an error state

// Handles copy logic
function handleCopyClick(contentDiv, copyBtn) {
  if (!copyBtn) return;
  if (copyTimeoutId) clearTimeout(copyTimeoutId);

  let textToCopy = "";

  if (
    currentOriginalMarkdownArray &&
    currentOriginalMarkdownArray.length > 0 &&
    currentPageURL
  ) {
    // New logic: Copy original Markdown items as a list, then the URL
    let markdownToCopy = "";
    currentOriginalMarkdownArray.forEach((item) => {
      markdownToCopy += `* ${item}\n`; // Prepend Markdown list item indicator
    });
    markdownToCopy += `\n\n${currentPageURL}`; // Add two newlines before URL for a new paragraph
    textToCopy = markdownToCopy;
    if (DEBUG)
      console.log("[LLM Popup] Copying constructed Markdown:", textToCopy);
  } else {
    // Fallback logic: Copy plain text of what's visible in the popup
    if (DEBUG)
      console.log(
        "[LLM Popup] Fallback: Copying visible plain text from popup.",
      );
    if (contentDiv) {
      const listItems = contentDiv.querySelectorAll("li");
      if (listItems.length > 0) {
        textToCopy = Array.from(listItems)
          .map((li) => {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = li.innerHTML;
            return tempDiv.textContent.replace(/\u00A0/g, " ").trim();
          })
          .filter((text) => text !== "")
          .map((text, idx) => `${idx + 1}. ${text}`)
          .join("\n");
      } else {
        textToCopy =
          contentDiv.textContent.replace(/\u00A0/g, " ").trim() || "";
      }
    } else if (
      typeof currentContent === "string" &&
      !currentContent.startsWith("<")
    ) {
      // If contentDiv isn't available but currentContent is simple text (e.g. "Thinking...")
      textToCopy = currentContent.trim();
    }
  }

  if (textToCopy) {
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        copyBtn.textContent = "Copied!";
        copyTimeoutId = setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyTimeoutId = null;
        }, 1500);
      })
      .catch((err) => {
        console.error("[LLM Popup] Failed to copy text: ", err);
        copyBtn.textContent = "Error";
        copyTimeoutId = setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyTimeoutId = null;
        }, 1500);
      });
  } else {
    if (DEBUG) console.warn("[LLM Popup] Nothing to copy.");
    copyBtn.textContent = "Empty";
    copyTimeoutId = setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyTimeoutId = null;
    }, 1500);
  }
}

// --- Public Functions ---

/**
 * Creates and shows the summary popup using an HTML template.
 * Returns a Promise that resolves when the popup is visible and ready.
 * @param {string} content - The initial HTML or text content to display.
 * @param {object} callbacks - Object containing onCopy, onChat, onClose, and onOptions callbacks.
 * @param {string[] | null} [originalMarkdownArray=null] - Optional array of original Markdown strings.
 * @param {string | null} [pageURL=null] - Optional page URL.
 * @param {boolean} [errorState=false] - Indicates if the popup is in an error state (e.g., max price exceeded or config issues).
 * @returns {Promise<void>} A Promise that resolves when the popup is ready.
 */
export function showPopup(
  content,
  callbacks,
  originalMarkdownArray = null,
  pageURL = null,
  errorState = false,
) {
  return new Promise((resolve) => {
    hidePopup(); // Clears previous state including markdown array and URL

    if (
      !callbacks ||
      typeof callbacks.onCopy !== "function" ||
      typeof callbacks.onChat !== "function" ||
      typeof callbacks.onClose !== "function" ||
      typeof callbacks.onOptions !== "function"
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
    const closeBtn = popup.querySelector(`.${POPUP_CLOSE_BTN_CLASS}`);

    if (contentDiv) {
      if (typeof content === "string") {
        if (content.startsWith("<ul>")) {
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
      // Pass contentDiv for fallback logic
      copyBtn.onclick = () => handleCopyClick(contentDiv, copyBtn);
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
      } else {
        chatBtn.textContent = "Chat";
        chatBtn.title = "Open chat with summary context";
        chatBtn.onclick = () => popupCallbacks.onChat(null);
        chatBtn.disabled = true;
      }
    } else {
      console.error(
        "[LLM Popup] Could not attach chat/options listener: Button missing.",
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
        resolve();
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
    popupCallbacks = { onCopy: null, onChat: null, onClose: null };
    currentContent = "";
    currentOriginalMarkdownArray = null; // Reset stored markdown
    currentPageURL = null; // Reset stored URL
    if (copyTimeoutId) clearTimeout(copyTimeoutId);
    copyTimeoutId = null;
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
 * @param {boolean} [errorState=false] - Indicates if the popup is in an error state (e.g., max price exceeded or config issues).
 */
export function updatePopupContent(
  newContent,
  originalMarkdownArray = null,
  pageURL = null,
  errorState = false,
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
  isErrorState = errorState;

  const contentDiv = popup.querySelector(`.${POPUP_BODY_CLASS}`);
  const chatBtn = popup.querySelector(`.${POPUP_CHAT_BTN_CLASS}`);
  if (contentDiv) {
    if (typeof newContent === "string") {
      if (newContent.startsWith("<ul>")) {
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
    } else {
      chatBtn.textContent = "Chat";
      chatBtn.title = "Open chat with summary context";
      chatBtn.onclick = () => popupCallbacks.onChat(null);
      chatBtn.disabled = true;
    }
  }
}

/**
 * Enables or disables the Chat button in the popup.
 */
export function enableChatButton(enable) {
  if (!popup) return;
  const chatBtn = popup.querySelector(`.${POPUP_CHAT_BTN_CLASS}`);

  if (chatBtn) {
    chatBtn.disabled = !enable;
  }

  if (DEBUG)
    console.log(`[LLM Popup] Chat button ${enable ? "enabled" : "disabled"}.`);
}

/**
 * Initializes the popup manager module.
 */
export function initializePopupManager(options) {
  DEBUG = !!options?.initialDebugState;
  if (DEBUG) console.log("[LLM Popup] Initialized.");
}
