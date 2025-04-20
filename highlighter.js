// highlighter.js
const VER = "v2.25";
const LASTUPD = "Created module from pageInteraction.js"; // Replace if needed

console.log(`[LLM Highlighter] Script Loaded (${VER})`);

const HIGHLIGHT_PREVIEW_CLASS = "llm-highlight-preview";
const HIGHLIGHT_SELECTED_CLASS = "llm-highlight";

let altKeyDown = false;
let previewHighlighted = null;
let selectedElement = null;
let lastHighlighted = null; // Keep track for click logic consistency
let onElementSelectedCallback = null;
let onElementDeselectedCallback = null;
let DEBUG = false; // Will be set by initializeHighlighter

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
      resetAltState();
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
  // Ignore clicks inside floating icon or popup
  // Note: The main script should handle preventing clicks on its own UI elements if needed *before* calling highlighter logic,
  // but this check adds robustness.
  if (
    e.target.closest(".llm-floating-icon") ||
    e.target.closest(".summarizer-popup")
  ) {
    if (DEBUG)
      console.log("[LLM Highlighter] Mousedown ignored on icon or popup.");
    return;
  }

  // --- Alt+Left Click ---
  if (e.altKey && e.button === 0) {
    e.preventDefault();
    e.stopPropagation();

    const clickedTarget = e.target; // The element actually clicked
    removePreviewHighlight(); // Always remove preview on click

    if (selectedElement === clickedTarget) {
      // --- Deselect ---
      if (DEBUG) console.log("[LLM Highlighter] Deselecting element.");
      removeSelectionHighlight(); // Removes class and clears selectedElement
      lastHighlighted = null;
      altKeyDown = false; // Reset alt state on deselect
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
        lastHighlighted = clickedTarget; // Update last highlighted as well
        selectedElement.classList.add(HIGHLIGHT_SELECTED_CLASS);
        altKeyDown = false; // Reset alt state after selection is made
        if (onElementSelectedCallback) {
          onElementSelectedCallback(selectedElement, e.pageX, e.pageY); // Pass coordinates
        }
      } else {
        if (DEBUG) console.warn("[LLM Highlighter] Alt+Click target invalid.");
        removeSelectionHighlight(); // Ensure clean state
        lastHighlighted = null;
        altKeyDown = false;
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
      lastHighlighted = null;
      altKeyDown = false; // Reset alt state
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

function resetAltState() {
  // Only reset fully if no element is currently selected
  if (!selectedElement && (altKeyDown || previewHighlighted)) {
    if (DEBUG)
      console.log("[LLM Highlighter] Resetting Alt state (no selection).");
    altKeyDown = false;
    removePreviewHighlight();
  } else if (altKeyDown || previewHighlighted) {
    // If an element *is* selected, just remove preview highlight but keep alt state potentially active
    // until a click confirms selection/deselection. This feels more complex than needed.
    // Let's simplify: resetAltState always resets the preview. Alt key state is managed by keydown/up/click.
    removePreviewHighlight();
    // Let's also reset altKeyDown here for simplicity on blur/visibility change
    altKeyDown = false;
    if (DEBUG)
      console.log(
        "[LLM Highlighter] Resetting Alt state (on blur/visibility change).",
      );
  }
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

  // Add event listeners managed by this module
  window.addEventListener("keydown", handleKeyDown, true); // Use capture for keydown
  window.addEventListener("keyup", handleKeyUp, true); // Use capture for keyup
  window.addEventListener("blur", resetAltState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      resetAltState();
    }
  });
  document.addEventListener("mousemove", handleMouseOver, true); // Use capture for mousemove
  window.addEventListener("mouseout", handleMouseOut);
  document.addEventListener("mousedown", handleMouseDown, true); // Use capture for mousedown

  if (DEBUG) console.log("[LLM Highlighter] Initialized.");
}
