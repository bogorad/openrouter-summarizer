// highlighter.js

console.log(`[LLM Highlighter] Script Loaded (v3.0.3)`); // Updated version

const HIGHLIGHT_PREVIEW_CLASS = "llm-highlight-preview";
const HIGHLIGHT_SELECTED_CLASS = "llm-highlight";

let altKeyDown = false;
let previewHighlighted = null;
let selectedElement = null;
let onElementSelectedCallback = null;
let onElementDeselectedCallback = null;
let DEBUG = false; // Will be set by initializeHighlighter

// Track event listeners for cleanup
let eventListeners = [];

/**
 * Adds an event listener and tracks it for cleanup
 * @param {EventTarget} element - Element to attach listener to
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @param {boolean|object} options - Event listener options
 */
const addTrackedEventListener = (element, event, handler, options) => {
  element.addEventListener(event, handler, options);
  eventListeners.push({ element, event, handler, options });
};

// Alt must be down with no Shift and no Control
function isPureAlt(e) {
  return e.altKey && !e.shiftKey && !e.ctrlKey;
}

// --- Internal Event Handlers ---

function handleKeyDown(e) {
  if (e.key === "Alt" && !altKeyDown) {
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.isContentEditable)
    ) {
      if (DEBUG)
        console.log(
          "[LLM Highlighter] Ignoring Alt down in input/editable element.",
        );
      return;
    }
    altKeyDown = true;
    if (DEBUG) console.log("[LLM Highlighter] Alt key down.");
  }
}

function handleKeyUp(e) {
  // Note: We don't reset altKeyDown here directly on keyup.
  // It's reset on blur, visibility change, or when a selection/deselection occurs.
  // This prevents losing the highlight state if Alt is briefly released during mouse movement.
  if (e.key === "Alt") {
    if (DEBUG) console.log("[LLM Highlighter] Alt key up.");
    // If alt is released AND no element is currently selected, reset the state fully.
    // This handles cases where Alt is released without clicking.
    if (!selectedElement) {
      resetHighlightState(); // Use the new reset function
    }
  }
}

function handleMouseOver(e) {
  if (!altKeyDown) {
    removePreviewHighlight(); // Ensure no preview if Alt is not down
    return;
  }

  let target = document.elementFromPoint(e.clientX, e.clientY);

  // Ignore highlighting UI elements (popup, icon)
  if (
    !target ||
    target.closest(".summarizer-popup") ||
    target.closest(".llm-floating-icon")
  ) {
    removePreviewHighlight();
    return;
  }

  // Handle body/html target by checking deeper elements
  if (
    (target === document.body || target === document.documentElement) &&
    document.elementsFromPoint(e.clientX, e.clientY).length > 1
  ) {
    const deeperTarget = document.elementsFromPoint(e.clientX, e.clientY)[1];
    if (
      deeperTarget &&
      !deeperTarget.closest(".summarizer-popup") &&
      !deeperTarget.closest(".llm-floating-icon")
    ) {
      target = deeperTarget;
    } else {
      removePreviewHighlight();
      return;
    }
  }

  // Don't preview highlight the currently selected element
  if (target === selectedElement) {
    removePreviewHighlight(); // Remove preview from *other* elements if hovering over selected
    return;
  }

  // NEW: Only when there is no preview yet, require the original activation to be pure Alt
  if (!previewHighlighted) {
    if (!isPureAlt(e)) {
      // Not a pure-Alt activation attempt; do not create the preview yet
      return;
    }
  }

  // Apply preview highlight if target changed
  if (previewHighlighted !== target) {
    removePreviewHighlight(); // Remove from old
    previewHighlighted = target;
    if (previewHighlighted) {
      previewHighlighted.classList.add(HIGHLIGHT_PREVIEW_CLASS);
    }
  }
}

function handleMouseOut(e) {
  // If mouse leaves the window entirely
  if (!e.relatedTarget && previewHighlighted) {
    if (DEBUG) console.log("[LLM Highlighter] Mouse left window.");
    removePreviewHighlight();
  }
}

