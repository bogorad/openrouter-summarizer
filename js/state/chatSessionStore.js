/**
 * @fileoverview Session storage wrapper for chat context and active request IDs.
 *
 * This module owns the documented shape of chat session state. It is safe to
 * import in Node tests because missing Chrome session storage returns defaults
 * and write operations become no-ops.
 */

import {
  STORAGE_KEY_CHAT_CONTEXT,
  STORAGE_KEY_CURRENT_CHAT_REQUEST_ID,
} from "./settingsSchema.js";

export const STORAGE_KEY_ACTIVE_SUMMARY_REQUEST_ID = "activeSummaryRequestId";

export const CHAT_CONTEXT_FIELDS = Object.freeze([
  "domSnippet",
  "summary",
  "chatTargetLanguage",
  "modelUsedForSummary",
  "processedMarkdown",
]);

export const CHAT_SESSION_KEYS = Object.freeze([
  STORAGE_KEY_CHAT_CONTEXT,
  STORAGE_KEY_CURRENT_CHAT_REQUEST_ID,
  STORAGE_KEY_ACTIVE_SUMMARY_REQUEST_ID,
]);

export const DEFAULT_CHAT_CONTEXT = Object.freeze({
  domSnippet: "",
  summary: "",
  chatTargetLanguage: "",
  modelUsedForSummary: "",
  processedMarkdown: "",
});

export const DEFAULT_CHAT_SESSION = Object.freeze({
  [STORAGE_KEY_CHAT_CONTEXT]: DEFAULT_CHAT_CONTEXT,
  [STORAGE_KEY_CURRENT_CHAT_REQUEST_ID]: "",
  [STORAGE_KEY_ACTIVE_SUMMARY_REQUEST_ID]: "",
});

/**
 * Returns true when the supplied Chrome API exposes session storage.
 * @param {object} chromeApi - Chrome extension API object.
 * @returns {boolean}
 */
export const hasSessionStorage = (chromeApi = globalThis.chrome) =>
  Boolean(
    chromeApi?.storage?.session?.get &&
    chromeApi?.storage?.session?.set &&
    chromeApi?.storage?.session?.remove,
  );

/**
 * Loads the full chat session from chrome.storage.session.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<object>} Normalized chat session state.
 */
export const loadChatSession = async ({ chromeApi = globalThis.chrome } = {}) => {
  if (!hasSessionStorage(chromeApi)) {
    return createDefaultChatSession();
  }

  const storedSession = await sessionGet(CHAT_SESSION_KEYS, chromeApi);
  return normalizeChatSession(storedSession);
};

/**
 * Saves the supplied chat session fields to chrome.storage.session.
 * @param {object} session - Chat session fields to persist.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<object>} Normalized persisted session fields.
 */
export const saveChatSession = async (
  session,
  { chromeApi = globalThis.chrome } = {},
) => {
  const normalizedSession = normalizeChatSession(session);
  if (!hasSessionStorage(chromeApi)) {
    return normalizedSession;
  }

  await sessionSet(normalizedSession, chromeApi);
  return normalizedSession;
};

/**
 * Clears every chat session key owned by this module.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<void>}
 */
export const clearChatSession = async ({ chromeApi = globalThis.chrome } = {}) => {
  if (!hasSessionStorage(chromeApi)) {
    return;
  }

  await sessionRemove(CHAT_SESSION_KEYS, chromeApi);
};

/**
 * Loads only the selected-content chat context.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<object>} Normalized chat context.
 */
export const loadChatContext = async ({ chromeApi = globalThis.chrome } = {}) => {
  if (!hasSessionStorage(chromeApi)) {
    return createDefaultChatContext();
  }

  const storedSession = await sessionGet(STORAGE_KEY_CHAT_CONTEXT, chromeApi);
  return normalizeChatContext(storedSession[STORAGE_KEY_CHAT_CONTEXT]);
};

/**
 * Saves selected-content context used to initialize chat.
 * @param {object} context - Raw context values.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<object>} Normalized persisted context.
 */
export const saveChatContext = async (
  context,
  { chromeApi = globalThis.chrome } = {},
) => {
  const normalizedContext = normalizeChatContext(context);
  if (!hasSessionStorage(chromeApi)) {
    return normalizedContext;
  }

  await sessionSet({ [STORAGE_KEY_CHAT_CONTEXT]: normalizedContext }, chromeApi);
  return normalizedContext;
};

/**
 * Clears the selected-content chat context.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<void>}
 */
export const clearChatContext = async ({ chromeApi = globalThis.chrome } = {}) => {
  if (!hasSessionStorage(chromeApi)) {
    return;
  }

  await sessionRemove(STORAGE_KEY_CHAT_CONTEXT, chromeApi);
};

/**
 * Loads the active chat request ID used for abort lookup.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<string>}
 */
export const loadCurrentChatRequestId = async (
  { chromeApi = globalThis.chrome } = {},
) => loadRequestId(STORAGE_KEY_CURRENT_CHAT_REQUEST_ID, chromeApi);

/**
 * Saves the active chat request ID used for abort lookup.
 * @param {string} requestId - Active chat request ID.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<string>}
 */
