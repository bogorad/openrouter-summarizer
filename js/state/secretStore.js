/**
 * @fileoverview Central encrypted secret helpers for API and integration
 * tokens.
 *
 * Secrets are stored encrypted in chrome.storage.local. UI-safe callers should
 * use capability helpers; privileged background flows can request raw tokens
 * through explicit load helpers.
 */

import {
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_JOPLIN_TOKEN_LOCAL,
  STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
} from "../../constants.js";
import {
  decryptSensitiveData,
  encryptSensitiveData,
} from "../encryption.js";

export const SECRET_OPENROUTER_API_KEY = "openRouterApiKey";
export const SECRET_JOPLIN_TOKEN = "joplinToken";
export const SECRET_NEWSBLUR_TOKEN = "newsblurToken";

const SECRET_DEFINITIONS = Object.freeze({
  [SECRET_OPENROUTER_API_KEY]: Object.freeze({
    storageKey: STORAGE_KEY_API_KEY_LOCAL,
    capabilityKey: "hasApiKey",
    label: "OpenRouter API key",
  }),
  [SECRET_JOPLIN_TOKEN]: Object.freeze({
    storageKey: STORAGE_KEY_JOPLIN_TOKEN_LOCAL,
    capabilityKey: "hasJoplinToken",
    label: "Joplin token",
  }),
  [SECRET_NEWSBLUR_TOKEN]: Object.freeze({
    storageKey: STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
    capabilityKey: "hasNewsblurToken",
    label: "NewsBlur token",
  }),
});

const EMPTY_SECRET_RESULT = Object.freeze({
  success: true,
  data: "",
  error: null,
});

/**
 * Returns metadata for supported secrets.
 *
 * @returns {Readonly<Record<string, {storageKey: string, capabilityKey: string, label: string}>>}
 * Called by: future settings and background state migration code.
 */
export const getSecretDefinitions = () => SECRET_DEFINITIONS;

/**
 * Checks whether chrome.storage.local is available in the current context.
 *
 * @returns {boolean} True when encrypted local secret storage is usable.
 * Called by: secretStore helpers and tests.
 */
export const hasSecretStorage = (chromeApi = globalThis.chrome) => {
  return Boolean(
    chromeApi?.storage?.local &&
      typeof chromeApi.storage.local.get === "function" &&
      typeof chromeApi.storage.local.set === "function" &&
      typeof chromeApi.storage.local.remove === "function",
  );
};

/**
 * Saves the OpenRouter API key.
 *
 * @param {string} apiKey Plaintext API key.
 * @returns {Promise<{success: boolean, error: string|null}>}
 * Called by: future options/state migration code.
 */
export const saveOpenRouterApiKey = (apiKey) => {
  return saveSecret(SECRET_OPENROUTER_API_KEY, apiKey);
};

/**
 * Saves the Joplin token.
 *
 * @param {string} token Plaintext token.
 * @returns {Promise<{success: boolean, error: string|null}>}
 * Called by: future options/state migration code.
 */
export const saveJoplinToken = (token) => {
  return saveSecret(SECRET_JOPLIN_TOKEN, token);
};

/**
 * Saves the NewsBlur token.
 *
 * @param {string} token Plaintext token.
 * @returns {Promise<{success: boolean, error: string|null}>}
 * Called by: future options/state migration code.
 */
export const saveNewsblurToken = (token) => {
  return saveSecret(SECRET_NEWSBLUR_TOKEN, token);
};

/**
 * Loads the OpenRouter API key for privileged background flows.
 *
 * @returns {Promise<{success: boolean, data: string, error: string|null}>}
 * Called by: future background service handlers.
 */
export const loadOpenRouterApiKey = () => {
  return loadSecret(SECRET_OPENROUTER_API_KEY);
};

/**
 * Loads the Joplin token for privileged background flows.
 *
 * @returns {Promise<{success: boolean, data: string, error: string|null}>}
 * Called by: future background service handlers.
 */
export const loadJoplinToken = () => {
  return loadSecret(SECRET_JOPLIN_TOKEN);
};

/**
 * Loads the NewsBlur token for privileged background flows.
 *
 * @returns {Promise<{success: boolean, data: string, error: string|null}>}
 * Called by: future background service handlers.
 */
export const loadNewsblurToken = () => {
  return loadSecret(SECRET_NEWSBLUR_TOKEN);
};

/**
 * Removes the OpenRouter API key from encrypted local storage.
 *
 * @returns {Promise<{success: boolean, error: string|null}>}
 * Called by: future options/state migration code.
 */
