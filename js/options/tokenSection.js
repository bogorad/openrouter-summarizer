// js/options/tokenSection.js
// Loads, saves, and manages token fields on the options page.

import {
  loadJoplinToken,
  loadNewsblurToken,
  loadOpenRouterApiKey,
  saveJoplinToken,
  saveNewsblurToken,
  saveOpenRouterApiKey,
} from "../state/secretStore.js";

const TOKEN_SAVE_DEBOUNCE_MS = 300;
const TOKEN_DECRYPT_FAILURE_PLACEHOLDER =
  "Stored token could not be decrypted. Re-enter to replace it.";

const originalInputPlaceholders = new WeakMap();

const getInputValue = (input) => (input ? input.value.trim() : "");

const rememberInputPlaceholder = (input) => {
  if (!input || originalInputPlaceholders.has(input)) return;
  originalInputPlaceholders.set(input, input.placeholder || "");
};

const setTokenLoadFailure = (input, error) => {
  if (!input) return;
  rememberInputPlaceholder(input);
  input.placeholder = TOKEN_DECRYPT_FAILURE_PLACEHOLDER;
  input.title = error || TOKEN_DECRYPT_FAILURE_PLACEHOLDER;
  input.setAttribute?.("aria-invalid", "true");
  input.setCustomValidity?.(TOKEN_DECRYPT_FAILURE_PLACEHOLDER);
};

const clearTokenLoadFailure = (input) => {
  if (!input) return;
  rememberInputPlaceholder(input);
  input.placeholder = originalInputPlaceholders.get(input) || "";
  input.title = "";
  input.removeAttribute?.("aria-invalid");
  input.setCustomValidity?.("");
};

const maskToken = (token) => {
  if (!token || token.length <= 4) return "****";
  const firstTwo = token.substring(0, 2);
  const lastTwo = token.substring(token.length - 2);
  const middle = "*".repeat(token.length - 4);
  return `${firstTwo}${middle}${lastTwo}`;
};

/**
 * Extracts a NewsBlur token from a direct token, URL, or bookmarklet.
 *
 * Called by: token section input handling and tests.
 *
 * @param {string} value
 * @param {object} options
 * @returns {string}
 */
