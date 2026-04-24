// Promise-based Chrome messaging client with typed failures.
// Callers can migrate to this module incrementally without changing handlers.

import {
  RuntimeMessageActionSet,
  TabMessageActionSet,
} from "./actions.js";

const ERROR_CHROME_UNAVAILABLE = "CHROME_UNAVAILABLE";
const ERROR_INVALID_ACTION = "INVALID_ACTION";
const ERROR_SEND_FAILED = "SEND_FAILED";

/**
 * Error thrown when a Chrome runtime or tab message cannot be sent or answered.
 */
export class ChromeMessageError extends Error {
  /**
   * @param {object} options Error options.
   * @param {string} options.message Human-readable error message.
   * @param {string} options.code Stable machine-readable error code.
   * @param {"runtime"|"tab"} options.direction Message direction.
   * @param {string=} options.action Message action.
   * @param {number=} options.tabId Target tab id for tab messages.
   * @param {object=} options.lastError Raw chrome.runtime.lastError object.
   * @param {unknown=} options.cause Original thrown error.
   */
  constructor({
    message,
    code,
    direction,
    action,
    tabId,
    lastError,
    cause,
  }) {
    super(message);
    this.name = "ChromeMessageError";
    this.code = code;
    this.direction = direction;
    this.action = action;
    this.tabId = tabId;
    this.lastError = lastError || null;

    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * @typedef {object} MessageResult
 * @property {true} ok Indicates the message completed without chrome.runtime.lastError.
 * @property {"runtime"|"tab"} direction Message direction.
 * @property {string=} action Message action.
 * @property {number=} tabId Target tab id for tab messages.
 * @property {unknown} response Response passed by the receiving listener.
 */

const getChromeApi = (direction, action, tabId) => {
  if (
    typeof chrome === "undefined" ||
    !chrome.runtime ||
    typeof chrome.runtime.sendMessage !== "function"
  ) {
    throw new ChromeMessageError({
      message: "chrome.runtime.sendMessage is not available.",
      code: ERROR_CHROME_UNAVAILABLE,
      direction,
      action,
      tabId,
    });
  }

  if (
    direction === "tab" &&
    (!chrome.tabs || typeof chrome.tabs.sendMessage !== "function")
  ) {
    throw new ChromeMessageError({
      message: "chrome.tabs.sendMessage is not available.",
      code: ERROR_CHROME_UNAVAILABLE,
      direction,
      action,
      tabId,
    });
  }

  return chrome;
};

const getLastErrorMessage = (lastError) => {
  if (!lastError) {
    return "Chrome message failed.";
  }

  return lastError.message || String(lastError);
};

const createLastError = ({ direction, action, tabId, lastError }) =>
  new ChromeMessageError({
    message: getLastErrorMessage(lastError),
    code: ERROR_SEND_FAILED,
    direction,
    action,
    tabId,
    lastError,
  });

const createInvalidActionError = ({ direction, action, tabId }) =>
  new ChromeMessageError({
    message: `Unsupported ${direction} message action: ${action}`,
    code: ERROR_INVALID_ACTION,
    direction,
    action,
    tabId,
  });

const assertKnownAction = ({ direction, action, tabId }) => {
  if (!action) {
    return;
  }

  const knownActions =
    direction === "runtime" ? RuntimeMessageActionSet : TabMessageActionSet;

  if (!knownActions.has(action)) {
    throw createInvalidActionError({ direction, action, tabId });
  }
};

const createResult = ({ direction, action, tabId, response }) => ({
  ok: true,
  direction,
  action,
  tabId,
  response,
});

const sendWithCallback = ({ direction, tabId, message }) => {
  const action = message?.action;
  assertKnownAction({ direction, action, tabId });
  const chromeApi = getChromeApi(direction, action, tabId);

  return new Promise((resolve, reject) => {
    const handleResponse = (response) => {
      const lastError = chromeApi.runtime.lastError;

      if (lastError) {
        reject(createLastError({ direction, action, tabId, lastError }));
        return;
      }

      resolve(createResult({ direction, action, tabId, response }));
    };

    try {
      if (direction === "tab") {
        chromeApi.tabs.sendMessage(tabId, message, handleResponse);
        return;
      }

      chromeApi.runtime.sendMessage(message, handleResponse);
    } catch (error) {
      reject(
        new ChromeMessageError({
          message: error.message || "Chrome message failed before callback.",
          code: ERROR_SEND_FAILED,
          direction,
          action,
          tabId,
          cause: error,
        }),
      );
    }
  });
};

/**
 * Sends a message to the extension runtime.
 *
 * Resolves to a MessageResult object whose `response` field is the raw handler
 * response. Throws ChromeMessageError when Chrome APIs are unavailable, the
 * action is not registered as a runtime action, sendMessage throws, or
 * chrome.runtime.lastError is set in the callback.
 *
 * @param {object} message Runtime message. A known `action` is required when present.
 * @returns {Promise<MessageResult>}
 */
export const sendRuntimeMessage = (message) =>
  sendWithCallback({ direction: "runtime", message });

/**
 * Sends a message to a content script in a specific tab.
 *
 * Resolves to a MessageResult object whose `response` field is the raw handler
 * response. Throws ChromeMessageError when Chrome APIs are unavailable, the
 * action is not registered as a tab action, sendMessage throws, or
 * chrome.runtime.lastError is set in the callback.
 *
 * @param {number} tabId Target tab id.
 * @param {object} message Tab message. A known `action` is required when present.
 * @returns {Promise<MessageResult>}
 */
export const sendTabMessage = (tabId, message) =>
  sendWithCallback({ direction: "tab", tabId, message });

/**
 * Builds and sends a runtime action message.
 *
 * @param {string} action Runtime action from RuntimeMessageActions.
 * @param {object=} payload Additional message fields.
 * @returns {Promise<MessageResult>}
 */
export const sendRuntimeAction = (action, payload = {}) =>
  sendRuntimeMessage({ ...payload, action });

/**
 * Builds and sends a tab action message.
 *
 * @param {number} tabId Target tab id.
 * @param {string} action Tab action from TabMessageActions.
 * @param {object=} payload Additional message fields.
 * @returns {Promise<MessageResult>}
 */
export const sendTabAction = (tabId, action, payload = {}) =>
  sendTabMessage(tabId, { ...payload, action });

