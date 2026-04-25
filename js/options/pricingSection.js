// js/options/pricingSection.js
// Renders and manages options page model pricing controls.

import {
  DEFAULT_CACHE_EXPIRY_DAYS,
  DEFAULT_MAX_REQUEST_PRICE,
  TOKENS_PER_KB,
} from "../../constants.js";
import { RuntimeMessageActions } from "../messaging/actions.js";
import { sendRuntimeAction } from "../messaging/runtimeClient.js";
import {
  loadStorageArea,
  saveStorageArea,
  SETTINGS_STORAGE_AREA_LOCAL,
} from "../state/settingsStore.js";
import { getBaseModelId } from "./modelSection.js";

const STORAGE_KEY_PRICING_CACHE = "modelPricingCache";
const STORAGE_KEY_KNOWN_MODELS_AND_PRICES = "knownModelsAndPrices";
const DEFAULT_MAX_PRICE_INPUT_DEBOUNCE_MS = 1000;

/**
 * Calculates the displayed KiB limit from price settings.
 * @param {number} maxRequestPrice - Maximum request price in USD.
 * @param {number} pricePerToken - Model input price per token.
 * @returns {Object} Display and state values.
 * @example Called by createOptionsPricingSection().
 */
export const calculateSummaryKbLimit = (maxRequestPrice, pricePerToken) => {
  if (pricePerToken === 0) {
    return { stateValue: "No limit", displayValue: "No limit" };
  }

  if (maxRequestPrice === 0) {
    return { stateValue: "0", displayValue: "0" };
  }

  const maxTokens = maxRequestPrice / pricePerToken;
  const maxKb = Math.round(maxTokens / TOKENS_PER_KB);
  return { stateValue: String(maxKb), displayValue: `~${maxKb}` };
};

/**
 * Checks whether a known model/pricing cache is missing or expired.
 * @param {Object} knownModelsAndPrices - Cached model data.
 * @param {number} now - Timestamp to compare against.
 * @returns {boolean} True when data needs refresh.
 * @example Called by pricing notification checks.
 */
export const isKnownModelPricingMissingOrExpired = (
  knownModelsAndPrices,
  now = Date.now(),
) => {
  if (!knownModelsAndPrices || Object.keys(knownModelsAndPrices).length === 0) {
    return true;
  }

  const firstModel = Object.values(knownModelsAndPrices)[0];
  if (!firstModel?.timestamp) return true;

  const cacheExpiry = DEFAULT_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return now - firstModel.timestamp >= cacheExpiry;
};

/**
 * Creates the pricing section controller used by options.js.
 * @param {Object} options - Controller dependencies.
 * @returns {Object} Pricing section API.
 * @example Called by options.js DOMContentLoaded initialization.
 */
