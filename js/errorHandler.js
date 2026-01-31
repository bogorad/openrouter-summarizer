// js/errorHandler.js - Centralized error handling for the extension

export const ErrorSeverity = {
  FATAL: 'fatal',
  WARNING: 'warning',
  INFO: 'info'
};

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
      message: error.message,
      stack: error.stack,
      context,
      severity
    };
    
    // Log structured error
    console.error(`[Error ${errorId}]`, errorInfo);
    
    // Track for analytics/monitoring
    this.trackError(errorInfo);
    
    // Show user-friendly message if requested
    if (showToUser && typeof showError !== 'undefined') {
      const userMessage = this.getUserFriendlyMessage(error, context);
      showError(userMessage, severity === ErrorSeverity.FATAL);
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
        const log = data.errorLog || [];
        log.push(errorInfo);
        if (log.length > 50) log.shift(); // Keep last 50 errors
        chrome.storage.local.set({ errorLog: log });
      });
    } catch (e) {
      // Silent fail for error tracking
    }
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
