// utils.js

console.log(`[LLM Utils] Loaded`);

// utils.js: Provides shared utility functions for the extension. Reduces duplication by centralizing common logic. Called from: pageInteraction.js, chat.js, options.js, background.js.
//import { marked } from "marked"; // Try this first

let errorTimeoutId = null; // Keep track of the timeout for temporary errors - FIX: Declared with 'let'

/**
 * Attempts to parse a string as JSON.
 * @param {string} text - The string to parse.
 * @param {boolean} [logWarningOnFail=true] - Whether to log a console warning if parsing fails.
 * @returns {object | array | null} - The parsed JSON object/array, or null if parsing fails.
 */
export function tryParseJson(text, logWarningOnFail = true) {
  if (typeof text !== "string" || text.trim() === "") {
    if (logWarningOnFail) {
      console.warn("[LLM Utils] Input is not a string or is empty.");
    }
    return null;
  }
  try {
    const parsed = JSON.parse(text.trim());
    return parsed;
  } catch (error) {
    if (logWarningOnFail) {
      console.warn(
        "[LLM Utils] Parsing failed:",
        error.message,
        "Input was:",
        text.substring(0, 300) + (text.length > 300 ? "..." : ""),
      );
    }
    return null;
  }
}

/**
 * Displays an error message in the UI.
 * Uses the dedicated notification container if available, otherwise falls back to the #errorDisplay element.
 * @param {string} message - The error message to display.
 * @param {boolean} [isFatal=true] - Determines if chat functionality should be disabled.
 * @param {number} [duration=0] - Duration in milliseconds to show the message. 0 means persistent.
 */
export function showError(message, isFatal = true, duration = 0) {
  // First, try to use the new notification container system
  const notificationContainer = document.getElementById("llm-notification-container");
  if (notificationContainer) {
    // Clear any existing messages before showing the new one
    notificationContainer.innerHTML = "";

    const errorElement = document.createElement("div");
    errorElement.className = "llm-notification-message";
    errorElement.textContent = message;
    notificationContainer.appendChild(errorElement);

    if (duration > 0) {
      setTimeout(() => {
        if (errorElement && notificationContainer.contains(errorElement)) {
          notificationContainer.removeChild(errorElement);
        }
      }, duration);
    }
  } else {
    // Fallback to the old system for pages without the container (chat.html, options.html)
    let errorDisplay = document.getElementById("errorDisplay");
    if (!errorDisplay) {
      console.error("No error display element found on this page. Cannot show error:", message);
      return;
    }

    errorDisplay.textContent = message;
    errorDisplay.style.display = "block";

    // Clear any existing timeout
    if (errorTimeoutId) {
      clearTimeout(errorTimeoutId);
    }

    if (duration > 0) {
      errorTimeoutId = setTimeout(() => {
        errorDisplay.textContent = "";
        errorDisplay.style.display = "none";
      }, duration);
    }
  }

  // The logic to disable chat inputs remains relevant for the chat page context
  if (isFatal) {
    const chatInput = document.getElementById("chatInput");
    const sendButton = document.querySelector('#chatForm button[type="submit"]');
    if (chatInput) chatInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
  }
}



/**
 * Renders text content as HTML using marked if available, or as plain text with line breaks.
 * @param {string} text - The text to render.
 * @returns {string} - The rendered HTML.
 */
export function renderTextAsHtml(text) {
  // Spec: Renders plain text or markdown as HTML.
  // Arguments: text (string) - The input text.
  // Called from: renderMessages.
  // Returns: string - The HTML representation of the text.
  // Call site: Inside renderMessages for assistant messages (if no JSON) and user messages.
  // Dependencies: marked library (optional).
  // State changes: None.
  // Error handling: Logs error if marked parsing fails.
  // Side effects: None.
  // Accessibility: N/A.
  // Performance: Markdown parsing or simple string replacement.

  if (typeof text !== "string" || !text.trim()) {
    return "";
  }
  if (typeof marked !== "undefined") {
    try {
      // Use marked.parse for markdown rendering
      return marked.parse(text, { sanitize: true });
    } catch (parseError) {
      console.error("[LLM Utils] Marked parse error:", parseError);
      // Fallback to simple line breaks if marked fails
      return text.replace(/\n/g, "<br>");
    }
  } else {
    // Fallback to simple line breaks if marked is not available
    return text.replace(/\n/g, "<br>");
  }
}