function handleMouseDown(e) {
  // Ignore clicks inside floating icon or popup (Shadow DOM hosts)
  // We check for the data-extension-ui attribute on the host elements
  if (
    e.target.closest('[data-extension-ui="true"]')
  ) {
    if (DEBUG)
      console.log("[LLM Highlighter] Mousedown ignored on extension UI.");
    return;
  }

  // --- Alt+Left Click (pure Alt only) ---
  if (e.button === 0 && isPureAlt(e)) {
    e.preventDefault();
    e.stopPropagation();

    const clickedTarget = e.target; // The element actually clicked
    removePreviewHighlight(); // Always remove preview on click

    if (selectedElement === clickedTarget) {
      // --- Deselect ---
      if (DEBUG) console.log("[LLM Highlighter] Deselecting element.");
      removeSelectionHighlight(); // Removes class and clears selectedElement
      resetHighlightState(); // Reset alt state on deselect
      if (onElementDeselectedCallback) {
        onElementDeselectedCallback();
      }
    } else {
      // --- Select ---
      if (clickedTarget) {
        if (DEBUG)
          console.log("[LLM Highlighter] Selecting element:", clickedTarget);
        removeSelectionHighlight(); // Clear previous selection (if any)
        selectedElement = clickedTarget;
        selectedElement.classList.add(HIGHLIGHT_SELECTED_CLASS);
        resetHighlightState(); // Reset alt state after selection is made
        if (onElementSelectedCallback) {
          onElementSelectedCallback(selectedElement, e.pageX, e.pageY); // Pass coordinates
        }
      } else {
        if (DEBUG) console.warn("[LLM Highlighter] Alt+Click target invalid.");
        removeSelectionHighlight(); // Ensure clean state
        resetHighlightState(); // Reset alt state
      }
    }
    return; // Stop processing after Alt+Click
  }

  // --- Regular Left Click (without Alt) ---
  if (!e.altKey && e.button === 0) {
    // If an element is selected and the click is outside it (and outside our UI)
    if (selectedElement && !selectedElement.contains(e.target)) {
      if (DEBUG)
        console.log("[LLM Highlighter] Click outside detected. Deselecting.");
      removeSelectionHighlight();
      resetHighlightState(); // Reset alt state
      if (onElementDeselectedCallback) {
        onElementDeselectedCallback();
      }
    }
  }
}

// --- Helper Functions ---

function removePreviewHighlight() {
  if (previewHighlighted) {
    if (document.body.contains(previewHighlighted)) {
      previewHighlighted.classList.remove(HIGHLIGHT_PREVIEW_CLASS);
    }
    previewHighlighted = null;
  }
}

/**
 * Resets the internal state related to Alt key and preview highlighting.
 * Does NOT remove the selection highlight or clear the selected element.
 */
export function resetHighlightState() {
  if (DEBUG) console.log("[LLM Highlighter] Resetting highlight state.");
  altKeyDown = false;
  removePreviewHighlight(); // Ensure any active preview is also removed
}


// --- Public Functions ---

/**
 * Removes the selection highlight class and clears the selected element state.
 */
export function removeSelectionHighlight() {
  if (selectedElement) {
    if (document.body.contains(selectedElement)) {
      selectedElement.classList.remove(HIGHLIGHT_SELECTED_CLASS);
    }
    if (DEBUG) console.log("[LLM Highlighter] Selection highlight removed.");
    selectedElement = null; // Clear state here
  }
}

/**
 * Returns the currently selected DOM element, or null if none is selected.
 * @returns {Element | null}
 */
export function getSelectedElement() {
  return selectedElement;
}

/**
 * Initializes the highlighter module.
 * @param {object} options - Configuration options.
 * @param {function} options.onElementSelected - Callback function when an element is selected (receives element, x, y).
 * @param {function} options.onElementDeselected - Callback function when an element is deselected.
 * @param {boolean} [options.initialDebugState=false] - Initial debug logging state.
 */
export function initializeHighlighter(options) {
  if (
    !options ||
    typeof options.onElementSelected !== "function" ||
    typeof options.onElementDeselected !== "function"
  ) {
    console.error(
      "[LLM Highlighter] Initialization failed: Required callbacks missing.",
    );
    return;
  }
  onElementSelectedCallback = options.onElementSelected;
  onElementDeselectedCallback = options.onElementDeselected;
  DEBUG = !!options.initialDebugState;

  // Track all event listeners for cleanup
  addTrackedEventListener(window, "keydown", handleKeyDown, true);
  addTrackedEventListener(window, "keyup", handleKeyUp, true);
  addTrackedEventListener(window, "blur", resetHighlightState);
  addTrackedEventListener(document, "visibilitychange", handleVisibilityChange);
  addTrackedEventListener(document, "mousemove", handleMouseOver, true);
  addTrackedEventListener(window, "mouseout", handleMouseOut);
  addTrackedEventListener(document, "mousedown", handleMouseDown, true);

  if (DEBUG) console.log("[LLM Highlighter] Initialized.");
};

// Handler for visibility change
const handleVisibilityChange = () => {
  if (document.visibilityState === "hidden") {
    resetHighlightState();
  }
};

/**
 * Cleans up all event listeners and state
 * Call this when content script is being unloaded
 */
export const cleanupHighlighter = () => {
  // Remove all tracked event listeners
  eventListeners.forEach(({ element, event, handler, options }) => {
    try {
      element.removeEventListener(event, handler, options);
    } catch (e) {
      // Silent fail for cleanup
    }
  });
  eventListeners = [];

  // Clear all state
  altKeyDown = false;
  removePreviewHighlight();
  removeSelectionHighlight();
  selectedElement = null;
  onElementSelectedCallback = null;
  onElementDeselectedCallback = null;

  if (DEBUG) console.log("[LLM Highlighter] Cleaned up.");
};
