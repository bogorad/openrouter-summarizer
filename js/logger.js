/**
 * @fileoverview Centralized logging utility for consistent log levels and prefixes.
 * Provides debug, info, warn, and error methods with consistent formatting.
 * Debug logs are only shown when DEBUG mode is enabled.
 * @module logger
 */

/**
 * Determines if debug mode is enabled.
 * Defaults to false, can be updated via setDebugMode.
 * @type {boolean}
 */
let DEBUG = false;

/**
 * Updates the debug mode setting.
 * @param {boolean} enabled - Whether debug mode should be enabled.
 */
export const setDebugMode = (enabled) => {
  DEBUG = Boolean(enabled);
};

/**
 * Gets the current debug mode setting.
 * @returns {boolean} Whether debug mode is enabled.
 */
export const isDebugMode = () => DEBUG;

/**
 * Logger utility providing consistent log levels and prefixes.
 * All methods accept a prefix string and optional additional arguments.
 */
export const Logger = {
  /**
   * Logs debug messages (only when DEBUG mode is enabled).
   * @param {string} prefix - Log prefix (e.g., "[LLM Content]")
   * @param {...*} args - Additional arguments to log
   */
  debug: (prefix, ...args) => {
    if (DEBUG) {
      console.log(prefix, ...args);
    }
  },

  /**
   * Logs informational messages.
   * @param {string} prefix - Log prefix (e.g., "[LLM Content]")
   * @param {...*} args - Additional arguments to log
   */
  info: (prefix, ...args) => {
    console.log(prefix, ...args);
  },

  /**
   * Logs warning messages.
   * @param {string} prefix - Log prefix (e.g., "[LLM Content]")
   * @param {...*} args - Additional arguments to log
   */
  warn: (prefix, ...args) => {
    console.warn(prefix, ...args);
  },

  /**
   * Logs error messages.
   * @param {string} prefix - Log prefix (e.g., "[LLM Content]")
   * @param {...*} args - Additional arguments to log
   */
  error: (prefix, ...args) => {
    console.error(prefix, ...args);
  }
};
