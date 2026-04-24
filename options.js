// options.js

import {
  STORAGE_KEY_PROMPT_TEMPLATE,
  DEFAULT_XML_PROMPT_TEMPLATE,
  STORAGE_KEY_ALWAYS_USE_US_ENGLISH,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_MAX_REQUEST_PRICE,
  STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
  DEFAULT_CACHE_EXPIRY_DAYS,
  DEBOUNCE_DELAY,
  TOKENS_PER_KB,
  NOTIFICATION_TIMEOUT_MINOR_MS,
} from "./constants.js";
import * as constants from "./constants.js";
import {
  loadStorageArea,
  saveSettings as saveStoredSettings,
  saveStorageArea,
  SETTINGS_STORAGE_AREA_LOCAL,
  loadSettings as loadStoredSettings,
} from "./js/state/settingsStore.js";
import { RuntimeMessageActions } from "./js/messaging/actions.js";
import { sendRuntimeAction } from "./js/messaging/runtimeClient.js";
import {
  createOptionsModelSection,
  getBaseModelId,
} from "./js/options/modelSection.js";
import { createOptionsLanguageSection } from "./js/options/languageSection.js";
import {
  createOptionsQuickPromptSection,
  normalizeQuickPromptsForSave,
} from "./js/options/quickPromptSection.js";
import { createOptionsState } from "./js/options/optionsState.js";
import { createOptionsPromptSection } from "./js/options/promptSection.js";
import { createOptionsTokenSection } from "./js/options/tokenSection.js";
import { showError, redactSensitiveData } from "./utils.js";

console.log("[LLM Options] Script Start v3.9.44");

