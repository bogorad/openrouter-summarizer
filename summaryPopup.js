// summaryPopup.js
// v2.24 - Reverted header/flag creation to direct DOM manipulation

// --- Constants ---
const POPUP_CLASS = "summarizer-popup";
const POPUP_HEADER_CONTAINER_CLASS = "summarizer-header-container";
const POPUP_HEADER_CLASS = "summarizer-header";
const POPUP_FLAGS_CLASS = "summarizer-flags";
const POPUP_BODY_CLASS = "summarizer-body";
const POPUP_ACTIONS_CLASS = "summarizer-actions";
const POPUP_BTN_CLASS = "summarizer-btn";
const POPUP_COPY_BTN_CLASS = "copy-btn";
const POPUP_CHAT_BTN_CLASS = "chat-btn";
const POPUP_CLOSE_BTN_CLASS = "close-btn";
const LANGUAGE_FLAG_CLASS = "language-flag";
const MAX_FLAGS_DISPLAY = 5;
// Removed FLAGS_HIDDEN_CLASS as we won't hide the container

// --- HTML Template String (Simplified - Header created manually) ---
const POPUP_SHELL_TEMPLATE_HTML = `
<div class="${POPUP_CLASS}" style="display: none;">
    <!-- Header container added manually -->
    <div class="${POPUP_BODY_CLASS}"></div>
    <div class="${POPUP_ACTIONS_CLASS}">
        <button class="${POPUP_BTN_CLASS} ${POPUP_COPY_BTN_CLASS}">Copy</button>
        <button class="${POPUP_BTN_CLASS} ${POPUP_CHAT_BTN_CLASS}" disabled>Chat</button>
        <button class="${POPUP_BTN_CLASS} ${POPUP_CLOSE_BTN_CLASS}">Close</button>
    </div>
</div>
`;

// --- Module State ---
let popup = null; // Reference to the main popup shell
let flagsContainer = null; // Direct reference to the flags div
let currentContent = "";
let currentAvailableLanguages = [];
let popupCallbacks = { onCopy: null, onChat: null, onClose: null };
let copyTimeoutId = null;
let DEBUG = false;

// --- Language Data (Set by Initializer) ---
let ALL_LANGUAGE_NAMES_MAP = {};
let svgPathPrefixUrl = "";
let fallbackSvgPathUrl = "";

// --- Internal Helpers ---

function findLanguageByName(name) {
  if (!name || typeof name !== "string" || !ALL_LANGUAGE_NAMES_MAP)
    return undefined;
  const cleanName = name.trim().toLowerCase();
  const languageData = ALL_LANGUAGE_NAMES_MAP[cleanName];
  return languageData ? languageData : undefined;
}

