// summaryPopup.js

console.log(`[LLM Popup] Script Loaded (v2.50.13)`); // Updated version

// --- Constants ---
const POPUP_CLASS = "summarizer-popup";
const POPUP_HEADER_CONTAINER_CLASS = "summarizer-header-container";
const POPUP_HEADER_CLASS = "summarizer-header";
const POPUP_BODY_CLASS = "summarizer-body";
const POPUP_ACTIONS_CLASS = "summarizer-actions";
const POPUP_BTN_CLASS = "summarizer-btn";
const POPUP_COPY_BTN_CLASS = "copy-btn";
// Classes for chat group
const CHAT_GROUP_WRAPPER_CLASS = "chat-group-wrapper"; // Wrapper for positioning label + container
const CHAT_GROUP_LABEL_CLASS = "chat-group-label"; // The "CHAT" text label
const CHAT_BUTTON_CONTAINER_CLASS = "chat-button-container"; // Box holding buttons
const CHAT_BTN_DEFAULT_CLASS = "chat-btn-default"; // Specific class for default chat icon button
const CHAT_FLAGS_CONTAINER_CLASS = "chat-flags-container"; // Container for flag buttons
const CHAT_BTN_FLAG_CLASS = "chat-btn-flag"; // Class for flag buttons
// End classes
const POPUP_CLOSE_BTN_CLASS = "close-btn";
const LANGUAGE_FLAG_CLASS = "language-flag"; // Used inside flag buttons
const MAX_FLAGS_DISPLAY = 5; // Limit number of flag buttons shown

// --- HTML Template String ---
// Added chat-group-wrapper, label, and icon button structure
const POPUP_TEMPLATE_HTML = `
<div class="${POPUP_CLASS}" style="display: none;">
    <div class="${POPUP_HEADER_CONTAINER_CLASS}">
        <div class="${POPUP_HEADER_CLASS}">Summary</div>
    </div>
    <div class="${POPUP_BODY_CLASS}"></div>
    <div class="${POPUP_ACTIONS_CLASS}">
        <button class="${POPUP_BTN_CLASS} ${POPUP_COPY_BTN_CLASS}">Copy</button>

        <!-- Wrapper for positioning label and button container -->
        <div class="${CHAT_GROUP_WRAPPER_CLASS}">
            <span class="${CHAT_GROUP_LABEL_CLASS}">CHAT</span>
            <div class="${CHAT_BUTTON_CONTAINER_CLASS}"> <!-- This container aligns vertically -->
                 <button class="${POPUP_BTN_CLASS} ${CHAT_BTN_DEFAULT_CLASS}" title="Chat about summary">
                     <img src="" alt="Chat" class="default-chat-icon"> <!-- Globe icon src set dynamically -->
                 </button>
                 <div class="${CHAT_FLAGS_CONTAINER_CLASS}">
                     <!-- Flag buttons added dynamically -->
                 </div>
            </div>
        </div>
        <!-- End Wrapper -->

        <button class="${POPUP_BTN_CLASS} ${POPUP_CLOSE_BTN_CLASS}">Close</button>
    </div>
</div>
`;

// --- Module State ---
let popup = null;
let currentContent = "";
let language_info = []; // Holds ALL configured languages passed from pageInteraction
let popupCallbacks = { onCopy: null, onChat: null, onClose: null };
let copyTimeoutId = null;
let DEBUG = false;