export const removeOpenRouterApiKey = () => {
  return removeSecret(SECRET_OPENROUTER_API_KEY);
};

/**
 * Removes the Joplin token from encrypted local storage.
 *
 * @returns {Promise<{success: boolean, error: string|null}>}
 * Called by: future options/state migration code.
 */
export const removeJoplinToken = () => {
  return removeSecret(SECRET_JOPLIN_TOKEN);
};

/**
 * Removes the NewsBlur token from encrypted local storage.
 *
 * @returns {Promise<{success: boolean, error: string|null}>}
 * Called by: future options/state migration code.
 */
export const removeNewsblurToken = () => {
  return removeSecret(SECRET_NEWSBLUR_TOKEN);
};

/**
 * Returns UI-safe capability flags without exposing plaintext secrets.
 *
 * @returns {Promise<{hasApiKey: boolean, hasJoplinToken: boolean, hasNewsblurToken: boolean}>}
 * Called by: future settingsStore/settingsManager migration code.
 */
export const getSecretCapabilities = async ({ chromeApi = globalThis.chrome } = {}) => {
  const entries = await Promise.all(
    Object.entries(SECRET_DEFINITIONS).map(async ([secretName, definition]) => {
      const result = await loadSecret(secretName, { chromeApi });
      return [
        definition.capabilityKey,
        result.success && typeof result.data === "string" && result.data.trim() !== "",
      ];
    }),
  );

  return Object.fromEntries(entries);
};

/**
 * Saves a named secret after encrypting it.
 *
 * @param {string} secretName Supported secret identifier.
 * @param {string} plaintext Plaintext secret value.
 * @returns {Promise<{success: boolean, error: string|null}>}
 * Called by: exported per-secret save helpers.
 */
export const saveSecret = async (
  secretName,
  plaintext,
  { chromeApi = globalThis.chrome } = {},
) => {
  const definition = getSecretDefinition(secretName);
  if (!definition.success) {
    return definition;
  }

  if (!hasSecretStorage(chromeApi)) {
    return {
      success: false,
      error: "chrome.storage.local is unavailable.",
    };
  }

  try {
    const normalizedPlaintext =
      typeof plaintext === "string" ? plaintext.trim() : "";
    const encrypted = normalizedPlaintext
      ? await encryptSensitiveData(normalizedPlaintext)
      : "";

    await chromeApi.storage.local.set({
      [definition.data.storageKey]: encrypted,
    });

    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: createSecretErrorMessage("save", definition.data.label, error),
    };
  }
};

/**
 * Loads and decrypts a named secret for privileged service code.
 *
 * @param {string} secretName Supported secret identifier.
 * @returns {Promise<{success: boolean, data: string, error: string|null}>}
 * Called by: exported per-secret load helpers and capability checks.
 */
export const loadSecret = async (
  secretName,
  { chromeApi = globalThis.chrome } = {},
) => {
  const definition = getSecretDefinition(secretName);
  if (!definition.success) {
    return {
      success: false,
      data: "",
      error: definition.error,
    };
  }

  if (!hasSecretStorage(chromeApi)) {
    return EMPTY_SECRET_RESULT;
  }

  try {
    const stored = await chromeApi.storage.local.get(
      definition.data.storageKey,
    );
    const encrypted = stored[definition.data.storageKey];
    return decryptSensitiveData(encrypted);
  } catch (error) {
    return {
      success: false,
      data: "",
      error: createSecretErrorMessage("load", definition.data.label, error),
    };
  }
};

/**
 * Removes a named secret from encrypted local storage.
 *
 * @param {string} secretName Supported secret identifier.
 * @returns {Promise<{success: boolean, error: string|null}>}
 * Called by: exported per-secret remove helpers.
 */
export const removeSecret = async (
  secretName,
  { chromeApi = globalThis.chrome } = {},
) => {
  const definition = getSecretDefinition(secretName);
  if (!definition.success) {
    return definition;
  }

  if (!hasSecretStorage(chromeApi)) {
    return { success: true, error: null };
  }

  try {
    await chromeApi.storage.local.remove(definition.data.storageKey);
    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: createSecretErrorMessage("remove", definition.data.label, error),
    };
  }
};

function getSecretDefinition(secretName) {
  const definition = SECRET_DEFINITIONS[secretName];
  if (definition) {
    return {
      success: true,
      data: definition,
      error: null,
    };
  }

  return {
    success: false,
    error: `Unsupported secret: ${secretName}`,
  };
}

function createSecretErrorMessage(operation, label, error) {
  const detail = error?.message || String(error);
  return `Failed to ${operation} ${label}: ${detail}`;
}