// Renders flags into the existing flagsContainer
function _renderHeaderFlagsInternal() {
  // Use the module-scoped flagsContainer reference
  if (!flagsContainer) {
    if (DEBUG)
      console.warn(
        "[Popup Debug] _renderHeaderFlagsInternal called but flagsContainer is null.",
      );
    return;
  }
  flagsContainer.innerHTML = ""; // Clear existing flags

  // --- Visibility controlled by adding/removing flag images ---
  let hasVisibleFlags = false;

  if (
    Array.isArray(currentAvailableLanguages) &&
    currentAvailableLanguages.length > 0 &&
    svgPathPrefixUrl
  ) {
    const validLanguageData = currentAvailableLanguages
      .map((name) => findLanguageByName(name))
      .filter((lang) => lang !== undefined);

    if (validLanguageData.length > 0) {
      const flagsToDisplay = validLanguageData.slice(1, MAX_FLAGS_DISPLAY);

      if (flagsToDisplay.length > 0) {
        hasVisibleFlags = true; // Flags will be added
        flagsToDisplay.forEach((lang) => {
          const flagImg = document.createElement("img");
          flagImg.className = LANGUAGE_FLAG_CLASS; // Rely on CSS for styling
          flagImg.src = `${svgPathPrefixUrl}${lang.code.toLowerCase()}.svg`;
          flagImg.alt = `${lang.name} flag`;
          flagImg.title = `Translate summary and chat in ${lang.name}`;
          flagImg.onerror = function () {
            this.src = fallbackSvgPathUrl || "";
            this.alt = "Flag not found";
            this.title = "Flag not found";
            if (DEBUG)
              console.warn(
                `[LLM Popup] Missing SVG for code: ${lang.code}, using fallback.`,
              );
          };
          flagImg.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (DEBUG)
              console.log(
                `[LLM Popup] Flag clicked for language: ${lang.name}`,
              );
            if (popupCallbacks.onChat) {
              popupCallbacks.onChat(lang.name);
            } else {
              console.warn("[LLM Popup] onChat callback not defined.");
            }
          });
          flagsContainer.appendChild(flagImg);
        });
        if (DEBUG)
          console.log(
            `[Popup Debug] Appended ${flagsToDisplay.length} flag images.`,
          );
      }
    }
  }

  // Hide/show container based on whether flags were added (optional, CSS might handle empty)
  flagsContainer.style.display = hasVisibleFlags ? "flex" : "none";
  if (DEBUG && !hasVisibleFlags)
    console.log(`[Popup Debug] No valid flags to display.`);
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
        return tempDiv.textContent.trim();
      })
      .filter((text) => text !== "")
      .map((text, idx) => `${idx + 1}. ${text}`)
      .join("\n");
  } else {
    val = contentDiv.textContent || "";
  }
  navigator.clipboard
    .writeText(val.trim())
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
 * Creates and shows the summary popup. Header created via DOM manipulation.
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
  currentAvailableLanguages = [];
  currentContent = content;

  // --- Create Shell from Template ---
  try {
    const template = document.createElement("template");
    template.innerHTML = POPUP_SHELL_TEMPLATE_HTML.trim();
    popup = template.content.firstChild.cloneNode(true); // Assign main shell to popup
  } catch (e) {
    console.error(
      "[LLM Popup] Error parsing or cloning popup shell template:",
      e,
    );
    return;
  }
  // --- End Shell Creation ---

  // --- *** Manually Create Header Section *** ---
  const headerContainer = document.createElement("div");
  headerContainer.className = POPUP_HEADER_CONTAINER_CLASS;
  // Ensure relative positioning for absolute children (flags)
  headerContainer.style.position = "relative"; // Crucial for flag positioning

  const headerTitle = document.createElement("div");
  headerTitle.className = POPUP_HEADER_CLASS;
  headerTitle.textContent = "Summary";

  // Create and store reference to flags container
  flagsContainer = document.createElement("div");
  flagsContainer.className = POPUP_FLAGS_CLASS;
  flagsContainer.style.display = "none"; // Start hidden

  headerContainer.appendChild(headerTitle);
  headerContainer.appendChild(flagsContainer); // Append flags to header container

  // Prepend the manually created header to the popup shell
  popup.insertBefore(headerContainer, popup.firstChild);
  // --- *** End Manual Header Creation *** ---

  // --- Query elements within the popup ---
  const contentDiv = popup.querySelector(`.${POPUP_BODY_CLASS}`);
  const copyBtn = popup.querySelector(`.${POPUP_COPY_BTN_CLASS}`);
  const chatBtn = popup.querySelector(`.${POPUP_CHAT_BTN_CLASS}`);
  const closeBtn = popup.querySelector(`.${POPUP_CLOSE_BTN_CLASS}`);
  // --- End querying elements ---

  // --- Populate initial content ---
  if (contentDiv) {
    if (typeof content === "string") {
      contentDiv.textContent = content;
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

  // --- Attach button listeners ---
  if (copyBtn && contentDiv) {
    copyBtn.onclick = () => handleCopyClick(contentDiv, copyBtn);
  } else {
    console.error(
      "[LLM Popup] Could not attach copy listener: Button or contentDiv missing.",
    );
  }

  if (chatBtn) {
    chatBtn.onclick = () => popupCallbacks.onChat(null);
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
  // --- End attaching listeners ---

  // Append to body and show
  document.body.appendChild(popup);
  if (DEBUG) console.log("[LLM Popup] Popup added to page (manual header).");

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
    flagsContainer = null; // Clear flags container reference
    popupCallbacks = { onCopy: null, onChat: null, onClose: null };
    currentAvailableLanguages = [];
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
 * Updates the available languages and renders the flags in the popup header.
 */
export function updatePopupFlags(availableLanguages = []) {
  if (!popup) {
    if (DEBUG)
      console.warn(
        "[LLM Popup] updatePopupFlags called but popup doesn't exist.",
      );
    return;
  }
  currentAvailableLanguages = availableLanguages;
  _renderHeaderFlagsInternal(); // Call the internal rendering function
  if (DEBUG) console.log("[LLM Popup] Popup flags update process finished.");
}

/**
 * Enables or disables the Chat button in the popup.
 */
export function enableChatButton(enable) {
  if (!popup) return;
  const chatBtn = popup.querySelector(`.${POPUP_CHAT_BTN_CLASS}`);
  if (chatBtn) {
    chatBtn.disabled = !enable;
    if (DEBUG)
      console.log(
        `[LLM Popup] Chat button ${enable ? "enabled" : "disabled"}.`,
      );
  }
}

/**
 * Initializes the popup manager module.
 */
export function initializePopupManager(options) {
  DEBUG = !!options?.initialDebugState;
  if (options?.languageData) {
    ALL_LANGUAGE_NAMES_MAP = options.languageData.ALL_LANGUAGE_NAMES_MAP || {};
    svgPathPrefixUrl = options.languageData.svgPathPrefixUrl || "";
    fallbackSvgPathUrl = options.languageData.fallbackSvgPathUrl || "";
    if (DEBUG) console.log("[LLM Popup] Initialized with language data.");
  } else {
    console.warn(
      "[LLM Popup] Initialized without language data. Flags will not render.",
    );
  }
}
