// js/errorHandler.js - Centralized error handling for the extension
// NOTE: This file intentionally uses console.warn/error in trackError to avoid
// recursion (Logger errors would trigger more error tracking).

import { MAX_ERROR_LOG_ENTRIES } from "../constants.js";
import { Logger } from "./logger.js";

let userErrorNotifier = null;

export const ErrorSeverity = {
  FATAL: 'fatal',
  WARNING: 'warning',
  INFO: 'info'
};

export const setErrorNotifier = (notifier) => {
  userErrorNotifier = typeof notifier === "function" ? notifier : null;
};

const REDACTED_ERROR_MESSAGE = "Error details redacted";
const REDACTED_CONTEXT = "redactedContext";
const SAFE_CONTEXT_PATTERN = /^[A-Za-z0-9_.:-]{1,120}$/;

/**
 * Centralized error handler for consistent error processing
 */
export class ErrorHandler {
  /**
   * Handles an error with consistent logging and optional user notification
   * @param {Error} error - The error object
   * @param {string} context - Where the error occurred
   * @param {string} severity - ErrorSeverity level
   * @param {boolean} showToUser - Whether to show error to user
   * @returns {string} Error ID for tracking
   */
  static handle(error, context, severity = ErrorSeverity.WARNING, showToUser = false) {
    const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    const errorInfo = {
      errorId,
      timestamp: new Date().toISOString(),
      name: error.name || "Error",
      message: error.message,
      stack: error.stack,
      context,
      severity
    };
    
    // Log structured error
    Logger.error(`[Error ${errorId}]`, errorInfo);
    
    // Track for analytics/monitoring
    this.trackError(errorInfo);
    
    // Show user-friendly message if requested
    if (showToUser && userErrorNotifier) {
      const userMessage = this.getUserFriendlyMessage(error, context);
      try {
        userErrorNotifier(userMessage, severity === ErrorSeverity.FATAL);
      } catch (notifyError) {
        Logger.warn("[ErrorHandler] Failed to notify user:", notifyError);
      }
    }
    
    return errorId;
  }
  
  /**
   * Gets a user-friendly error message
   * @param {Error} error - The error object
   * @param {string} context - Error context
   * @returns {string} User-friendly message
   */
  static getUserFriendlyMessage(error, context) {
    const messages = {
      'network': 'Unable to connect to the server. Please check your internet connection.',
      'auth': 'Authentication failed. Please check your API key in the options.',
      'quota': 'API quota exceeded. Please try again later.',
      'timeout': 'The request timed out. Please try again.',
      'validation': 'Invalid input provided. Please check your selection.',
      'default': 'An unexpected error occurred. Please try again.'
    };
    
    const errorMsg = error.message?.toLowerCase() || '';
    if (errorMsg.includes('401') || errorMsg.includes('unauthorized') || errorMsg.includes('api key')) return messages.auth;
    if (errorMsg.includes('429') || errorMsg.includes('rate limit')) return messages.quota;
    if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) return messages.timeout;
    if (errorMsg.includes('network') || errorMsg.includes('fetch')) return messages.network;
    if (errorMsg.includes('validation') || errorMsg.includes('invalid')) return messages.validation;
    
    return messages.default;
  }
  
  /**
   * Tracks error for debugging/monitoring
   * @param {object} errorInfo - Error information object
   */
  static trackError(errorInfo) {
    try {
      chrome.storage.local.get(['errorLog'], (data) => {
        // Check for storage read errors - use console.warn to avoid recursion
        if (chrome.runtime.lastError) {
          console.warn('[ErrorHandler] Failed to read error log:', chrome.runtime.lastError.message);
          return;
        }
        const log = data.errorLog || [];
        log.push(this.getPersistableErrorInfo(errorInfo));
        if (log.length > MAX_ERROR_LOG_ENTRIES) log.shift(); // Keep last MAX_ERROR_LOG_ENTRIES errors
        chrome.storage.local.set({ errorLog: log }, () => {
          // Check for storage write errors - use console.warn to avoid recursion
          if (chrome.runtime.lastError) {
            console.warn('[ErrorHandler] Failed to write error log:', chrome.runtime.lastError.message);
          }
        });
      });
    } catch (e) {
      // Silent fail for error tracking - outer try/catch prevents crashes
      console.warn('[ErrorHandler] Error tracking failed:', e.message);
    }
  }

  /**
   * Creates a storage-safe error summary without raw messages or stack traces.
   * @param {object} errorInfo - Full error information used for console logging
   * @returns {object} Redacted error information safe for chrome.storage.local
   */
  static getPersistableErrorInfo(errorInfo) {
    return {
      errorId: errorInfo.errorId,
      timestamp: errorInfo.timestamp,
      name: this.getSafeErrorName(errorInfo.name),
      message: this.getRedactedMessage(errorInfo.message),
      context: this.getSafeContext(errorInfo.context),
      severity: errorInfo.severity
    };
  }

  /**
   * Returns a bounded error name that cannot carry contextual payload text.
   * @param {string} name - Error name
   * @returns {string} Safe error name
   */
  static getSafeErrorName(name) {
    return SAFE_CONTEXT_PATTERN.test(name || "") ? name : "Error";
  }

  /**
   * Converts raw error text into a generic category for persisted logs.
   * @param {string} message - Raw error message
   * @returns {string} Redacted message category
   */
  static getRedactedMessage(message) {
    const lowerMessage = typeof message === "string" ? message.toLowerCase() : "";
    if (lowerMessage.includes("401") || lowerMessage.includes("unauthorized") || lowerMessage.includes("api key")) {
      return "Authentication error";
    }
    if (lowerMessage.includes("429") || lowerMessage.includes("rate limit")) {
      return "Quota or rate limit error";
    }
    if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
      return "Timeout error";
    }
    if (lowerMessage.includes("network") || lowerMessage.includes("fetch")) {
      return "Network error";
    }
    if (lowerMessage.includes("validation") || lowerMessage.includes("invalid")) {
      return "Validation error";
    }
    return REDACTED_ERROR_MESSAGE;
  }

  /**
   * Keeps static code-location contexts and drops arbitrary contextual text.
   * @param {string} context - Error context
   * @returns {string} Safe context label
   */
  static getSafeContext(context) {
    if (typeof context !== "string") {
      return REDACTED_CONTEXT;
    }
    return SAFE_CONTEXT_PATTERN.test(context) ? context : REDACTED_CONTEXT;
  }
  
  /**
   * Wraps an async function with error handling
   * @param {Function} fn - Async function to wrap
   * @param {string} context - Error context
   * @param {boolean} showToUser - Whether to show errors to user
   * @returns {Promise} Wrapped function result
   */
  static async wrapAsync(fn, context, showToUser = false) {
    try {
      return await fn();
    } catch (error) {
      this.handle(error, context, ErrorSeverity.WARNING, showToUser);
      throw error; // Re-throw for caller to handle
    }
  }
}

/**
 * Checks chrome.runtime.lastError and handles it if present
 * @param {string} context - Error context
 * @param {boolean} showToUser - Whether to show to user
 * @returns {boolean} True if error was present and handled
 */
export const handleLastError = (context, showToUser = false) => {
  if (chrome.runtime.lastError) {
    const error = new Error(chrome.runtime.lastError.message);
    ErrorHandler.handle(error, context, ErrorSeverity.WARNING, showToUser);
    return true;
  }
  return false;
};