export const extractNewsblurToken = (
  value,
  { onDebug = () => false, log = console.log, warn = console.warn } = {},
) => {
  const tokenValue = typeof value === "string" ? value.trim() : "";
  let extractedToken = null;

  const bookmarkletRegex =
    /https:\/\/www\.newsblur\.com\/api\/add_site_load_script\/([a-z0-9]+)\?url=/;
  const bookmarkletMatch = tokenValue.match(bookmarkletRegex);

  if (bookmarkletMatch && bookmarkletMatch[1]) {
    extractedToken = bookmarkletMatch[1];
    if (onDebug()) {
      log(
        "[LLM Options] Extracted NewsBlur token from bookmarklet URL (alphanumeric only):",
        maskToken(extractedToken),
      );
    }
  } else if (
    tokenValue.startsWith("http://") ||
    tokenValue.startsWith("https://")
  ) {
    try {
      const url = new URL(tokenValue);
      const pathRegex = /\/[a-z_]+\/[a-z_]+\/([a-zA-Z0-9_-]+)(?:[\/\?#]|$)/;
      const pathMatch = url.pathname.match(pathRegex);
      if (pathMatch && pathMatch[1]) {
        extractedToken = pathMatch[1];
      }

      if (!extractedToken && url.searchParams.has("token")) {
        extractedToken = url.searchParams.get("token");
      } else if (!extractedToken && url.searchParams.has("secret")) {
        extractedToken = url.searchParams.get("secret");
      }
      if (onDebug() && extractedToken) {
        log(
          "[LLM Options] Extracted NewsBlur token from direct HTTP/HTTPS URL:",
          maskToken(extractedToken),
        );
      }
    } catch (error) {
      if (onDebug()) console.warn("[LLM Options] Error parsing direct URL:", error);
    }
  }

  if (extractedToken && extractedToken.toUpperCase() !== "NB") {
    if (!/^[a-zA-Z0-9_-]+$/.test(extractedToken)) {
      if (onDebug()) {
        warn(
          "[LLM Options] Extracted token failed general validation (alphanumeric, hyphen, underscore):",
          maskToken(extractedToken),
        );
      }
      extractedToken = null;
    }
  } else if (
    !extractedToken &&
    /^[a-zA-Z0-9_-]+$/.test(tokenValue) &&
    tokenValue.toUpperCase() !== "NB"
  ) {
    extractedToken = tokenValue;
    if (onDebug()) {
      log(
        "[LLM Options] Input assumed to be a direct NewsBlur token (alphanumeric, hyphen, underscore):",
        maskToken(extractedToken),
      );
    }
  } else {
    if (onDebug()) {
      log(
        "[LLM Options] Could not extract or identify a valid NewsBlur token from input:",
        maskToken(tokenValue),
      );
    }
    extractedToken = null;
  }

  return extractedToken || "";
};

/**
 * Creates the token section controller used by options.js.
 *
 * Call sites: options.js DOMContentLoaded initialization.
 *
 * @param {object} options
 * @returns {object}
 */
export const createOptionsTokenSection = ({
  apiKeyInput,
  newsblurTokenInput,
  joplinTokenInput,
  alsoSendToJoplinCheckbox,
  state,
  debounceDelay = TOKEN_SAVE_DEBOUNCE_MS,
  onSaveSettings = () => {},
  onApiKeyEntered = () => {},
  onDebug = () => false,
  loadOpenRouterApiKeyFn = loadOpenRouterApiKey,
  loadNewsblurTokenFn = loadNewsblurToken,
  loadJoplinTokenFn = loadJoplinToken,
} = {}) => {
  let debounceTimeoutId = null;

  const setInputsFromState = () => {
    if (apiKeyInput) apiKeyInput.value = state.tokens.apiKey;
    if (newsblurTokenInput) newsblurTokenInput.value = state.tokens.newsblurToken;
    if (joplinTokenInput) joplinTokenInput.value = state.tokens.joplinToken;
  };

  const syncStateFromInputs = ({ dirty = true } = {}) => {
    state.setTokens(
      {
        apiKey: getInputValue(apiKeyInput),
        newsblurToken: getInputValue(newsblurTokenInput),
        joplinToken: getInputValue(joplinTokenInput),
      },
      { dirty },
    );
  };

  const updateJoplinCheckboxState = ({
    checkWhenEnabled = false,
    dirty = true,
  } = {}) => {
    if (!alsoSendToJoplinCheckbox || !newsblurTokenInput) return;
    const hasToken = getInputValue(newsblurTokenInput) !== "";
    alsoSendToJoplinCheckbox.disabled = !hasToken;
    if (hasToken && checkWhenEnabled) {
      alsoSendToJoplinCheckbox.checked = true;
    } else if (!hasToken) {
      alsoSendToJoplinCheckbox.checked = false;
    }
    state.setAlsoSendToJoplin?.(alsoSendToJoplinCheckbox.checked, { dirty });
  };

  const setAlsoSendToJoplin = (value, { dirty = false } = {}) => {
    if (alsoSendToJoplinCheckbox) {
      alsoSendToJoplinCheckbox.checked = value === true;
    }
    updateJoplinCheckboxState({ dirty });
  };

  const loadTokens = async () => {
    const [apiKeyResult, newsblurResult, joplinResult] = await Promise.all([
      loadOpenRouterApiKeyFn(),
      loadNewsblurTokenFn(),
      loadJoplinTokenFn(),
    ]);

    const loadedTokens = {};
    if (!apiKeyResult.success) {
      console.error("[Options] Failed to decrypt API key:", apiKeyResult.error);
      setTokenLoadFailure(apiKeyInput, apiKeyResult.error);
    } else {
      loadedTokens.apiKey = apiKeyResult.data;
      clearTokenLoadFailure(apiKeyInput);
    }
    if (!newsblurResult.success) {
      console.error(
        "[Options] Failed to decrypt NewsBlur token:",
        newsblurResult.error,
      );
      setTokenLoadFailure(newsblurTokenInput, newsblurResult.error);
    } else {
      loadedTokens.newsblurToken = newsblurResult.data;
      clearTokenLoadFailure(newsblurTokenInput);
    }
    if (!joplinResult.success) {
      console.error("[Options] Failed to decrypt Joplin token:", joplinResult.error);
      setTokenLoadFailure(joplinTokenInput, joplinResult.error);
    } else {
      loadedTokens.joplinToken = joplinResult.data;
      clearTokenLoadFailure(joplinTokenInput);
    }

    state.setTokens(loadedTokens, { dirty: false });
    setInputsFromState();
  };

  const saveTokens = async () => {
    const secretResults = await Promise.all([
      saveOpenRouterApiKey(state.tokens.apiKey),
      saveNewsblurToken(state.tokens.newsblurToken),
      saveJoplinToken(state.tokens.joplinToken),
    ]);
    const failedSecret = secretResults.find((result) => !result.success);

    if (failedSecret) {
      throw new Error(failedSecret.error || "Unable to save encrypted token.");
    }
  };

  const saveAfterDebounce = (callback = () => {}) => {
    if (debounceTimeoutId) clearTimeout(debounceTimeoutId);
    debounceTimeoutId = setTimeout(() => {
      syncStateFromInputs();
      onSaveSettings();
      callback();
      debounceTimeoutId = null;
    }, debounceDelay);
  };

  const handleNewsblurTokenInput = () => {
    clearTokenLoadFailure(newsblurTokenInput);
    if (debounceTimeoutId) clearTimeout(debounceTimeoutId);
    debounceTimeoutId = setTimeout(() => {
      const tokenValue = extractNewsblurToken(getInputValue(newsblurTokenInput), {
        onDebug,
      });
      if (newsblurTokenInput) newsblurTokenInput.value = tokenValue;
      updateJoplinCheckboxState({ checkWhenEnabled: tokenValue !== "" });
      syncStateFromInputs();
      onSaveSettings();
      debounceTimeoutId = null;
    }, debounceDelay);
  };

  const handleApiAndJoplinInput = (event) => {
    clearTokenLoadFailure(event.target);
    saveAfterDebounce(() => {
      if (event.target.id !== "apiKey") return;
      const apiKey = getInputValue(apiKeyInput);
      if (apiKey) {
        if (onDebug()) {
          console.log(
            "[LLM Options] API key entered, triggering model refresh after debounce.",
          );
        }
        onApiKeyEntered();
        return;
      }

      if (onDebug()) {
        console.log("[LLM Options] API key is empty, skipping model refresh.");
      }
    });
  };

  const attach = () => {
    if (apiKeyInput) {
      apiKeyInput.addEventListener("input", handleApiAndJoplinInput);
      apiKeyInput.addEventListener("blur", handleApiAndJoplinInput);
    } else {
      console.error("[LLM Options] API Key input field not found.");
    }

    if (joplinTokenInput) {
      joplinTokenInput.addEventListener("input", handleApiAndJoplinInput);
      joplinTokenInput.addEventListener("blur", handleApiAndJoplinInput);
    } else {
      console.error("[LLM Options] Joplin Token input field not found.");
    }

    if (newsblurTokenInput) {
      newsblurTokenInput.addEventListener("input", handleNewsblurTokenInput);
      newsblurTokenInput.addEventListener("blur", handleNewsblurTokenInput);
    } else {
      console.error("[LLM Options] NewsBlur Token input field not found.");
    }
  };

  return {
    attach,
    loadTokens,
    saveTokens,
    setAlsoSendToJoplin,
    syncStateFromInputs,
    updateJoplinCheckboxState,
  };
};
