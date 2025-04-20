console.log(`[LLM Utils] Loaded`);

// utils.js: Provides shared utility functions for the extension. Reduces duplication by centralizing common logic. Called from: pageInteraction.js, chat.js, options.js, background.js.

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
 * @param {boolean} [isFatal=true] - Determines if chat functionality should be disabled.
 */
export function showError(message, isFatal = true) {
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
  errorDisplay.textContent = message;
  errorDisplay.style.cssText = 'display: block; color: red; background-color: #ffebee; padding: 10px; border: 1px solid red; border-radius: 4px; margin: 10px auto; width: 80vw; max-width: 800px;';
  if (isFatal) {
    // Disable interactive elements if possible
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.querySelector('#chatForm button[type="submit"]');
    if (chatInput) chatInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
  }
}
