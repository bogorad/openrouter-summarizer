console.log(`[LLM Utils] Loaded`);

// utils.js: Provides shared utility functions for the extension. Reduces duplication by centralizing common logic. Called from: pageInteraction.js, chat.js, options.js, background.js.

let errorTimeoutId = null; // Keep track of the timeout for temporary errors

/**
 * Attempts to parse a string as JSON.
 * @param {string} text - The string to parse.
 * @param {boolean} [logWarningOnFail=true] - Whether to log a console warning if parsing fails.
 * @returns {object | array | null} - The parsed JSON object/array, or null if parsing fails.
 */
export function tryParseJson(text, logWarningOnFail = true) {
  if (typeof text !== 'string' || text.trim() === '') {
    if (logWarningOnFail) {
      console.warn('[LLM Utils] Input is not a string or is empty.');
    }
    return null;
  }
  try {
    const parsed = JSON.parse(text.trim());
    return parsed;
  } catch (error) {
    if (logWarningOnFail) {
      console.warn('[LLM Utils] Parsing failed:', error.message, 'Input was:', text.substring(0, 300) + (text.length > 300 ? '...' : ''));
    }
    return null;
  }
}

/**
 * Displays an error message in the UI.
 * @param {string} message - The error message to display.
 * @param {boolean} [isFatal=true] - Determines if chat functionality should be disabled (only applies to chat input/send button).
 * @param {number} [duration=0] - Duration in milliseconds to show the message. 0 means persistent.
 */
export function showError(message, isFatal = true, duration = 0) {
  let errorDisplay = document.getElementById('errorDisplay');
  if (!errorDisplay) {
    errorDisplay = document.createElement('div');
    errorDisplay.id = 'errorDisplay';
    errorDisplay.style.display = 'none';
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
      chatContainer.insertBefore(errorDisplay, chatContainer.firstChild);
    } else {
      document.body.insertBefore(errorDisplay, document.body.firstChild);
    }
  }

  // Clear any existing timeout before setting a new message
  if (errorTimeoutId) {
    clearTimeout(errorTimeoutId);
    errorTimeoutId = null;
  }

  errorDisplay.textContent = message;
  errorDisplay.style.cssText = 'display: block; color: red; background-color: #ffebee; padding: 10px; border: 1px solid red; border-radius: 4px; margin: 10px auto; width: 80vw; max-width: 800px;';

  // Only disable chat input/send button if isFatal is true
  if (isFatal) {
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.querySelector('#chatForm button[type="submit"]');
    if (chatInput) chatInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
  } else {
     // If not fatal, ensure they are enabled (unless another fatal error is active)
     // This is a simplification; a more robust system would track fatal state separately.
     // For now, we assume non-fatal calls don't override fatal state.
     // The main chat logic should handle enabling/disabling based on streaming state.
  }


  if (duration > 0) {
    errorTimeoutId = setTimeout(() => {
      errorDisplay.style.display = 'none';
      errorDisplay.textContent = ''; // Clear text
      errorTimeoutId = null;
      // Note: We don't re-enable input/send button here, as the main chat logic
      // manages their state based on the 'streaming' flag.
    }, duration);
  } else {
      // For persistent errors, ensure no timeout is active
      errorTimeoutId = null;
  }
}

/**
 * Clears the currently displayed error message.
 */
export function clearError() {
    let errorDisplay = document.getElementById('errorDisplay');
    if (errorDisplay) {
        errorDisplay.style.display = 'none';
        errorDisplay.textContent = '';
    }
    if (errorTimeoutId) {
        clearTimeout(errorTimeoutId);
        errorTimeoutId = null;
    }
    // Note: This function does NOT re-enable the chat input/send button.
    // Their state is managed by the main chat logic based on the 'streaming' flag.
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
