// utils/errorHandling.js
import { STORAGE_KEY_DEBUG } from "../constants.js";

let DEBUG = false;

/**
 * Initialize debug mode from storage
 */
export function initDebugMode() {
  chrome.storage.sync.get(STORAGE_KEY_DEBUG, (data) => {
    DEBUG = !!data[STORAGE_KEY_DEBUG];
  });
}

/**
 * Check if debug mode is enabled
 * @returns {boolean} Debug mode status
 */
export function isDebugMode() {
  return DEBUG;
}

// Removed unused function setDebugMode

/**
 * Log message if debug mode is enabled
 * @param {string} message - Message to log
 * @param {any} data - Optional data to log
 */
export function logDebug(message, data) {
  if (DEBUG) {
    if (data !== undefined) {
      console.log(`[LLM Background] ${message}:`, data);
    } else {
      console.log(`[LLM Background] ${message}`);
    }
  }
}

/**
 * Log error with debug check
 * @param {string} message - Error message
 * @param {Error} error - Error object
 */
export function logError(message, error) {
  if (DEBUG) {
    console.error(`[LLM Background] ${message}:`, error);
  }
}

/**
 * Check if an error is due to a closed tab
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is due to closed tab
 */
export function isTabClosedError(error) {
  if (!error || !error.message) return false;
  return (
    error.message.includes("Receiving end does not exist") ||
    error.message.includes("message channel closed")
  );
}

/**
 * Sanitize object for logging (hide API keys)
 * @param {Object} obj - Object to sanitize
 * @param {string} apiKeyField - Field name containing API key
 * @returns {Object} Sanitized object
 */
export function sanitizeForLogging(obj, apiKeyField = "apiKey") {
  if (!obj || typeof obj !== "object") return obj;

  const sanitized = { ...obj };
  if (sanitized[apiKeyField]) {
    sanitized[apiKeyField] = "[API Key Hidden]";
  }

  return sanitized;
}