export const saveCurrentChatRequestId = async (
  requestId,
  { chromeApi = globalThis.chrome } = {},
) => saveRequestId(STORAGE_KEY_CURRENT_CHAT_REQUEST_ID, requestId, chromeApi);

/**
 * Clears the active chat request ID.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<void>}
 */
export const clearCurrentChatRequestId = async (
  { chromeApi = globalThis.chrome } = {},
) => clearRequestId(STORAGE_KEY_CURRENT_CHAT_REQUEST_ID, chromeApi);

/**
 * Loads the active summary request ID.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<string>}
 */
export const loadActiveSummaryRequestId = async (
  { chromeApi = globalThis.chrome } = {},
) => loadRequestId(STORAGE_KEY_ACTIVE_SUMMARY_REQUEST_ID, chromeApi);

/**
 * Saves the active summary request ID.
 * @param {string} requestId - Active summary request ID.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<string>}
 */
export const saveActiveSummaryRequestId = async (
  requestId,
  { chromeApi = globalThis.chrome } = {},
) => saveRequestId(STORAGE_KEY_ACTIVE_SUMMARY_REQUEST_ID, requestId, chromeApi);

/**
 * Clears the active summary request ID.
 * @param {object} options - Optional dependencies.
 * @param {object} options.chromeApi - Chrome extension API object.
 * @returns {Promise<void>}
 */
export const clearActiveSummaryRequestId = async (
  { chromeApi = globalThis.chrome } = {},
) => clearRequestId(STORAGE_KEY_ACTIVE_SUMMARY_REQUEST_ID, chromeApi);

/**
 * Normalizes a full chat session payload.
 * @param {object} session - Raw stored session.
 * @returns {object}
 */
export const normalizeChatSession = (session = {}) => ({
  [STORAGE_KEY_CHAT_CONTEXT]: normalizeChatContext(
    session?.[STORAGE_KEY_CHAT_CONTEXT],
  ),
  [STORAGE_KEY_CURRENT_CHAT_REQUEST_ID]: normalizeRequestId(
    session?.[STORAGE_KEY_CURRENT_CHAT_REQUEST_ID],
  ),
  [STORAGE_KEY_ACTIVE_SUMMARY_REQUEST_ID]: normalizeRequestId(
    session?.[STORAGE_KEY_ACTIVE_SUMMARY_REQUEST_ID],
  ),
});

/**
 * Normalizes selected-content metadata used by the chat page.
 * @param {object} context - Raw context object.
 * @returns {object}
 */
export const normalizeChatContext = (context = {}) => ({
  domSnippet: normalizeText(context?.domSnippet),
  summary: normalizeSummary(context?.summary),
  chatTargetLanguage: normalizeText(context?.chatTargetLanguage),
  modelUsedForSummary: normalizeText(context?.modelUsedForSummary),
  processedMarkdown: normalizeText(context?.processedMarkdown),
});

/**
 * Normalizes request IDs to strings.
 * @param {*} requestId - Raw request ID value.
 * @returns {string}
 */
export const normalizeRequestId = (requestId) =>
  typeof requestId === "string" ? requestId : "";

function createDefaultChatSession() {
  return {
    [STORAGE_KEY_CHAT_CONTEXT]: createDefaultChatContext(),
    [STORAGE_KEY_CURRENT_CHAT_REQUEST_ID]: "",
    [STORAGE_KEY_ACTIVE_SUMMARY_REQUEST_ID]: "",
  };
}

function createDefaultChatContext() {
  return { ...DEFAULT_CHAT_CONTEXT };
}

function normalizeText(value) {
  return typeof value === "string" ? value : "";
}

function normalizeSummary(summary) {
  if (Array.isArray(summary)) {
    return summary.filter((item) => typeof item === "string");
  }

  return normalizeText(summary);
}

async function loadRequestId(storageKey, chromeApi) {
  if (!hasSessionStorage(chromeApi)) {
    return "";
  }

  const storedSession = await sessionGet(storageKey, chromeApi);
  return normalizeRequestId(storedSession[storageKey]);
}

async function saveRequestId(storageKey, requestId, chromeApi) {
  const normalizedRequestId = normalizeRequestId(requestId);
  if (!hasSessionStorage(chromeApi)) {
    return normalizedRequestId;
  }

  await sessionSet({ [storageKey]: normalizedRequestId }, chromeApi);
  return normalizedRequestId;
}

async function clearRequestId(storageKey, chromeApi) {
  if (!hasSessionStorage(chromeApi)) {
    return;
  }

  await sessionRemove(storageKey, chromeApi);
}

function sessionGet(keys, chromeApi) {
  return callSessionStorage("get", keys, chromeApi);
}

function sessionSet(items, chromeApi) {
  return callSessionStorage("set", items, chromeApi);
}

function sessionRemove(keys, chromeApi) {
  return callSessionStorage("remove", keys, chromeApi);
}

function callSessionStorage(methodName, payload, chromeApi) {
  const sessionStorage = chromeApi.storage.session;

  return new Promise((resolve, reject) => {
    const callback = (result) => {
      const lastError = chromeApi?.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message || String(lastError)));
        return;
      }

      resolve(result || {});
    };

    try {
      const maybePromise = sessionStorage[methodName](payload, callback);
      if (maybePromise?.then) {
        maybePromise.then(resolve, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}
