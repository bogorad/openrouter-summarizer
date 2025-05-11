// services/modelService.js
import {
  STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
  STORAGE_KEY_API_KEY,
  DEFAULT_CACHE_EXPIRY_DAYS,
} from "../constants.js";
import { logDebug, logError } from "../utils/errorHandling.js";

/**
 * Get pricing data for a specific model
 * @param {string} modelId - Model ID to get pricing for
 * @returns {Promise<Object>} Pricing data
 */
export function getModelPricing(modelId) {
  if (!modelId || typeof modelId !== "string" || modelId.trim() === "") {
    logDebug("Invalid model ID provided for pricing request");
    return Promise.reject({
      status: "error",
      message: "Invalid model ID provided.",
    });
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEY_KNOWN_MODELS_AND_PRICES], (cacheData) => {
      const knownModelsAndPrices = cacheData[STORAGE_KEY_KNOWN_MODELS_AND_PRICES] || {};
      const cachedEntry = knownModelsAndPrices[modelId];
      const currentTime = Date.now();
      const cacheExpiry = DEFAULT_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      if (cachedEntry && currentTime - cachedEntry.timestamp < cacheExpiry) {
        logDebug("Using cached pricing data for model", {
          modelId,
          pricePerToken: cachedEntry.pricePerToken,
        });
        resolve({
          status: "success",
          pricePerToken: cachedEntry.pricePerToken,
        });
      } else {
        logDebug("No valid cached data found or expired for model", modelId);
        reject({
          status: "error",
          message: "Pricing data not available or expired. Please update model data.",
        });
      }
    });
  });
}

/**
 * Update pricing data for all models
 * @returns {Promise<Object>} Update result
 */
export function updateModelPricing() {
  logDebug("Handling updateKnownModelsAndPricing request for all models");

  return new Promise((resolve, reject) => {
    chrome.storage.sync.get([STORAGE_KEY_API_KEY], (data) => {
      const apiKey = data[STORAGE_KEY_API_KEY];
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
        logDebug("API key missing for model and pricing request");
        reject({
          status: "error",
          message: "API key required for model and pricing data.",
        });
        return;
      }

      const apiUrl = `https://openrouter.ai/api/v1/models`;
      logDebug("Fetching model and pricing data from", apiUrl);

      fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
          "X-Title": "OR-Summ",
        },
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          logDebug("Full Model and Pricing Response Data received");

          const currentTime = Date.now();
          const knownModelsAndPrices = {};
          let updatedCount = 0;

          data.data.forEach((model) => {
            const pricePerToken = model.pricing?.prompt || 0;
            knownModelsAndPrices[model.id] = {
              id: model.id,
              name: model.name || model.id,
              pricePerToken: pricePerToken,
              timestamp: currentTime,
            };
            updatedCount++;
          });

          chrome.storage.local.set(
            { [STORAGE_KEY_KNOWN_MODELS_AND_PRICES]: knownModelsAndPrices },
            () => {
              logDebug(`Updated known models and pricing for ${updatedCount} models`);
              resolve({
                status: "success",
                updated: updatedCount,
              });
            }
          );
        })
        .catch((error) => {
          logError("Error fetching model and pricing data", error);
          reject({ status: "error", message: error.message });
        });
    });
  });
}

/**
 * Estimate token count from content
 * @param {string} content - Content to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokenCount(content) {
  if (!content) return 0;
  // Simple estimation: ~4 characters per token
  return Math.ceil(content.length / 4);
}

// Removed unused exported function calculateRequestCost