document.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("apiKey");
  const newsblurTokenInput = document.getElementById("newsblurToken");
  const joplinTokenInput = document.getElementById("joplinToken"); // New: Joplin Token Input
  const alsoSendToJoplinCheckbox = document.getElementById("alsoSendToJoplin");
  const modelSelectionArea = document.getElementById("modelSelectionArea");
  const addModelBtn = document.getElementById("addModelBtn");
  const languageSelectionArea = document.getElementById(
    "languageSelectionArea",
  );
  const addLangBtn = document.getElementById("addLangBtn");
  const chatQuickPromptSelectionArea = document.getElementById(
    "chatQuickPromptSelectionArea",
  );
  const addChatQuickPromptBtn = document.getElementById(
    "addChatQuickPromptBtn",
  );
  const debugCheckbox = document.getElementById("debug");
  const bulletCountRadios = document.querySelectorAll(
    'input[name="bulletCount"]',
  );
  const resetButton = document.getElementById("resetDefaultsBtn");
  const statusMessage = document.getElementById("status");
  const promptPrefixReadonly = document.getElementById("promptPrefixReadonly");
  const promptUserFormattingEditable = document.getElementById(
    "promptUserFormattingEditable",
  );
  const promptSuffixReadonly = document.getElementById("promptSuffixReadonly");
  const alwaysUseUsEnglishCheckbox = document.getElementById("alwaysUseUsEnglish");
  const maxKbDisplay = document.getElementById("maxKbDisplay");
  const updatePricingBtn = document.getElementById("updatePricingBtn");
  const pricingNotification = document.getElementById("pricingNotification");

  const DEFAULT_BULLET_COUNT = "5";
  const DEFAULT_DEBUG_MODE = false;
  const DEFAULT_MAX_PRICE_BEHAVIOR = "truncate";
  const STORAGE_KEY_MAX_PRICE_BEHAVIOR = "maxPriceBehavior";
  const STORAGE_KEY_ALSO_SEND_TO_JOPLIN = "alsoSendToJoplin";
  const NUM_TO_WORD = {
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
  };
  const MAX_MODELS = 10;
  const MAX_LANGUAGES = 5;
  const MAX_CHAT_QUICK_PROMPTS = 10;
  const STORAGE_KEY_MAX_REQUEST_PRICE = "maxRequestPrice";
  const STORAGE_KEY_PRICING_CACHE = "modelPricingCache";
  const MAX_PRICE_INPUT_DEBOUNCE_MS = 1000;
  const STORAGE_KEY_CHAT_QUICK_PROMPTS =
    typeof constants.STORAGE_KEY_CHAT_QUICK_PROMPTS === "string"
      ? constants.STORAGE_KEY_CHAT_QUICK_PROMPTS
      : "chatQuickPrompts";
  const DEFAULT_CHAT_QUICK_PROMPTS = Array.isArray(
    constants.DEFAULT_CHAT_QUICK_PROMPTS,
  )
    ? constants.DEFAULT_CHAT_QUICK_PROMPTS
    : [];

  const optionsState = createOptionsState({
    models: [],
    summaryModelId: "",
    chatModelId: "",
    languages: [],
    quickPrompts: [],
    promptTemplate: DEFAULT_XML_PROMPT_TEMPLATE,
    maxRequestPrice: DEFAULT_MAX_REQUEST_PRICE,
    maxPriceBehavior: DEFAULT_MAX_PRICE_BEHAVIOR,
    debug: DEFAULT_DEBUG_MODE,
    bulletCount: DEFAULT_BULLET_COUNT,
    alwaysUseUsEnglish: true,
    alsoSendToJoplin: false,
  });
  let maxPriceDebounceTimeoutId = null;
  let allLanguages = []; // For autocomplete suggestions for languages
  let allModels = []; // For autocomplete suggestions for models

  function getDefaultChatQuickPrompts() {
    return normalizeQuickPromptsForSave(DEFAULT_CHAT_QUICK_PROMPTS, {
      maxQuickPrompts: MAX_CHAT_QUICK_PROMPTS,
    });
  }

  const modelSection = createOptionsModelSection({
    container: modelSelectionArea,
    addButton: addModelBtn,
    state: optionsState,
    maxModels: MAX_MODELS,
    getAutocompleteModels: () => allModels,
    hasApiKey: () => (apiKeyInput ? apiKeyInput.value.trim() !== "" : false),
    onPricingRecalculate: () => calculateKbLimitForSummary(),
    onCheckPricingData: () => checkPricingData(),
    onRefreshKnownModels: () =>
      refreshKnownModelsAndPricesAndUpdateUi({ shouldSaveSettings: false }),
    onSaveSettings: () => saveSettings(),
    onDebug: () => optionsState.debug,
    alertUser: (message) => alert(message),
  });

  const languageSection = createOptionsLanguageSection({
    container: languageSelectionArea,
    addButton: addLangBtn,
    state: optionsState,
    maxLanguages: MAX_LANGUAGES,
    getAutocompleteLanguages: () => allLanguages,
    onDebug: () => optionsState.debug,
    alertUser: (message) => alert(message),
  });

  const quickPromptSection = createOptionsQuickPromptSection({
    container: chatQuickPromptSelectionArea,
    addButton: addChatQuickPromptBtn,
    state: optionsState,
    maxQuickPrompts: MAX_CHAT_QUICK_PROMPTS,
    onSaveSettings: () => saveSettings(),
    alertUser: (message) => alert(message),
  });

  const promptSection = createOptionsPromptSection({
    prefixElement: promptPrefixReadonly,
    editableElement: promptUserFormattingEditable,
    suffixElement: promptSuffixReadonly,
    state: optionsState,
    onSaveSettings: () => saveSettings(),
    onDebug: () => optionsState.debug,
  });

  const tokenSection = createOptionsTokenSection({
    apiKeyInput,
    newsblurTokenInput,
    joplinTokenInput,
    alsoSendToJoplinCheckbox,
    state: optionsState,
    debounceDelay: DEBOUNCE_DELAY,
    onSaveSettings: () => saveSettings(),
    onApiKeyEntered: () => updateKnownModelsAndPricing(),
    onDebug: () => optionsState.debug,
  });

  // --- Price Limit Calculation and Display ---
  /**
   * Calculates the KB limit for the current summary model based on cached or fetched pricing data.
   */
  async function calculateKbLimitForSummary() {
    if (!maxKbDisplay) return;

    maxKbDisplay.textContent = `max price: ${optionsState.maxRequestPrice.toFixed(3)} max KiB: Calculating...`;
    optionsState.summaryKbLimit = "";

    if (!optionsState.summaryModelId) {
      maxKbDisplay.innerHTML = `
        <table class="price-kb-table">
          <thead>
            <tr>
              <th>Max Price (USD)</th>
              <th>Max KiB</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><input type="number" id="maxPriceInput" step="0.001" min="0" value="${optionsState.maxRequestPrice.toFixed(3)}" style="width: 80px;"></td>
              <td>No model selected</td>
            </tr>
          </tbody>
        </table>
      `;
      document
        .getElementById("maxPriceInput")
        .addEventListener("input", handleMaxPriceInput);
      document
        .getElementById("maxPriceInput")
        .addEventListener("blur", handleMaxPriceBlur);
      optionsState.summaryKbLimit = "";
      return;
    }

    const baseSummaryModelId = getBaseModelId(optionsState.summaryModelId);
    const modelData = optionsState.knownModelsAndPrices[baseSummaryModelId];
    const currentTime = Date.now();
    const cacheExpiry = DEFAULT_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    if (modelData && currentTime - modelData.timestamp < cacheExpiry) {
      const pricePerToken = modelData.pricePerToken || 0;
      let kbLimit = "Calculating...";
      if (pricePerToken === 0) {
        optionsState.summaryKbLimit = "No limit";
        kbLimit = "No limit";
      } else if (optionsState.maxRequestPrice === 0) {
        optionsState.summaryKbLimit = "0";
        kbLimit = "0";
      } else {
        const maxTokens = optionsState.maxRequestPrice / pricePerToken;
        const maxKb = Math.round(maxTokens / TOKENS_PER_KB);
        optionsState.summaryKbLimit = maxKb.toString();
        kbLimit = `~${maxKb}`;
      }
      maxKbDisplay.innerHTML = `
        <table class="price-kb-table">
          <thead>
            <tr>
              <th>Max Price (USD)</th>
              <th>Max KiB</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><input type="number" id="maxPriceInput" step="0.001" min="0" value="${optionsState.maxRequestPrice.toFixed(3)}" style="width: 80px;"></td>
              <td>${kbLimit}</td>
            </tr>
          </tbody>
        </table>
      `;
      document
        .getElementById("maxPriceInput")
        .addEventListener("input", handleMaxPriceInput);
      document
        .getElementById("maxPriceInput")
        .addEventListener("blur", handleMaxPriceBlur);
      if (optionsState.debug)
        console.log(
          "[LLM Options] Used cached data for ${optionsState.summaryModelId}:",
          redactSensitiveData(modelData),
        );
      return;
    }

    try {
      const { response } = await sendRuntimeAction(
        RuntimeMessageActions.getModelPricing,
        { modelId: baseSummaryModelId },
      );

      if (!response || response.status !== "success") {
        maxKbDisplay.textContent = `max price: ${optionsState.maxRequestPrice.toFixed(2)} max KiB: Pricing unavailable`;
        optionsState.summaryKbLimit = "";
        if (optionsState.debug)
          console.error(
            "[LLM Options] Error fetching model pricing:",
            response?.message || "No response",
          );
        return;
      }

        const pricePerToken = response.pricePerToken || 0;
        optionsState.pricingCache[optionsState.summaryModelId] = {
          pricePerToken,
          timestamp: currentTime,
        };
        await saveStorageArea(SETTINGS_STORAGE_AREA_LOCAL, {
          [STORAGE_KEY_PRICING_CACHE]: optionsState.pricingCache,
        });
        if (optionsState.debug)
          console.log(
            `[LLM Options] Updated pricing cache for ${optionsState.summaryModelId}`,
          );

        let kbLimit = "Calculating...";
        if (pricePerToken === 0) {
          optionsState.summaryKbLimit = "No limit";
          kbLimit = "No limit";
        } else if (optionsState.maxRequestPrice === 0) {
          optionsState.summaryKbLimit = "0";
          kbLimit = "0";
        } else {
          const maxTokens = optionsState.maxRequestPrice / pricePerToken;
          const maxKb = Math.round(maxTokens / TOKENS_PER_KB);
          optionsState.summaryKbLimit = maxKb.toString();
          kbLimit = `~${maxKb}`;
        }
        maxKbDisplay.innerHTML = `
        <table class="price-kb-table">
          <thead>
            <tr>
              <th>Max Price (USD)</th>
              <th>Max KiB</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><input type="number" id="maxPriceInput" step="0.001" min="0" value="${optionsState.maxRequestPrice.toFixed(3)}" style="width: 80px;"></td>
              <td>${kbLimit}</td>
            </tr>
          </tbody>
        </table>
      `;
        document
          .getElementById("maxPriceInput")
          .addEventListener("input", handleMaxPriceInput);
        document
          .getElementById("maxPriceInput")
          .addEventListener("blur", handleMaxPriceBlur);
    } catch (error) {
      maxKbDisplay.textContent = `max price: ${optionsState.maxRequestPrice.toFixed(2)} max KiB: Pricing unavailable`;
      optionsState.summaryKbLimit = "";
      if (optionsState.debug)
        console.error(
          "[LLM Options] Error fetching model pricing:",
          error,
        );
    }
  }
  // --- Pricing Data Check and Update Functions ---
  /**
   * Checks if model and pricing data is available and updates the notification UI.
   * Triggers an automatic update if data is missing or expired.
   */
  function checkModelAndPricingData() {
    if (!pricingNotification) return;

    const currentTime = Date.now();
    const cacheExpiry = DEFAULT_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    let isDataExpired = true;

    if (Object.keys(optionsState.knownModelsAndPrices).length > 0) {
      const firstModel = Object.values(optionsState.knownModelsAndPrices)[0];
      if (firstModel && firstModel.timestamp) {
        isDataExpired = currentTime - firstModel.timestamp >= cacheExpiry;
      }
    }

    if (Object.keys(optionsState.knownModelsAndPrices).length === 0 || isDataExpired) {
      pricingNotification.textContent =
        "Model and pricing data missing or expired. Fetching data...";
      updateKnownModelsAndPricing();
    } else {
      pricingNotification.textContent = "Model and pricing data up to date.";
      validateCurrentModels();
      updateAllModelsList(); // Update autocomplete list after data is confirmed
    }
  }

  /**
   * Updates model and pricing data for all models by fetching from the API.
   * Saves settings if the API key is valid and refresh is successful.
   */
  async function refreshKnownModelsAndPricesAndUpdateUi(
    { shouldSaveSettings = true } = {},
  ) {
    if (!pricingNotification || !updatePricingBtn) return;
    if (updatePricingBtn.disabled) return;

    updatePricingBtn.disabled = true;
    pricingNotification.textContent = "Fetching model and pricing data...";

    try {
      const { response } = await sendRuntimeAction(
        RuntimeMessageActions.updateKnownModelsAndPricing,
      );

      if (!response || response.status !== "success") {
        pricingNotification.textContent = `Error updating data: ${response?.message || "Unknown error"}`;
        if (optionsState.debug)
          console.error(
            "[LLM Options] Error updating model and pricing data:",
            response?.message || "No response",
          );
        updatePricingBtn.disabled = false;
        return;
      }

        const updated = response.updated || 0;
        pricingNotification.textContent = shouldSaveSettings
          ? `Updated data for ${updated} model(s). Settings saved.`
          : `Updated data for ${updated} model(s).`;
        if (optionsState.debug)
          console.log(`[LLM Options] Updated data for ${updated} models.`);

        const cacheData = await loadStorageArea(
          SETTINGS_STORAGE_AREA_LOCAL,
          STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
        );
        optionsState.knownModelsAndPrices =
          cacheData[STORAGE_KEY_KNOWN_MODELS_AND_PRICES] || {};
        if (optionsState.debug)
          console.log(
            "[LLM Options] Reloaded model and pricing data:",
            redactSensitiveData(optionsState.knownModelsAndPrices),
          );
        calculateKbLimitForSummary(); // Recalculate KB limit after updating data
        validateCurrentModels(); // Validate models after update
        updateAllModelsList(); // Update autocomplete list after data refresh

        if (shouldSaveSettings && apiKeyInput && apiKeyInput.value.trim()) {
          if (optionsState.debug)
            console.log(
              "[LLM Options] API key validated, saving settings automatically.",
            );
          saveSettings();
        }

      updatePricingBtn.disabled = false;
    } catch (error) {
      pricingNotification.textContent = `Error updating data: ${error.message}`;
      if (optionsState.debug)
        console.error(
          "[LLM Options] Error updating model and pricing data:",
          error,
        );
      updatePricingBtn.disabled = false;
    }
  }

  function updateKnownModelsAndPricing() {
    refreshKnownModelsAndPricesAndUpdateUi({ shouldSaveSettings: true });
  }

  /**
   * Validates current models against known_models_and_prices and updates UI if necessary.
   */
  function validateCurrentModels() {
    if (Object.keys(optionsState.knownModelsAndPrices).length === 0) return;

    const validModelIds = Object.keys(optionsState.knownModelsAndPrices);
    let hasChanged = false;

    // Check summary model
    if (
      optionsState.summaryModelId &&
      !validModelIds.includes(getBaseModelId(optionsState.summaryModelId))
    ) {
      const newSummaryModel = validModelIds.length > 0 ? validModelIds[0] : "";
      if (optionsState.debug)
        console.log(
          `[LLM Options] Summary model ${optionsState.summaryModelId} not compatible, switching to ${newSummaryModel}`,
        );
      optionsState.summaryModelId = newSummaryModel;
      hasChanged = true;
    }

    // Check chat model (optional flexibility)
    if (
      optionsState.chatModelId &&
      !validModelIds.includes(getBaseModelId(optionsState.chatModelId))
    ) {
      const newChatModel = validModelIds.length > 0 ? validModelIds[0] : "";
      if (optionsState.debug)
        console.log(
          `[LLM Options] Chat model ${optionsState.chatModelId} not compatible, switching to ${newChatModel}`,
        );
      optionsState.chatModelId = newChatModel;
      hasChanged = true;
    }

    // Check all configured models and warn if some are not in the known list
    const unknownModels = optionsState.models.filter((model) => {
      const baseModelId = getBaseModelId(model.id);
      return baseModelId && !validModelIds.includes(baseModelId);
    });
    if (unknownModels.length > 0) {
      if (optionsState.debug)
        console.log(`[LLM Options] Unknown models detected:`, unknownModels);
      // Optionally notify user or adjust list
    }

    if (hasChanged) {
      modelSection.render();
    }
  }

  // --- Load, Save, Reset (UPDATED - No Labels) ---
  async function loadSettings() {
    try {
      optionsState.debug = (await loadStoredSettings()).debug ?? DEFAULT_DEBUG_MODE;
    } catch (e) {
      optionsState.debug = DEFAULT_DEBUG_MODE;
    }
    if (optionsState.debug) console.log("[LLM Options] Loading settings...");

    if (statusMessage) {
      statusMessage.textContent = "Loading...";
      statusMessage.className = "status-message";
    }

    try {
      const langDataResponse = await fetch(
        chrome.runtime.getURL("country-flags/languages.json"),
      );
      const langData = await langDataResponse.json();
      allLanguages = Object.keys(langData).map((name) => ({
        name,
        code: langData[name],
      }));

      const data = await loadStoredSettings();

      optionsState.debug = data.debug ?? DEFAULT_DEBUG_MODE;

      await tokenSection.loadTokens();
      if (debugCheckbox) debugCheckbox.checked = optionsState.debug;

      const alsoSendToJoplin = data[STORAGE_KEY_ALSO_SEND_TO_JOPLIN] ?? false;
      tokenSection.setAlsoSendToJoplin(alsoSendToJoplin, { dirty: false });

      // Load language detection setting (default to true = always use US English)
      const alwaysUseUsEnglish = data[STORAGE_KEY_ALWAYS_USE_US_ENGLISH] ?? true;
      if (alwaysUseUsEnglishCheckbox) {
        alwaysUseUsEnglishCheckbox.checked = alwaysUseUsEnglish;
      }

      let countValue = data.bulletCount || DEFAULT_BULLET_COUNT;
      bulletCountRadios.forEach(
        (radio) => (radio.checked = radio.value === countValue),
      );

      // Load models - now expect array of {id: string}
      optionsState.models = data.models || [...DEFAULT_MODEL_OPTIONS];
      // Basic validation: ensure models is an array and items have an 'id'
      if (
        !Array.isArray(optionsState.models) ||
        optionsState.models.some((m) => typeof m.id !== "string")
      ) {
        console.warn(
          "[LLM Options] Loaded models data is invalid, resetting to defaults.",
        );
        optionsState.models = [...DEFAULT_MODEL_OPTIONS];
      }

      optionsState.summaryModelId = data.summaryModelId || "";
      optionsState.chatModelId = data.chatModelId || "";

      const validModelIds = optionsState.models
        .filter((m) => m.id.trim() !== "")
        .map((m) => m.id.trim());
      if (validModelIds.length === 0) {
        optionsState.models = [...DEFAULT_MODEL_OPTIONS]; // Use defaults from constants (already no labels)
        const firstDefaultId =
          optionsState.models.length > 0 ? optionsState.models[0].id : "";
        optionsState.summaryModelId = firstDefaultId;
        optionsState.chatModelId = firstDefaultId;
        if (optionsState.debug)
          console.warn(
            "[LLM Options] No valid models loaded or found, resetting to defaults.",
          );
      } else {
        if (!validModelIds.includes(optionsState.summaryModelId)) {
          optionsState.summaryModelId = validModelIds[0];
          if (optionsState.debug)
            console.warn(
              "[LLM Options] Loaded summary default invalid, resetting to first available.",
            );
        }
        if (!validModelIds.includes(optionsState.chatModelId)) {
          optionsState.chatModelId = validModelIds[0];
          if (optionsState.debug)
            console.warn(
              "[LLM Options] Loaded chat default invalid, resetting to first available.",
            );
        }
      }

      optionsState.languages = data.language_info || [];
      if (optionsState.languages.length === 0) {
        optionsState.languages = languageSection.getDefaultLanguageInfo();
        if (optionsState.debug)
          console.log("[LLM Options] No languages loaded, applying defaults.");
      }

      optionsState.quickPrompts = normalizeQuickPromptsForSave(
        data[STORAGE_KEY_CHAT_QUICK_PROMPTS],
        { maxQuickPrompts: MAX_CHAT_QUICK_PROMPTS },
      );
      if (optionsState.quickPrompts.length === 0) {
        optionsState.quickPrompts = getDefaultChatQuickPrompts();
      }

      optionsState.promptTemplate = data[STORAGE_KEY_PROMPT_TEMPLATE] || DEFAULT_XML_PROMPT_TEMPLATE;
      promptSection.render();

      optionsState.maxRequestPrice =
        data[STORAGE_KEY_MAX_REQUEST_PRICE] || DEFAULT_MAX_REQUEST_PRICE;
      optionsState.maxPriceBehavior =
        data[STORAGE_KEY_MAX_PRICE_BEHAVIOR] || DEFAULT_MAX_PRICE_BEHAVIOR;
      // Handled in calculateKbLimitForSummary

      // Load known models and pricing data from local storage
      const cacheData = await loadStorageArea(SETTINGS_STORAGE_AREA_LOCAL, [
        STORAGE_KEY_PRICING_CACHE,
        STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
      ]);
      optionsState.pricingCache = cacheData[STORAGE_KEY_PRICING_CACHE] || {};
      optionsState.knownModelsAndPrices =
        cacheData[STORAGE_KEY_KNOWN_MODELS_AND_PRICES] || {};
      if (optionsState.debug)
        console.log("[LLM Options] Loaded pricing cache:", optionsState.pricingCache);
      if (optionsState.debug)
        console.log(
          "[LLM Options] Loaded known models and pricing data:",
          redactSensitiveData(optionsState.knownModelsAndPrices),
        );

      // Populate allModels from optionsState.knownModelsAndPrices for autocomplete
      updateAllModelsList();

      if (statusMessage) {
        statusMessage.textContent = "Options loaded.";
        statusMessage.className = "status-message success";
        setTimeout(() => {
          statusMessage.textContent = "";
          statusMessage.className = "status-message";
        }, 1500);
      }
      // Set the radio button for max price behavior
      document.querySelector(
        `input[name="maxPriceBehavior"][value="${optionsState.maxPriceBehavior}"]`,
      ).checked = true;
      optionsState.markClean();
      if (optionsState.debug) console.log("[LLM Options] Settings loaded successfully.");
    } catch (error) {
      showError(`Error loading settings: ${error.message}. Using defaults.`);
      if (apiKeyInput) apiKeyInput.value = "";
      if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
      optionsState.debug = DEFAULT_DEBUG_MODE;
      bulletCountRadios.forEach(
        (radio) => (radio.checked = radio.value === DEFAULT_BULLET_COUNT),
      );
      optionsState.models = [...DEFAULT_MODEL_OPTIONS]; // Use defaults from constants (no labels)
      const firstDefaultId =
        optionsState.models.length > 0 ? optionsState.models[0].id : "";
      optionsState.summaryModelId = firstDefaultId;
      optionsState.chatModelId = firstDefaultId;
      optionsState.languages = [];
      optionsState.quickPrompts = getDefaultChatQuickPrompts();

      optionsState.promptTemplate = DEFAULT_XML_PROMPT_TEMPLATE;
      promptSection.render();
      optionsState.maxRequestPrice = DEFAULT_MAX_REQUEST_PRICE;
      optionsState.maxPriceBehavior = DEFAULT_MAX_PRICE_BEHAVIOR;
      // Input field is handled in calculateKbLimitForSummary
      if (optionsState.debug)
        console.error(
          "[LLM Options] Error loading settings, applied defaults.",
          error,
        );
    }

    modelSection.render();
    languageSection.render();
    quickPromptSection.render();
    calculateKbLimitForSummary();
    checkModelAndPricingData(); // Check pricing data on load
  }

  // UPDATED Save Settings function (No Labels) with encryption
  async function saveSettings() {
    if (optionsState.debug) console.log("[LLM Options] Attempting to save settings...");
    optionsState.setSaving(true);
    tokenSection.syncStateFromInputs();
    const debug = debugCheckbox ? debugCheckbox.checked : false;
    optionsState.debug = debug;
    let bulletCount = DEFAULT_BULLET_COUNT;
    document.querySelectorAll('input[name="bulletCount"]').forEach((radio) => {
      if (radio.checked) bulletCount = radio.value;
    });
    optionsState.setBulletCount(bulletCount);
    promptSection.syncStateFromInput();

    const alwaysUseUsEnglish = alwaysUseUsEnglishCheckbox
      ? alwaysUseUsEnglishCheckbox.checked
      : true;
    optionsState.setAlwaysUseUsEnglish(alwaysUseUsEnglish);
    optionsState.setAlsoSendToJoplin(
      alsoSendToJoplinCheckbox ? alsoSendToJoplinCheckbox.checked : false,
    );

    // Filter models: keep only valid IDs, limit count, store only {id: string}
    const modelsToSave = optionsState.models
      .map((m) => ({ id: m.id.trim() })) // Create object with only id
      .filter((m) => m.id !== "") // Keep only those with valid IDs
      .slice(0, MAX_MODELS); // Enforce maximum

    const savedModelIds = modelsToSave.map((m) => m.id);
    let finalSummaryModelId = optionsState.summaryModelId;
    let finalChatModelId = optionsState.chatModelId;

    if (!savedModelIds.includes(finalSummaryModelId)) {
      finalSummaryModelId = savedModelIds.length > 0 ? savedModelIds[0] : "";
      if (optionsState.debug)
        console.warn(
          `[LLM Options] Summary default "${optionsState.summaryModelId}" invalid on save, resetting to "${finalSummaryModelId}".`,
        );
    }
    if (!savedModelIds.includes(finalChatModelId)) {
      finalChatModelId = savedModelIds.length > 0 ? savedModelIds[0] : "";
      if (optionsState.debug)
        console.warn(
          `[LLM Options] Chat default "${optionsState.chatModelId}" invalid on save, resetting to "${finalChatModelId}".`,
        );
    }

    const language_infoToSave = languageSection.normalizeForSave({
      onInvalidLanguage: (name) => {
        if (optionsState.debug)
          console.warn(
            `[LLM Options] Invalid language name "${name}" skipped on save.`,
          );
      },
    });

    const chatQuickPromptsToSave = quickPromptSection.normalizeForSave();

    if (chatQuickPromptsToSave.length !== optionsState.quickPrompts.length) {
      optionsState.quickPrompts = chatQuickPromptsToSave.map((item) => ({ ...item }));
      quickPromptSection.render();
    }

    // Non-sensitive settings go to sync
    const settingsToSave = {
      models: modelsToSave,
      summaryModelId: finalSummaryModelId,
      chatModelId: finalChatModelId,
      debug,
      bulletCount,
      language_info: language_infoToSave,
      [STORAGE_KEY_PROMPT_TEMPLATE]: optionsState.promptTemplate,
      [STORAGE_KEY_ALWAYS_USE_US_ENGLISH]: alwaysUseUsEnglish,
      [STORAGE_KEY_MAX_REQUEST_PRICE]: optionsState.maxRequestPrice,
      [STORAGE_KEY_MAX_PRICE_BEHAVIOR]: optionsState.maxPriceBehavior,
      [STORAGE_KEY_CHAT_QUICK_PROMPTS]: chatQuickPromptsToSave,
      [STORAGE_KEY_ALSO_SEND_TO_JOPLIN]: alsoSendToJoplinCheckbox
        ? alsoSendToJoplinCheckbox.checked
        : false,
    };

    if (optionsState.debug) {
      console.log(
        "[LLM Options] Settings prepared for saving (tokens encrypted):",
        redactSensitiveData({ ...settingsToSave, tokensEncrypted: true })
      );
    }

    try {
      const savedSettings = await saveStoredSettings(settingsToSave);
      await tokenSection.saveTokens();

      if (optionsState.debug)
        console.log("[LLM Options] Settings saved successfully via state layer.");

      if (
        JSON.stringify(settingsToSave.models) !==
          JSON.stringify(savedSettings.models) ||
        settingsToSave.summaryModelId !== savedSettings.summaryModelId ||
        settingsToSave.chatModelId !== savedSettings.chatModelId
      ) {
        console.warn(
          "[LLM Options] Save verification mismatch detected (basic check).",
        );
      } else {
        if (optionsState.debug)
          console.log(
            "[LLM Options] Save verification passed (basic check).",
          );
      }

      if (optionsState.debug)
        console.log("[LLM Options] Encrypted tokens saved successfully.");
      optionsState.markClean();

      if (statusMessage) {
        statusMessage.textContent = "Changes saved!";
        statusMessage.className = "status-message success";
        setTimeout(() => {
          statusMessage.textContent = "";
          statusMessage.className = "status-message";
        }, 1000); // Reduced timeout for immediate saves to be less intrusive
      }
    } catch (error) {
      showError(`Error saving settings: ${error.message}`);
      if (statusMessage) {
        statusMessage.textContent = "Error saving options!";
        statusMessage.className = "status-message error";
      }
      if (optionsState.debug)
        console.error("[LLM Options] Error saving settings:", error);
    } finally {
      optionsState.setSaving(false);
    }
  }

  // UPDATED Reset to Defaults function (Uses constants without labels)
  function resetToDefaults() {
    if (optionsState.debug) console.log("[LLM Options] Reset to Defaults initiated.");
    if (
      confirm(
        "Are you sure you want to reset all options (except API key) to their defaults?",
      )
    ) {
      if (optionsState.debug) console.log("[LLM Options] Reset confirmed.");

      // Reset Models using defaults from constants (already no labels)
      optionsState.models = [...DEFAULT_MODEL_OPTIONS];
      const firstDefaultId =
        optionsState.models.length > 0 ? optionsState.models[0].id : "";
      optionsState.summaryModelId = firstDefaultId;
      optionsState.chatModelId = firstDefaultId;

      optionsState.languages = languageSection.getDefaultLanguageInfo();
      optionsState.quickPrompts = getDefaultChatQuickPrompts();

      if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
      bulletCountRadios.forEach((radio) => {
        radio.checked = radio.value === DEFAULT_BULLET_COUNT;
      });
      optionsState.promptTemplate = DEFAULT_XML_PROMPT_TEMPLATE;
      promptSection.render();

      // Reset language detection checkbox to default (true = always use US English)
      if (alwaysUseUsEnglishCheckbox) {
        alwaysUseUsEnglishCheckbox.checked = true;
      }
      optionsState.maxRequestPrice = DEFAULT_MAX_REQUEST_PRICE;
      // Input field is handled in calculateKbLimitForSummary

      optionsState.setAlsoSendToJoplin(false);
      tokenSection.setAlsoSendToJoplin(false);

      modelSection.render();
      languageSection.render();
      quickPromptSection.render();
      calculateKbLimitForSummary();
      // Reset the radio button for max price behavior
      document.querySelector(
        `input[name="maxPriceBehavior"][value="${optionsState.maxPriceBehavior}"]`,
      ).checked = true;

      saveSettings();

      if (statusMessage) {
        statusMessage.textContent = "Options reset to defaults.";
        statusMessage.className = "status-message success";
        setTimeout(() => {
          statusMessage.textContent = "";
          statusMessage.className = "status-message";
        }, NOTIFICATION_TIMEOUT_MINOR_MS);
      }
      if (optionsState.debug)
        console.log("[LLM Options] Reset operation completed and saved.");
    } else {
      if (optionsState.debug) console.log("[LLM Options] Reset cancelled.");
    }
  }
  // --- End Load, Save, Reset ---

  /**
   * Handles input changes for the max price field in the table.
   */
  function handleMaxPriceInput(event) {
    if (maxPriceDebounceTimeoutId) {
      clearTimeout(maxPriceDebounceTimeoutId);
    }
    maxPriceDebounceTimeoutId = setTimeout(() => {
      const priceValue = parseFloat(event.target.value);

      // Avoid clamping mid-entry; enforce minimum on blur.
      if (Number.isFinite(priceValue) && priceValue >= 0.001) {
        optionsState.maxRequestPrice = priceValue;
        calculateKbLimitForSummary();
      }

      maxPriceDebounceTimeoutId = null;
    }, MAX_PRICE_INPUT_DEBOUNCE_MS);
  }

  /**
   * Handles blur event for the max price field to reset invalid values.
   */
  function handleMaxPriceBlur(event) {
    const priceValue = parseFloat(event.target.value);

    if (maxPriceDebounceTimeoutId) {
      clearTimeout(maxPriceDebounceTimeoutId);
      maxPriceDebounceTimeoutId = null;
    }

    if (!Number.isFinite(priceValue) || priceValue < 0.001) {
      optionsState.maxRequestPrice = DEFAULT_MAX_REQUEST_PRICE;
      event.target.value = DEFAULT_MAX_REQUEST_PRICE.toFixed(3);
    } else {
      optionsState.maxRequestPrice = priceValue;
      event.target.value = priceValue.toFixed(3);
    }

    calculateKbLimitForSummary();
  }

  /**
   * Updates the allModels list for autocomplete from optionsState.knownModelsAndPrices.
   */
  function updateAllModelsList() {
    allModels = Object.values(optionsState.knownModelsAndPrices).map((model) => ({
      id: model.id,
      name: model.name || "",
    }));
    if (optionsState.debug)
      console.log(
        "[LLM Options] Updated allModels list for autocomplete:",
        allModels.length,
        "models available.",
      );
  }

  /**
   * Checks pricing data for all configured models and updates if necessary.
   */
  function checkPricingData() {
    if (!pricingNotification) return;

    const currentTime = Date.now();
    const cacheExpiry = DEFAULT_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    let isDataExpired = true;

    if (Object.keys(optionsState.knownModelsAndPrices).length > 0) {
      const firstModel = Object.values(optionsState.knownModelsAndPrices)[0];
      if (firstModel && firstModel.timestamp) {
        isDataExpired = currentTime - firstModel.timestamp >= cacheExpiry;
      }
    }

    if (Object.keys(optionsState.knownModelsAndPrices).length === 0 || isDataExpired) {
      pricingNotification.textContent =
        "Model and pricing data missing or expired. Fetching data...";
      updateKnownModelsAndPricing();
    } else {
      pricingNotification.textContent = "Model and pricing data up to date.";
      updateAllModelsList(); // Ensure autocomplete list is updated
    }
  }

  // --- Tab Handling ---
  function setupTabNavigation() {
    const tabButtons = document.querySelectorAll(".tab-button");
    const tabContents = document.querySelectorAll(".tab-content");

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        // Deactivate all tabs and hide all content
        tabButtons.forEach((btn) => btn.classList.remove("active"));
        tabContents.forEach((content) => content.classList.remove("active"));

        // Activate clicked tab
        button.classList.add("active");
        // Show corresponding content
        const targetTabId = button.dataset.tab;
        document.getElementById(targetTabId).classList.add("active");
        if (optionsState.debug) console.log(`[LLM Options] Switched to tab: ${targetTabId}`);

        // Special handling for advanced options tab: No longer collapsible, so no special handling needed here.
        // The general tab content activation/deactivation is sufficient.
      });
    });

    // Set initial active tab
    // Check local storage for last active tab, otherwise default to 'summary-tab'
    loadStorageArea(SETTINGS_STORAGE_AREA_LOCAL, "lastActiveTab").then((result) => {
      const lastActiveTab = result.lastActiveTab || "summary-tab"; // New default is 'summary-tab'
      const initialTabButton = document.querySelector(
        `.tab-button[data-tab="${lastActiveTab}"]`,
      );
      if (initialTabButton) {
        initialTabButton.click(); // Simulate click to activate tab and its content
      } else {
        // Fallback to the default tab if stored tab doesn't exist
        document.querySelector(`.tab-button[data-tab="summary-tab"]`).click();
      }
    });

    // Save active tab on change
    tabButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const currentTabId = button.dataset.tab;
        await saveStorageArea(SETTINGS_STORAGE_AREA_LOCAL, {
          lastActiveTab: currentTabId,
        });
      });
    });
  }

  async function initializeOptionsPage() {
    try {
      await loadSettings();

      tokenSection.attach();

      if (addModelBtn) {
        addModelBtn.addEventListener("click", modelSection.addModel);
      } else {
        console.error("[LLM Options] Add Model button not found.");
      }

      // Add event listeners for bullet count radios to save immediately
      bulletCountRadios.forEach((radio) => {
        radio.addEventListener("change", () => {
          if (optionsState.debug)
            console.log(
              `[LLM Options] Bullet Count changed to: ${radio.value}`,
            );
          saveSettings();
        });
      });

      // Add event listener for the language detection checkbox
      if (alwaysUseUsEnglishCheckbox) {
        alwaysUseUsEnglishCheckbox.addEventListener("change", () => {
          if (optionsState.debug)
            console.log(
              `[LLM Options] Always use US English changed to: ${alwaysUseUsEnglishCheckbox.checked}`,
            );
          saveSettings();
        });
      } else {
        console.error("[LLM Options] Always use US English checkbox not found.");
      }

      promptSection.attach();
      if (addLangBtn) {
        addLangBtn.addEventListener("click", languageSection.addLanguage);
      } else {
        console.error("[LLM Options] Add Language button not found.");
      }
      if (addChatQuickPromptBtn) {
        addChatQuickPromptBtn.addEventListener("click", quickPromptSection.addQuickPrompt);
      } else {
        console.error("[LLM Options] Add Chat Quick Prompt button not found.");
      }
      if (resetButton) {
        resetButton.addEventListener("click", resetToDefaults);
      } else {
        console.error("[LLM Options] Reset button not found.");
      }
      const saveBtn = document.getElementById("saveBtn");
      if (saveBtn) {
        saveBtn.addEventListener("click", saveSettings);
      } else {
        console.error("[LLM Options] Save button not found.");
      }
      if (updatePricingBtn) {
        updatePricingBtn.addEventListener("click", updateKnownModelsAndPricing);
      } else {
        console.error("[LLM Options] Update Model Pricing button not found.");
      }
      // Add event listener for max price behavior radio buttons
      document
        .querySelectorAll('input[name="maxPriceBehavior"]')
        .forEach((radio) => {
          radio.addEventListener("change", () => {
            optionsState.maxPriceBehavior = radio.value;
          });
        });
      setupTabNavigation(); // Setup tab navigation
      if (optionsState.debug) console.log("[LLM Options] Event listeners attached.");
    } catch (error) {
      console.error("[LLM Options] Error during initialization:", error);
      showError("Failed to initialize options page: " + error.message);
    }
  }

  initializeOptionsPage();
  // --- End Initial Setup ---
}); // End DOMContentLoaded
