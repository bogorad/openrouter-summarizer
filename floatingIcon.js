// floatingIcon.js
const VER = "v2.25";
const LASTUPD = "Created module from pageInteraction.js"; // Replace if needed

console.log(`[LLM FloatingIcon] Script Loaded (${VER})`);

const FLOATING_ICON_CLASS = "llm-floating-icon";
const FALLBACK_ICON_CLASS = "llm-fallback-icon"; // Added for consistency

let floatingIcon = null; // Module-scoped state for the icon element
let onClickCallback = null;
let onDismissCallback = null;
let DEBUG = false; // Will be set by initializeFloatingIcon

// --- Internal Helper ---

function handleIconClick(e) {
  e.stopPropagation();
  e.preventDefault();
  if (DEBUG) console.log("[LLM FloatingIcon] Icon clicked.");
  if (onClickCallback) {
    onClickCallback();
  }
}

function handleIconKeyDown(e) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.stopPropagation();
    if (DEBUG) console.log("[LLM FloatingIcon] Icon activated via keyboard.");
    if (onClickCallback) {
      onClickCallback();
    }
  }
  // Use Escape key to dismiss the icon AND trigger the deselect logic
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    if (DEBUG) console.log("[LLM FloatingIcon] Icon dismissed via Escape.");
    removeFloatingIcon(); // Remove the icon itself
    if (onDismissCallback) {
      onDismissCallback(); // Notify the main script to handle deselection etc.
    }
  }
}

// --- Public Functions ---

/**
 * Creates and displays the floating icon at the specified coordinates.
 * @param {number} clickX - The page X coordinate for positioning.
 * @param {number} clickY - The page Y coordinate for positioning.
 * @param {function} onIconClick - Callback function when the icon is clicked or activated.
 * @param {function} onIconDismiss - Callback function when the icon is dismissed (e.g., via Escape key).
 */
export function createFloatingIcon(clickX, clickY, onIconClick, onIconDismiss) {
  removeFloatingIcon(); // Ensure any old icon is removed first

  if (
    typeof onIconClick !== "function" ||
    typeof onIconDismiss !== "function"
  ) {
    console.error(
      "[LLM FloatingIcon] createFloatingIcon failed: Required callbacks missing.",
    );
    return;
  }
  onClickCallback = onIconClick;
  onDismissCallback = onIconDismiss;

  floatingIcon = document.createElement("div");
  floatingIcon.className = FLOATING_ICON_CLASS;
  floatingIcon.setAttribute("aria-label", "Summarize this element");
  floatingIcon.setAttribute("role", "button");
  floatingIcon.setAttribute("tabindex", "0");
  floatingIcon.title = "Summarize this element (Click or press Enter)";

  let iconUrl = "";
  try {
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.getURL === "function"
    ) {
      iconUrl = chrome.runtime.getURL("icons/icon32.png");
    } else {
      throw new Error("chrome.runtime API not available");
    }
  } catch (e) {
    console.warn("[LLM FloatingIcon] Could not get icon URL", e);
    iconUrl = "";
  }

  const iconImg = document.createElement("img");
  iconImg.src = iconUrl;
  iconImg.alt = "Summarize";
  iconImg.style.pointerEvents = "none";

  iconImg.onerror = function () {
    iconImg.style.display = "none";
    if (!floatingIcon || floatingIcon.querySelector(`.${FALLBACK_ICON_CLASS}`))
      return; // Prevent adding multiple fallbacks
    const fallback = document.createElement("span");
    fallback.className = FALLBACK_ICON_CLASS;
    fallback.textContent = "💡";
    fallback.style.pointerEvents = "none";
    floatingIcon.appendChild(fallback);
    if (DEBUG)
      console.warn(
        "[LLM FloatingIcon] Failed to load icon image, using fallback.",
      );
  };
  if (!iconUrl) iconImg.onerror(); // Trigger fallback if URL is empty

  floatingIcon.appendChild(iconImg);

  // Positioning logic (same as before)
  const iconSize = 32;
  const margin = 5;
  let iconX = clickX - iconSize / 2;
  let iconY = clickY - iconSize / 2;
  iconX = Math.max(
    window.scrollX + margin,
    Math.min(iconX, window.scrollX + window.innerWidth - iconSize - margin),
  );
  iconY = Math.max(
    window.scrollY + margin,
    Math.min(iconY, window.scrollY + window.innerHeight - iconSize - margin),
  );
  floatingIcon.style.left = `${iconX}px`;
  floatingIcon.style.top = `${iconY}px`;
  floatingIcon.style.pointerEvents = "auto";

  // Add event listeners specific to this icon instance
  floatingIcon.addEventListener("click", handleIconClick);
  floatingIcon.addEventListener("keydown", handleIconKeyDown);

  document.body.appendChild(floatingIcon);
  if (DEBUG) console.log("[LLM FloatingIcon] Icon created at", iconX, iconY);

  floatingIcon.focus(); // Focus for accessibility
}

/**
 * Removes the floating icon from the DOM if it exists.
 */
export function removeFloatingIcon() {
  if (floatingIcon && floatingIcon.parentNode) {
    // Remove specific listeners added in createFloatingIcon
    floatingIcon.removeEventListener("click", handleIconClick);
    floatingIcon.removeEventListener("keydown", handleIconKeyDown);

    floatingIcon.parentNode.removeChild(floatingIcon);
    if (DEBUG) console.log("[LLM FloatingIcon] Icon removed.");
  }
  floatingIcon = null; // Clear the state variable
  onClickCallback = null; // Clear callbacks
  onDismissCallback = null;
}

/**
 * Initializes the floating icon module.
 * @param {object} options - Configuration options.
 * @param {boolean} [options.initialDebugState=false] - Initial debug logging state.
 */
export function initializeFloatingIcon(options) {
  DEBUG = !!options?.initialDebugState;
  if (DEBUG) console.log("[LLM FloatingIcon] Initialized.");
  // No persistent listeners needed for this module itself
}