// Renders flag BUTTONS in the footer
function _renderFlagButtonsInternal() {
  if (!popup) return;
  const flagsContainer = popup.querySelector(`.${CHAT_FLAGS_CONTAINER_CLASS}`);
  if (!flagsContainer) {
    console.warn(
      "[LLM Popup] Chat flags container not found in popup DOM during render.",
    );
    return;
  }
  flagsContainer.innerHTML = ""; // Clear previous flag buttons

  // language_info now contains ALL configured languages
  if (!Array.isArray(language_info) || language_info.length === 0) {
    if (DEBUG)
      console.log(
        "[LLM Popup] No languages available for flag buttons:",
        language_info,
      );
    // Hide the container or show a message if desired, but for now, just leave it empty
    return;
  }

  if (DEBUG)
    console.log(
      "[LLM Popup] Rendering flag buttons for languages:",
      language_info,
    );

  // Apply MAX_FLAGS_DISPLAY limit
  const flagsToDisplay = language_info.slice(0, MAX_FLAGS_DISPLAY);

  flagsToDisplay.forEach((langInfo) => {
    // Create a BUTTON element for each flag
    const flagButton = document.createElement("button");
    flagButton.className = `${POPUP_BTN_CLASS} ${CHAT_BTN_FLAG_CLASS}`;
    flagButton.title = `Translate summary and chat in ${langInfo.language_name}`;

    // Create the IMG element for the flag inside the button
    const flagImg = document.createElement("img");
    flagImg.className = LANGUAGE_FLAG_CLASS;
    flagImg.src = langInfo.svg_path;
    flagImg.alt = `${langInfo.language_name} flag`;
    // Prevent image from interfering with button click
    flagImg.style.pointerEvents = "none";

    flagButton.appendChild(flagImg); // Add image to button

    // Add click listener to the BUTTON
    flagButton.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (DEBUG)
        console.log(
          `[LLM Popup] Flag button clicked for language: ${langInfo.language_name}`,
        );
      if (popupCallbacks.onChat) {
        // Pass the language name to the callback
        popupCallbacks.onChat(langInfo.language_name);
      } else {
        console.warn("[LLM Popup] onChat callback not defined.");
      }
    });
    flagsContainer.appendChild(flagButton); // Add button to container
  });
}

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
  language_info = []; // Reset language info on show
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
  const defaultChatBtn = popup.querySelector(`.${CHAT_BTN_DEFAULT_CLASS}`); // Get default chat button
  const defaultChatIcon = defaultChatBtn?.querySelector(".default-chat-icon"); // Find the img tag
  const closeBtn = popup.querySelector(`.${POPUP_CLOSE_BTN_CLASS}`);
  // Note: Flag buttons container (.chat-flags-container) exists but is empty initially

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

  // Attach listener to the DEFAULT chat button (ICON)
  if (defaultChatBtn) {
    // Set default icon path
    if (defaultChatIcon) {
      try {
        // Use default.svg for the globe icon
        defaultChatIcon.src = chrome.runtime.getURL(
          // "country-flags/svg/default.svg",
          "country-flags/svg/globe.svg",
        );
      } catch (e) {
        console.error("Failed to get URL for default chat icon", e);
        defaultChatIcon.alt = "Chat"; // Fallback alt text
      }
    }
    // Attach click handler - pass null for language to indicate default chat
    defaultChatBtn.onclick = () => popupCallbacks.onChat(null);
    defaultChatBtn.disabled = true; // Start disabled until summary loads
  } else {
    console.error(
      "[LLM Popup] Could not attach default chat listener: Button missing.",
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
    language_info = [];
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
 * @param {Array} languages - List of objects with language_name and svg_path (ALL configured languages).
 */
export function updatePopupFlags(languages = []) {
  if (!popup) {
    if (DEBUG)
      console.warn(
        "[LLM Popup] updatePopupFlags called but popup doesn't exist.",
      );
    return;
  }
  // Store the full list passed from pageInteraction
  language_info = languages;
  if (DEBUG)
    console.log(
      "[LLM Popup] Updating flag buttons with language info:",
      language_info,
    );
  _renderFlagButtonsInternal(); // Call the internal rendering function for flag buttons
  if (DEBUG)
    console.log("[LLM Popup] Popup flag buttons update process finished.");
}

/**
 * Enables or disables the Chat buttons (default and flags) in the popup.
 */
export function enableChatButton(enable) {
  if (!popup) return;
  const defaultChatBtn = popup.querySelector(`.${CHAT_BTN_DEFAULT_CLASS}`);
  const flagButtons = popup.querySelectorAll(`.${CHAT_BTN_FLAG_CLASS}`);

  if (defaultChatBtn) {
    defaultChatBtn.disabled = !enable;
  }
  flagButtons.forEach((btn) => {
    btn.disabled = !enable;
  });

  if (DEBUG)
    console.log(`[LLM Popup] Chat buttons ${enable ? "enabled" : "disabled"}.`);
}

/**
 * Initializes the popup manager module.
 */
export function initializePopupManager(options) {
  DEBUG = !!options?.initialDebugState;
  if (DEBUG) console.log("[LLM Popup] Initialized.");
}
