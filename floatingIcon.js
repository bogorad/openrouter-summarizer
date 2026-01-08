// floatingIcon.js

console.log(`[LLM FloatingIcon] Script Loaded (v2.41.0 - ShadowDOM)`);

const FLOATING_ICON_CLASS = "llm-floating-icon";
const FALLBACK_ICON_CLASS = "llm-fallback-icon";

let host = null;
let shadow = null;
let floatingIcon = null;
let onClickCallback = null;
let onDismissCallback = null;
let DEBUG = false;

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
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    if (DEBUG) console.log("[LLM FloatingIcon] Icon dismissed via Escape.");
    removeFloatingIcon();
    if (onDismissCallback) {
      onDismissCallback();
    }
  }
}

// --- Public Functions ---

export function createFloatingIcon(clickX, clickY, onIconClick, onIconDismiss, onJoplinClick, showJoplinIcon, onCopyHtmlClick, showCopyHtmlIcon) {
  removeFloatingIcon();

  if (
    typeof onIconClick !== "function" ||
    typeof onIconDismiss !== "function" ||
    typeof onJoplinClick !== "function" ||
    typeof onCopyHtmlClick !== "function"
  ) {
    console.error(
      "[LLM FloatingIcon] createFloatingIcon failed: Required callbacks missing.",
    );
    return;
  }
  onClickCallback = onIconClick;
  onDismissCallback = onIconDismiss;

  // Create Host
  host = document.createElement("div");
  host.id = "summarizer-floating-host";
  host.setAttribute("data-extension-ui", "true");
  host.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    overflow: visible;
    z-index: 2147483646;
  `;

  // Attach Shadow DOM
  shadow = host.attachShadow({ mode: "open" });

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
    floatingIcon.style.gap = "8px";
    floatingIcon.style.borderRadius = "30px";
    floatingIcon.style.padding = "8px 16px";
  } else {
    floatingIcon.style.gap = "0px";
    floatingIcon.style.borderRadius = "50%";
    floatingIcon.style.padding = "8px";
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
  iconImg.style.width = "32px";
  iconImg.style.height = "32px";

  iconImg.onerror = function () {
    iconImg.style.display = "none";
    if (!floatingIcon || floatingIcon.querySelector(`.${FALLBACK_ICON_CLASS}`))
      return;
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
  if (!iconUrl) iconImg.onerror();

  const mainIconContainer = document.createElement("div");
  mainIconContainer.style.display = "flex";
  mainIconContainer.style.alignItems = "center";
  mainIconContainer.appendChild(iconImg);
  floatingIcon.appendChild(mainIconContainer);

  // Add Joplin icon if requested
  if (showJoplinIcon) {
    const joplinIconWrapper = document.createElement("div");
    joplinIconWrapper.id = "llm-joplin-icon-wrapper";
    joplinIconWrapper.className = "llm-floating-icon-item";
    joplinIconWrapper.setAttribute("role", "button");
    joplinIconWrapper.setAttribute("tabindex", "0");
    joplinIconWrapper.title = "Send to Joplin";
    joplinIconWrapper.style.cursor = "pointer";
    joplinIconWrapper.style.backgroundColor = "transparent";
    joplinIconWrapper.style.borderRadius = "50%";
    joplinIconWrapper.style.width = "32px";
    joplinIconWrapper.style.height = "32px";
    joplinIconWrapper.style.display = "flex";
    joplinIconWrapper.style.justifyContent = "center";
    joplinIconWrapper.style.alignItems = "center";
    joplinIconWrapper.style.boxShadow = "none";

    const joplinIconImg = document.createElement("img");
    joplinIconImg.src = chrome.runtime.getURL("icons/scissors.svg");
    joplinIconImg.alt = "Joplin";
    joplinIconImg.style.width = "24px";
    joplinIconImg.style.height = "24px";
    joplinIconImg.style.pointerEvents = "none";

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
    floatingIcon.appendChild(joplinIconWrapper);
  }

  // Add Copy HTML icon if requested
  if (showCopyHtmlIcon) {
    const copyHtmlIconWrapper = document.createElement("div");
    copyHtmlIconWrapper.id = "llm-copy-html-icon-wrapper";
    copyHtmlIconWrapper.className = "llm-floating-icon-item";
    copyHtmlIconWrapper.setAttribute("role", "button");
    copyHtmlIconWrapper.setAttribute("tabindex", "0");
    copyHtmlIconWrapper.title = "Copy element HTML";
    copyHtmlIconWrapper.style.cursor = "pointer";
    copyHtmlIconWrapper.style.backgroundColor = "transparent";
    copyHtmlIconWrapper.style.borderRadius = "50%";
    copyHtmlIconWrapper.style.width = "32px";
    copyHtmlIconWrapper.style.height = "32px";
    copyHtmlIconWrapper.style.display = "flex";
    copyHtmlIconWrapper.style.justifyContent = "center";
    copyHtmlIconWrapper.style.alignItems = "center";
    copyHtmlIconWrapper.style.boxShadow = "none";

    const copyHtmlIconImg = document.createElement("img");
    copyHtmlIconImg.src = chrome.runtime.getURL("icons/copy-html.svg");
    copyHtmlIconImg.alt = "Copy HTML";
    copyHtmlIconImg.style.width = "24px";
    copyHtmlIconImg.style.height = "24px";
    copyHtmlIconImg.style.pointerEvents = "none";

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
    floatingIcon.appendChild(copyHtmlIconWrapper);
  }

  // Positioning logic
  floatingIcon.style.whiteSpace = "nowrap";

  // Before appending, define default size based on number of icons
  let defaultWidth = 32 + (8 * 2);
  let defaultHeight = 32 + (8 * 2);

  if (iconCount > 1) {
    defaultWidth = (32 * iconCount) + (8 * (iconCount - 1)) + (16 * 2);
  }

  floatingIcon.style.width = `${defaultWidth}px`;
  floatingIcon.style.height = `${defaultHeight}px`;

  shadow.appendChild(floatingIcon);
  document.body.appendChild(host);

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

  host.style.left = `${iconX}px`;
  host.style.top = `${iconY}px`;

  floatingIcon.addEventListener("click", handleIconClick);
  floatingIcon.addEventListener("keydown", handleIconKeyDown);

  if (DEBUG) console.log("[LLM FloatingIcon] Icon created at", iconX, iconY);

  floatingIcon.focus();
}

export function removeFloatingIcon() {
  if (host) {
    if (floatingIcon) {
      floatingIcon.removeEventListener("click", handleIconClick);
      floatingIcon.removeEventListener("keydown", handleIconKeyDown);
    }

    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
    host = null;
    shadow = null;
    floatingIcon = null;
    if (DEBUG) console.log("[LLM FloatingIcon] Icon removed.");
  }
  onClickCallback = null;
  onDismissCallback = null;
}

export function initializeFloatingIcon(options) {
  DEBUG = !!options?.initialDebugState;
  if (DEBUG) console.log("[LLM FloatingIcon] Initialized.");
}
