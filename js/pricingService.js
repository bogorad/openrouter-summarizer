// js/pricingService.js
import {
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
} from "../constants.js";
import { decryptSensitiveData } from "./encryption.js";
import { Logger } from "./logger.js";

// These were originally in background.js, moving them here as they are specific to pricing logic.
const MAX_PRICING_RETRIES = 2; // Max number of retries for fetching pricing
const PRICING_RETRY_DELAY_MS = 3000; // Delay between retries in milliseconds

async function _fetchAndCacheModelsPricing(apiKey, DEBUG = false, attempt = 0) {
  Logger.debug("[LLM Pricing Service]", `Attempt ${attempt + 1} to fetch model and pricing data.`);
  const apiUrl = `https://openrouter.ai/api/v1/models`;
  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
        "X-Title": "OR-Summ: Pricing",
      },
      signal: AbortSignal.timeout(15000), // 15-second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }
    const data = await response.json();

    Logger.debug("[LLM Pricing Service]", "Full Model and Pricing Response Data received.");

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

    await new Promise((resolve) =>
      chrome.storage.local.set(
        { [STORAGE_KEY_KNOWN_MODELS_AND_PRICES]: knownModelsAndPrices },
        resolve,
      ),
    );
    Logger.debug("[LLM Pricing Service]", `Updated known models and pricing for ${updatedCount} models.`);
    return { status: "success", updated: updatedCount };
  } catch (error) {
    Logger.debug("[LLM Pricing Service]", `Error fetching model and pricing data (Attempt ${attempt + 1}):`, error);
    if (attempt < MAX_PRICING_RETRIES) {
      Logger.debug("[LLM Pricing Service]", `Retrying pricing fetch in ${PRICING_RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) =>
        setTimeout(resolve, PRICING_RETRY_DELAY_MS),
      );
      return _fetchAndCacheModelsPricing(apiKey, DEBUG, attempt + 1); // Recursive call for retry
    } else {
      Logger.error("[LLM Pricing Service]", "Max retries reached for fetching pricing data.");
      return {
        status: "error",
        message: `Failed to fetch pricing after ${MAX_PRICING_RETRIES + 1} attempts: ${error.message}`,
      };
    }
  }
}

export async function handleGetModelPricing(
  request,
  sendResponse,
  DEBUG = false,
) {
  Logger.debug("[LLM Pricing Service]", "Handling getModelPricing request for model:", request.modelId);
  if (
    !request.modelId ||
    typeof request.modelId !== "string" ||
    request.modelId.trim() === ""
  ) {
    Logger.debug("[LLM Pricing Service]", "Invalid model ID provided for pricing request.");
    sendResponse({ status: "error", message: "Invalid model ID provided." });
    return;
  }

  // Get encrypted API key from local storage and decrypt it
  const localData = await chrome.storage.local.get([STORAGE_KEY_API_KEY_LOCAL]);
  const encryptedApiKey = localData[STORAGE_KEY_API_KEY_LOCAL];
  const decryptResult = await decryptSensitiveData(encryptedApiKey);
  if (!decryptResult.success) {
    Logger.error("[LLM Pricing Service]", "Failed to decrypt API key:", decryptResult.error);
  }
  const apiKey = decryptResult.data;

  const attemptGetPrice = async () => {
      const localCacheData = await new Promise((resolve) =>
        chrome.storage.local.get(
          [STORAGE_KEY_KNOWN_MODELS_AND_PRICES],
          resolve,
        ),
      );
      const knownModelsAndPrices =
        localCacheData[STORAGE_KEY_KNOWN_MODELS_AND_PRICES] || {};
      const cachedEntry = knownModelsAndPrices[request.modelId];
      const currentTime = Date.now();
      const cacheExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days expiry

      if (cachedEntry && currentTime - cachedEntry.timestamp < cacheExpiry) {
        Logger.debug("[LLM Pricing Service]", "Using cached pricing data for model:",
          request.modelId,
          { pricePerToken: cachedEntry.pricePerToken },
        );
        return { status: "success", pricePerToken: cachedEntry.pricePerToken };
      }
      return null; // Indicates cache miss or stale
    };

    let priceInfo = await attemptGetPrice();

    if (priceInfo) {
      sendResponse(priceInfo);
      return;
    }

    // Cache miss or stale, try to refresh
    Logger.debug("[LLM Pricing Service]", "Pricing cache miss for model:",
      request.modelId,
      "- Attempting refresh.",
    );
    if (!apiKey) {
      Logger.debug("[LLM Pricing Service]", "API key missing, cannot refresh pricing for getModelPricing.");
      sendResponse({
        status: "error",
        message: "API key missing. Cannot fetch pricing data.",
      });
      return;
    }

    try {
      const refreshResult = await _fetchAndCacheModelsPricing(apiKey, DEBUG);
      if (refreshResult.status === "success") {
        Logger.debug("[LLM Pricing Service]", "Pricing cache refreshed successfully during getModelPricing. Re-checking for model:",
          request.modelId,
        );
        priceInfo = await attemptGetPrice(); // Try getting from cache again
        if (priceInfo) {
          sendResponse(priceInfo);
        } else {
          Logger.debug("[LLM Pricing Service]", "Model",
            request.modelId,
            "not found even after refresh.",
          );
          sendResponse({
            status: "error",
            message: `Pricing data for model ${request.modelId} not found after refresh.`,
          });
        }
      } else {
        Logger.error("[LLM Pricing Service]", "Failed to refresh pricing cache during getModelPricing:",
          refreshResult.message,
        );
        sendResponse({
          status: "error",
          message: `Failed to update pricing data: ${refreshResult.message}`,
        });
      }
    } catch (error) {
      Logger.error("[LLM Pricing Service]", "Error during pricing refresh for getModelPricing:", error);
      sendResponse({
        status: "error",
        message: `Error updating pricing data: ${error.message}`,
      });
    }
}

export async function handleUpdateKnownModelsAndPricing(
  sendResponse,
  DEBUG = false,
) {
  Logger.debug("[LLM Pricing Service]", "Handling updateKnownModelsAndPricing request for all models.");
  // Get encrypted API key from local storage and decrypt it
  const localData = await chrome.storage.local.get([STORAGE_KEY_API_KEY_LOCAL]);
  const encryptedApiKey = localData[STORAGE_KEY_API_KEY_LOCAL];
  const decryptResult = await decryptSensitiveData(encryptedApiKey);
  if (!decryptResult.success) {
    Logger.error("[LLM Pricing Service]", "Failed to decrypt API key:", decryptResult.error);
  }
  const apiKey = decryptResult.data;
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
    Logger.debug("[LLM Pricing Service]", "API key missing for model and pricing request.");
    sendResponse({
      status: "error",
      message: "API key required for model and pricing data.",
    });
    return;
  }
  const result = await _fetchAndCacheModelsPricing(apiKey, DEBUG);
  sendResponse(result);
}
