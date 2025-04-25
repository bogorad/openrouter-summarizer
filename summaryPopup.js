// summaryPopup.js

console.log(`[LLM Popup] Script Loaded (v3.0.10)`); // Updated version

// --- Constants ---
const POPUP_CLASS = "summarizer-popup";
const POPUP_HEADER_CONTAINER_CLASS = "summarizer-header-container";
const POPUP_HEADER_CLASS = "summarizer-header";
const POPUP_BODY_CLASS = "summarizer-body";
const POPUP_ACTIONS_CLASS = "summarizer-actions";
const POPUP_BTN_CLASS = "summarizer-btn";
const POPUP_COPY_BTN_CLASS = "copy-btn";
const POPUP_CHAT_BTN_CLASS = "chat-btn"; // New class for the single chat button
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
let currentContent = "";
let popupCallbacks = { onCopy: null, onChat: null, onClose: null };
let copyTimeoutId = null;
let DEBUG = false;

// Handles copy logic
function handleCopyClick(contentDiv, copyBtn) {
  if (!contentDiv || !copyBtn) return;
  if (copyTimeoutId) clearTimeout(copyTimeoutId);
  let val = "";
  const listItems = contentDiv.querySelectorAll("li");
  if (listItems.length > 0) {
    val = Array.from(listItems)
      .map((li) => {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = li.innerHTML;
        // Basic cleaning: replace non-breaking spaces, trim
        return tempDiv.textContent.replace(/\u00A0/g, " ").trim();
      })
      .filter((text) => text !== "")
      .map((text, idx) => `${idx + 1}. ${text}`)
      .join("\n");
  } else {
    // Fallback for non-list content
    val = contentDiv.textContent.replace(/\u00A0/g, " ").trim() || "";
  }

  navigator.clipboard
    .writeText(val) // Use the cleaned value
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
}

// --- Public Functions ---

/**
 * Creates and shows the summary popup using an HTML template.
 */
export function showPopup(content, callbacks) {
  hidePopup();

  if (
    !callbacks ||
    typeof callbacks.onCopy !== "function" ||
    typeof callbacks.onChat !== "function" ||
    typeof callbacks.onClose !== "function"
  ) {
    console.error("[LLM Popup] showPopup failed: Required callbacks missing.");
    return;
  }
  popupCallbacks = callbacks;
  currentContent = content;

  try {
    const template = document.createElement("template");
    template.innerHTML = POPUP_TEMPLATE_HTML.trim();
    popup = template.content.firstChild.cloneNode(true);
  } catch (e) {
    console.error("[LLM Popup] Error parsing or cloning popup template:", e);
    return;
  }

  const contentDiv = popup.querySelector(`.${POPUP_BODY_CLASS}`);
  const copyBtn = popup.querySelector(`.${POPUP_COPY_BTN_CLASS}`);
  const chatBtn = popup.querySelector(`.${POPUP_CHAT_BTN_CLASS}`); // Get the new single chat button
  const closeBtn = popup.querySelector(`.${POPUP_CLOSE_BTN_CLASS}`);

  if (contentDiv) {
    if (typeof content === "string") {
      // Render initial content (e.g., "Thinking...")
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
      "[LLM Popup] Cannot set initial content: Popup body div not found in template clone.",
    );
  }

  if (copyBtn && contentDiv) {
    copyBtn.onclick = () => handleCopyClick(contentDiv, copyBtn);
  } else {
    console.error(
      "[LLM Popup] Could not attach copy listener: Button or contentDiv missing.",
    );
  }

  // Attach listener to the single chat button
  if (chatBtn) {
    // Pass null for language to indicate default chat
    chatBtn.onclick = () => popupCallbacks.onChat(null);
    chatBtn.disabled = true; // Start disabled until summary loads
  } else {
    console.error(
      "[LLM Popup] Could not attach chat listener: Button missing.",
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
    if (popup) popup.classList.add("visible");
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
 */
export function updatePopupContent(newContent) {
  if (!popup) {
    if (DEBUG)
      console.warn(
        "[LLM Popup] updatePopupContent called but popup doesn't exist.",
      );
    return;
  }
  currentContent = newContent;
  const contentDiv = popup.querySelector(`.${POPUP_BODY_CLASS}`);
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
}

/**
 * Updates the language info and renders the flag buttons in the popup footer.
 * This function is now a no-op as flags are moved to chat.
 * @param {Array} languages - List of objects with language_name and svg_path (ALL configured languages).
 */
export function updatePopupFlags(languages = []) {
  // This function is now a no-op as flags are moved to chat.
  // The language_info is still passed from background to pageInteraction,
  // but pageInteraction will need to store it and pass it to the chat tab context.
  if (DEBUG)
    console.log(
      "[LLM Popup] updatePopupFlags called (no-op, flags moved to chat).",
    );
}

/**
 * Enables or disables the Chat button in the popup.
 */
export function enableChatButton(enable) {
  if (!popup) return;
  const chatBtn = popup.querySelector(`.${POPUP_CHAT_BTN_CLASS}`); // Get the single chat button

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
