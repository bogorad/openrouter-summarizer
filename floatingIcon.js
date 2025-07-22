// floatingIcon.js

console.log(`[LLM FloatingIcon] Script Loaded (v2.40.10)`);

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
 * @param {function} onIconClick - Callback function when the main icon is clicked or activated.
 * @param {function} onIconDismiss - Callback function when the main icon is dismissed (e.g., via Escape key).
 * @param {function} onJoplinClick - Callback function when the Joplin icon is clicked.
 * @param {boolean} showJoplinIcon - Whether to display the Joplin icon.
 * @param {function} onCopyHtmlClick - Callback function when the Copy HTML icon is clicked.
 * @param {boolean} showCopyHtmlIcon - Whether to display the Copy HTML icon.
 */
export function createFloatingIcon(clickX, clickY, onIconClick, onIconDismiss, onJoplinClick, showJoplinIcon, onCopyHtmlClick, showCopyHtmlIcon) {
  removeFloatingIcon(); // Ensure any old icon is removed first

  if (
    typeof onIconClick !== "function" ||
    typeof onIconDismiss !== "function" ||
    typeof onJoplinClick !== "function" || // Ensure joplin callback is a function
    typeof onCopyHtmlClick !== "function" // Ensure copy HTML callback is a function
  ) {
    console.error(
      "[LLM FloatingIcon] createFloatingIcon failed: Required callbacks missing.",
    );
    return;
  }
  onClickCallback = onIconClick;
  onDismissCallback = onDismissCallback; // Re-assigning to itself, as it's modified in the main function.
  // We don't store onJoplinClick as a module-level variable because it's only for this specific instance.

  floatingIcon = document.createElement("div");
  floatingIcon.className = FLOATING_ICON_CLASS;
  floatingIcon.setAttribute("aria-label", "Summarize this element");
  floatingIcon.setAttribute("role", "button");
  floatingIcon.setAttribute("tabindex", "0");
  floatingIcon.title = "Summarize this element (Click or press Enter)";

  // This will make the floatingIcon a flex container to hold multiple icons side-by-side
  floatingIcon.style.display = "flex";
  floatingIcon.style.alignItems = "center";

  // Apply conditional styling for the container shape and background
  floatingIcon.style.backgroundColor = "rgba(255, 255, 255, 0.9)";
  floatingIcon.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";

  // Calculate number of visible icons
  let iconCount = 1 + (showJoplinIcon ? 1 : 0) + (showCopyHtmlIcon ? 1 : 0);

  if (iconCount > 1) {
    floatingIcon.style.gap = "8px"; // Spacing when multiple icons are present
    floatingIcon.style.borderRadius = "30px"; // Oval shape for multiple icons
    floatingIcon.style.padding = "8px 16px"; // Adjust padding for oval to accommodate multiple icons
  } else {
    floatingIcon.style.gap = "0px"; // No gap needed for a single icon
    floatingIcon.style.borderRadius = "50%"; // Circular shape for single icon
    floatingIcon.style.padding = "8px"; // Padding for circle
  }

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
  iconImg.style.width = "32px"; // Retain main icon original size
  iconImg.style.height = "32px"; // Retain main icon original size

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

  // Container for the main icon and its text, if any
  const mainIconContainer = document.createElement("div");
  mainIconContainer.style.display = "flex";
  mainIconContainer.style.alignItems = "center";
  mainIconContainer.appendChild(iconImg);
  floatingIcon.appendChild(mainIconContainer); // Append the main icon container

  // Add Joplin icon if requested
  if (showJoplinIcon) {
    const joplinIconWrapper = document.createElement("div");
    joplinIconWrapper.id = "llm-joplin-icon-wrapper";
    joplinIconWrapper.className = "llm-floating-icon-item"; // A class for styling individual icons
    joplinIconWrapper.setAttribute("role", "button");
    joplinIconWrapper.setAttribute("tabindex", "0");
    joplinIconWrapper.title = "Send to Joplin"; // Tooltip for the new icon
    joplinIconWrapper.style.cursor = "pointer"; // Indicate it's clickable
    joplinIconWrapper.style.backgroundColor = "transparent";
    joplinIconWrapper.style.borderRadius = "50%";
    joplinIconWrapper.style.width = "32px"; // Match main icon size for consistency
    joplinIconWrapper.style.height = "32px"; // Match main icon size for consistency
    joplinIconWrapper.style.display = "flex";
    joplinIconWrapper.style.justifyContent = "center";
    joplinIconWrapper.style.alignItems = "center";
    joplinIconWrapper.style.boxShadow = "none";

    const joplinIconImg = document.createElement("img");
    joplinIconImg.src = chrome.runtime.getURL("icons/scissors.svg"); // Path to scissors.svg
    joplinIconImg.alt = "Joplin";
    joplinIconImg.style.width = "24px"; // Retain original size
    joplinIconImg.style.height = "24px"; // Retain original size
    joplinIconImg.style.pointerEvents = "none"; // Ensures clicks go to the parent wrapper

    joplinIconWrapper.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (DEBUG) console.log("[LLM FloatingIcon] Joplin icon clicked.");
      if (onJoplinClick) {
        onJoplinClick();
      }
    };
    joplinIconWrapper.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (DEBUG) console.log("[LLM FloatingIcon] Joplin icon activated via keyboard.");
        if (onJoplinClick) {
          onJoplinClick();
        }
      }
    };

    joplinIconWrapper.appendChild(joplinIconImg);
    floatingIcon.appendChild(joplinIconWrapper); // Append the Joplin icon wrapper
  }

  // Add Copy HTML icon if requested
  if (showCopyHtmlIcon) {
    const copyHtmlIconWrapper = document.createElement("div");
    copyHtmlIconWrapper.id = "llm-copy-html-icon-wrapper";
    copyHtmlIconWrapper.className = "llm-floating-icon-item"; // A class for styling individual icons
    copyHtmlIconWrapper.setAttribute("role", "button");
    copyHtmlIconWrapper.setAttribute("tabindex", "0");
    copyHtmlIconWrapper.title = "Copy element HTML"; // Tooltip for the new icon
    copyHtmlIconWrapper.style.cursor = "pointer"; // Indicate it's clickable
    copyHtmlIconWrapper.style.backgroundColor = "transparent";
    copyHtmlIconWrapper.style.borderRadius = "50%";
    copyHtmlIconWrapper.style.width = "32px"; // Match main icon size for consistency
    copyHtmlIconWrapper.style.height = "32px"; // Match main icon size for consistency
    copyHtmlIconWrapper.style.display = "flex";
    copyHtmlIconWrapper.style.justifyContent = "center";
    copyHtmlIconWrapper.style.alignItems = "center";
    copyHtmlIconWrapper.style.boxShadow = "none";

    const copyHtmlIconImg = document.createElement("img");
    copyHtmlIconImg.src = chrome.runtime.getURL("icons/copy-html.svg"); // Path to copy-html.svg
    copyHtmlIconImg.alt = "Copy HTML";
    copyHtmlIconImg.style.width = "24px"; // Retain original size
    copyHtmlIconImg.style.height = "24px"; // Retain original size
    copyHtmlIconImg.style.pointerEvents = "none"; // Ensures clicks go to the parent wrapper

    copyHtmlIconWrapper.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (DEBUG) console.log("[LLM FloatingIcon] Copy HTML icon clicked.");
      if (onCopyHtmlClick) {
        onCopyHtmlClick();
      }
    };
    copyHtmlIconWrapper.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (DEBUG) console.log("[LLM FloatingIcon] Copy HTML icon activated via keyboard.");
        if (onCopyHtmlClick) {
          onCopyHtmlClick();
        }
      }
    };

    copyHtmlIconWrapper.appendChild(copyHtmlIconImg);
    floatingIcon.appendChild(copyHtmlIconWrapper); // Append the Copy HTML icon wrapper
  }

  // Positioning logic (accounts for dynamic width due to multiple icons)
  floatingIcon.style.whiteSpace = "nowrap"; // Prevent icon wrapping
  
  // Before appending, define default size based on number of icons
  // This ensures the bounding box calculation for initial positioning is accurate
  let defaultWidth = 32 + (8 * 2); // icon size + padding
  let defaultHeight = 32 + (8 * 2); // icon size + padding

  if (iconCount > 1) {
    defaultWidth = (32 * iconCount) + (8 * (iconCount - 1)) + (16 * 2); // multiple icons + gaps + padding
  }

  floatingIcon.style.width = `${defaultWidth}px`;
  floatingIcon.style.height = `${defaultHeight}px`;

  document.body.appendChild(floatingIcon); // Append to the DOM first to get accurate width

  const boundingBox = floatingIcon.getBoundingClientRect();
  const iconWidth = boundingBox.width;
  const iconHeight = boundingBox.height;

  const margin = 5;
  let iconX = clickX - iconWidth / 2;
  let iconY = clickY - iconHeight / 2;
  
  iconX = Math.max(
    window.scrollX + margin,
    Math.min(iconX, window.scrollX + window.innerWidth - iconWidth - margin),
  );
  iconY = Math.max(
    window.scrollY + margin,
    Math.min(iconY, window.scrollY + window.innerHeight - iconHeight - margin),
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