export const createOptionsPricingSection = ({
  maxKbDisplay,
  pricingNotification,
  updatePricingBtn,
  state,
  getHasApiKey = () => false,
  setAutocompleteModels = () => {},
  validateCurrentModels = () => {},
  saveSettings = () => {},
  logger = console,
  redact = (value) => value,
  maxPriceInputDebounceMs = DEFAULT_MAX_PRICE_INPUT_DEBOUNCE_MS,
} = {}) => {
  let maxPriceDebounceTimeoutId = null;

  const debugEnabled = () => state?.debug === true;

  const updateAllModelsList = () => {
    const allModels = Object.values(state.knownModelsAndPrices || {}).map((model) => ({
      id: model.id,
      name: model.name || "",
    }));
    setAutocompleteModels(allModels);

    if (debugEnabled()) {
      logger.log(
        "[LLM Options] Updated allModels list for autocomplete:",
        allModels.length,
        "models available.",
      );
    }
  };

  const attachMaxPriceInputHandlers = () => {
    const maxPriceInput = document.getElementById("maxPriceInput");
    if (!maxPriceInput) return;
    maxPriceInput.addEventListener("input", handleMaxPriceInput);
    maxPriceInput.addEventListener("blur", handleMaxPriceBlur);
  };

  const renderPriceTable = (kbLimitText) => {
    if (!maxKbDisplay) return;

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
            <td><input type="number" id="maxPriceInput" step="0.001" min="0" value="${state.maxRequestPrice.toFixed(3)}" style="width: 80px;"></td>
            <td>${kbLimitText}</td>
          </tr>
        </tbody>
      </table>
    `;
    attachMaxPriceInputHandlers();
  };

  const calculateKbLimitForSummary = async () => {
    if (!maxKbDisplay) return;

    maxKbDisplay.textContent = `max price: ${state.maxRequestPrice.toFixed(3)} max KiB: Calculating...`;
    state.summaryKbLimit = "";

    if (!state.summaryModelId) {
      renderPriceTable("No model selected");
      return;
    }

    const baseSummaryModelId = getBaseModelId(state.summaryModelId);
    const modelData = state.knownModelsAndPrices?.[baseSummaryModelId];
    const currentTime = Date.now();
    const cacheExpiry = DEFAULT_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    if (modelData && currentTime - modelData.timestamp < cacheExpiry) {
      const pricePerToken = modelData.pricePerToken || 0;
      const { stateValue, displayValue } = calculateSummaryKbLimit(
        state.maxRequestPrice,
        pricePerToken,
      );
      state.summaryKbLimit = stateValue;
      renderPriceTable(displayValue);

      if (debugEnabled()) {
        logger.log(
          `[LLM Options] Used cached data for ${state.summaryModelId}:`,
          redact(modelData),
        );
      }
      return;
    }

    try {
      const { response } = await sendRuntimeAction(
        RuntimeMessageActions.getModelPricing,
        { modelId: baseSummaryModelId },
      );

      if (!response || response.status !== "success") {
        maxKbDisplay.textContent = `max price: ${state.maxRequestPrice.toFixed(2)} max KiB: Pricing unavailable`;
        state.summaryKbLimit = "";
        if (debugEnabled()) {
          logger.error(
            "[LLM Options] Error fetching model pricing:",
            response?.message || "No response",
          );
        }
        return;
      }

      const pricePerToken = response.pricePerToken || 0;
      state.pricingCache[state.summaryModelId] = {
        pricePerToken,
        timestamp: currentTime,
      };
      await saveStorageArea(SETTINGS_STORAGE_AREA_LOCAL, {
        [STORAGE_KEY_PRICING_CACHE]: state.pricingCache,
      });
      if (debugEnabled()) {
        logger.log(
          `[LLM Options] Updated pricing cache for ${state.summaryModelId}`,
        );
      }

      const { stateValue, displayValue } = calculateSummaryKbLimit(
        state.maxRequestPrice,
        pricePerToken,
      );
      state.summaryKbLimit = stateValue;
      renderPriceTable(displayValue);
    } catch (error) {
      maxKbDisplay.textContent = `max price: ${state.maxRequestPrice.toFixed(2)} max KiB: Pricing unavailable`;
      state.summaryKbLimit = "";
      if (debugEnabled()) {
        logger.error("[LLM Options] Error fetching model pricing:", error);
      }
    }
  };

  const refreshKnownModelsAndPricesAndUpdateUi = async (
    { shouldSaveSettings = true } = {},
  ) => {
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
        if (debugEnabled()) {
          logger.error(
            "[LLM Options] Error updating model and pricing data:",
            response?.message || "No response",
          );
        }
        updatePricingBtn.disabled = false;
        return;
      }

      const updated = response.updated || 0;
      pricingNotification.textContent = shouldSaveSettings
        ? `Updated data for ${updated} model(s). Settings saved.`
        : `Updated data for ${updated} model(s).`;
      if (debugEnabled()) {
        logger.log(`[LLM Options] Updated data for ${updated} models.`);
      }

      const cacheData = await loadStorageArea(
        SETTINGS_STORAGE_AREA_LOCAL,
        STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
      );
      state.knownModelsAndPrices =
        cacheData[STORAGE_KEY_KNOWN_MODELS_AND_PRICES] || {};
      if (debugEnabled()) {
        logger.log(
          "[LLM Options] Reloaded model and pricing data:",
          redact(state.knownModelsAndPrices),
        );
      }

      calculateKbLimitForSummary();
      validateCurrentModels();
      updateAllModelsList();

      if (shouldSaveSettings && getHasApiKey()) {
        if (debugEnabled()) {
          logger.log(
            "[LLM Options] API key validated, saving settings automatically.",
          );
        }
        saveSettings();
      }

      updatePricingBtn.disabled = false;
    } catch (error) {
      pricingNotification.textContent = `Error updating data: ${error.message}`;
      if (debugEnabled()) {
        logger.error("[LLM Options] Error updating model and pricing data:", error);
      }
      updatePricingBtn.disabled = false;
    }
  };

  const updateKnownModelsAndPricing = () => {
    refreshKnownModelsAndPricesAndUpdateUi({ shouldSaveSettings: true });
  };

  const checkModelAndPricingData = () => {
    if (!pricingNotification) return;

    if (isKnownModelPricingMissingOrExpired(state.knownModelsAndPrices)) {
      pricingNotification.textContent =
        "Model and pricing data missing or expired. Fetching data...";
      updateKnownModelsAndPricing();
      return;
    }

    pricingNotification.textContent = "Model and pricing data up to date.";
    validateCurrentModels();
    updateAllModelsList();
  };

  const checkPricingData = () => {
    if (!pricingNotification) return;

    if (isKnownModelPricingMissingOrExpired(state.knownModelsAndPrices)) {
      pricingNotification.textContent =
        "Model and pricing data missing or expired. Fetching data...";
      updateKnownModelsAndPricing();
      return;
    }

    pricingNotification.textContent = "Model and pricing data up to date.";
    updateAllModelsList();
  };

  const handleMaxPriceInput = (event) => {
    if (maxPriceDebounceTimeoutId) {
      clearTimeout(maxPriceDebounceTimeoutId);
    }

    maxPriceDebounceTimeoutId = setTimeout(() => {
      const priceValue = parseFloat(event.target.value);
      if (Number.isFinite(priceValue) && priceValue >= 0.001) {
        state.maxRequestPrice = priceValue;
        calculateKbLimitForSummary();
      }
      maxPriceDebounceTimeoutId = null;
    }, maxPriceInputDebounceMs);
  };

  const handleMaxPriceBlur = (event) => {
    const priceValue = parseFloat(event.target.value);

    if (maxPriceDebounceTimeoutId) {
      clearTimeout(maxPriceDebounceTimeoutId);
      maxPriceDebounceTimeoutId = null;
    }

    if (!Number.isFinite(priceValue) || priceValue < 0.001) {
      state.maxRequestPrice = DEFAULT_MAX_REQUEST_PRICE;
      event.target.value = DEFAULT_MAX_REQUEST_PRICE.toFixed(3);
    } else {
      state.maxRequestPrice = priceValue;
      event.target.value = priceValue.toFixed(3);
    }

    calculateKbLimitForSummary();
  };

  return {
    calculateKbLimitForSummary,
    checkModelAndPricingData,
    checkPricingData,
    refreshKnownModelsAndPricesAndUpdateUi,
    updateAllModelsList,
    updateKnownModelsAndPricing,
  };
};
