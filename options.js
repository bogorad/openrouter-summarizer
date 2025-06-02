// options.js

import {
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_POSTAMBLE_TEXT,
  DEFAULT_FORMAT_INSTRUCTIONS,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_MAX_REQUEST_PRICE,
  STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
  DEFAULT_CACHE_EXPIRY_DAYS,
  STORAGE_KEY_NEWSBLUR_TOKEN,
  STORAGE_KEY_JOPLIN_TOKEN, // New: Import Joplin token storage key
} from "./constants.js";
import { showError } from "./utils.js";

console.log(`[LLM Options] Script Start v3.4.4`);

document.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("apiKey");
  const newsblurTokenInput = document.getElementById("newsblurToken");
  const joplinTokenInput = document.getElementById("joplinToken"); // New: Joplin Token Input
  const modelSelectionArea = document.getElementById("modelSelectionArea");
  const addModelBtn = document.getElementById("addModelBtn");
  const languageSelectionArea = document.getElementById(
    "languageSelectionArea",
  );
  const addLangBtn = document.getElementById("addLangBtn");
  const debugCheckbox = document.getElementById("debug");
  const bulletCountRadios = document.querySelectorAll(
    'input[name="bulletCount"]',
  );
  const resetButton = document.getElementById("resetDefaultsBtn");
  const statusMessage = document.getElementById("status");
  const promptPreambleDiv = document.getElementById("promptPreamble");
  const promptFormatInstructionsTextarea = document.getElementById(
    "promptFormatInstructions",
  );
  const promptPostambleDiv = document.getElementById("promptPostamble");
  const advancedOptionsToggle = document.getElementById(
    "advancedOptionsToggle",
  );
  const advancedOptionsContent = document.getElementById(
    "advancedOptionsContent",
  );
  const maxKbDisplay = document.getElementById("maxKbDisplay");
  const updatePricingBtn = document.getElementById("updatePricingBtn");
  const pricingNotification = document.getElementById("pricingNotification");

  const DEFAULT_BULLET_COUNT = "5";
  const LANGUAGE_FLAG_CLASS = "language-flag";
  const DEFAULT_DEBUG_MODE = false;
  const DEFAULT_MAX_PRICE_BEHAVIOR = "truncate";
  const STORAGE_KEY_MAX_PRICE_BEHAVIOR = "maxPriceBehavior";
  const NUM_TO_WORD = {
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
  };
  const MAX_MODELS = 7;
  const MAX_LANGUAGES = 5;
  const TOKENS_PER_KB = 227.56; // Approximation based on 4.5 characters per token and 1024 characters per KB
  const STORAGE_KEY_MAX_REQUEST_PRICE = "maxRequestPrice";
  const DEBOUNCE_DELAY = 300; // ms delay for input processing
  const STORAGE_KEY_PRICING_CACHE = "modelPricingCache";

  let DEBUG = false;
  let currentModels = []; // Array of objects like { id: "model/id" }
  let currentSummaryModelId = "";
  let currentChatModelId = "";
  let currentMaxRequestPrice = DEFAULT_MAX_REQUEST_PRICE;
  let currentMaxPriceBehavior = DEFAULT_MAX_PRICE_BEHAVIOR;
  let currentSummaryKbLimit = "";
  let debounceTimeoutId = null;
  let modelPricingCache = {}; // Cache for model pricing data { "model/id": { pricePerToken: number, timestamp: number } }
  let knownModelsAndPrices = {}; // Combined structure for models supporting structured_outputs and their pricing

  let language_info = [];
  let allLanguages = []; // For autocomplete suggestions for languages
  let allModels = []; // For autocomplete suggestions for models

  let currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;

  let activeAutocompleteInput = null;
  let autocompleteDropdown = null;
  let highlightedAutocompleteIndex = -1;

  let draggedItemIndex = null;

  // --- Autocomplete Functions for Languages and Models ---
  function setupAutocomplete(textInput, type = 'language') {
    if (!textInput) return;
    textInput.addEventListener("input", (event) => {
      const query = event.target.value;
      let suggestions = [];
      if (type === 'language') {
        suggestions = filterLanguages(query);
        if (DEBUG)
          console.log(
            `[LLM Options] Language autocomplete suggestions for "${query}":`,
            suggestions,
          );
      } else if (type === 'model') {
        suggestions = filterModels(query);
        if (DEBUG)
          console.log(
            `[LLM Options] Model autocomplete suggestions for "${query}":`,
            suggestions,
          );
      }
      showAutocompleteSuggestions(textInput, suggestions, type);
    });
    textInput.addEventListener("keydown", handleAutocompleteKeydown);
  }

  // --- Price Limit Calculation and Display ---
  /**
   * Calculates the KB limit for the current summary model based on cached or fetched pricing data.
   */
  function calculateKbLimitForSummary() {
    if (!maxKbDisplay) return;
    
    maxKbDisplay.textContent = `max price: ${currentMaxRequestPrice.toFixed(3)} max KiB: Calculating...`;
    currentSummaryKbLimit = "";
    
    if (!currentSummaryModelId) {
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
              <td><input type="number" id="maxPriceInput" step="0.001" min="0" value="${currentMaxRequestPrice.toFixed(3)}" style="width: 80px;"></td>
              <td>No model selected</td>
            </tr>
          </tbody>
        </table>
      `;
      document.getElementById("maxPriceInput").addEventListener("input", handleMaxPriceInput);
      document.getElementById("maxPriceInput").addEventListener("blur", handleMaxPriceBlur);
      currentSummaryKbLimit = "";
      return;
    }
    
    const modelData = knownModelsAndPrices[currentSummaryModelId];
    const currentTime = Date.now();
    const cacheExpiry = DEFAULT_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    
    if (modelData && currentTime - modelData.timestamp < cacheExpiry) {
      const pricePerToken = modelData.pricePerToken || 0;
      let kbLimit = "Calculating...";
      if (pricePerToken === 0) {
        currentSummaryKbLimit = "No limit";
        kbLimit = "No limit";
      } else if (currentMaxRequestPrice === 0) {
        currentSummaryKbLimit = "0";
        kbLimit = "0";
      } else {
        const maxTokens = currentMaxRequestPrice / pricePerToken;
        const maxKb = Math.round(maxTokens / TOKENS_PER_KB);
        currentSummaryKbLimit = maxKb.toString();
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
              <td><input type="number" id="maxPriceInput" step="0.001" min="0" value="${currentMaxRequestPrice.toFixed(3)}" style="width: 80px;"></td>
              <td>${kbLimit}</td>
            </tr>
          </tbody>
        </table>
      `;
      document.getElementById("maxPriceInput").addEventListener("input", handleMaxPriceInput);
      document.getElementById("maxPriceInput").addEventListener("blur", handleMaxPriceBlur);
      if (DEBUG) console.log(`[LLM Options] Used cached data for ${currentSummaryModelId}:`, modelData);
      return;
    }
    
    chrome.runtime.sendMessage({
      action: "getModelPricing",
      modelId: currentSummaryModelId
    }, (response) => {
      if (chrome.runtime.lastError || !response || response.status !== "success") {
        maxKbDisplay.textContent = `max price: ${currentMaxRequestPrice.toFixed(2)} max KiB: Pricing unavailable`;
        currentSummaryKbLimit = "";
        if (DEBUG) console.error("[LLM Options] Error fetching model pricing:", chrome.runtime.lastError || "No response");
        return;
      }
      
      const pricePerToken = response.pricePerToken || 0;
      modelPricingCache[currentSummaryModelId] = { pricePerToken, timestamp: currentTime };
      chrome.storage.local.set({ [STORAGE_KEY_PRICING_CACHE]: modelPricingCache }, () => {
        if (DEBUG) console.log(`[LLM Options] Updated pricing cache for ${currentSummaryModelId}`);
      });
      
      let kbLimit = "Calculating...";
      if (pricePerToken === 0) {
        currentSummaryKbLimit = "No limit";
        kbLimit = "No limit";
      } else if (currentMaxRequestPrice === 0) {
        currentSummaryKbLimit = "0";
        kbLimit = "0";
      } else {
        const maxTokens = currentMaxRequestPrice / pricePerToken;
        const maxKb = Math.round(maxTokens / TOKENS_PER_KB);
        currentSummaryKbLimit = maxKb.toString();
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
              <td><input type="number" id="maxPriceInput" step="0.001" min="0" value="${currentMaxRequestPrice.toFixed(3)}" style="width: 80px;"></td>
              <td>${kbLimit}</td>
            </tr>
          </tbody>
        </table>
      `;
      document.getElementById("maxPriceInput").addEventListener("input", handleMaxPriceInput);
      document.getElementById("maxPriceInput").addEventListener("blur", handleMaxPriceBlur);
    });
  }
  function filterLanguages(query) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery || allLanguages.length === 0) return [];
    return allLanguages
      .filter((lang) => lang.name.toLowerCase().includes(lowerQuery))
      .map((lang) => ({ name: lang.name, code: lang.code }));
  }

  function filterModels(query) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery || allModels.length === 0) return [];
    return allModels
      .filter((model) => 
        model.id.toLowerCase().includes(lowerQuery) || 
        (model.name && model.name.toLowerCase().includes(lowerQuery))
      )
      .slice(0, 10); // Limit to top 10 suggestions
  }
  function showAutocompleteSuggestions(inputElement, suggestions, type = 'language') {
    if (!autocompleteDropdown) {
      autocompleteDropdown = document.createElement("div");
      autocompleteDropdown.className = "autocomplete-dropdown";
      document.body.appendChild(autocompleteDropdown);
      document.addEventListener("click", handleGlobalClick);
    }
    autocompleteDropdown.innerHTML = "";
    highlightedAutocompleteIndex = -1;
    if (suggestions.length === 0) {
      autocompleteDropdown.style.display = "none";
      return;
    }
    suggestions.forEach((item, index) => {
      const div = document.createElement("div");
      div.className = "autocomplete-item";
      div.dataset.index = index;
      if (type === 'language') {
        div.dataset.languageCode = item.code;
        div.dataset.languageName = item.name;
        const flagImg = document.createElement("img");
        flagImg.className = LANGUAGE_FLAG_CLASS;
        flagImg.src = chrome.runtime.getURL(
          `country-flags/svg/${item.code.toLowerCase()}.svg`,
        );
        flagImg.alt = `${item.name} flag`;
        flagImg.onerror = () => {
          flagImg.src = chrome.runtime.getURL("country-flags/svg/un.svg");
          flagImg.alt = "Flag not found";
        };
        const nameSpan = document.createElement("span");
        nameSpan.textContent = item.name;
        nameSpan.className = "language-name";
        div.appendChild(flagImg);
        div.appendChild(nameSpan);
      } else if (type === 'model') {
        div.dataset.modelId = item.id;
        const nameSpan = document.createElement("span");
        nameSpan.textContent = item.name ? `${item.id} (${item.name})` : item.id;
        nameSpan.className = "model-name";
        div.appendChild(nameSpan);
      }
      div.addEventListener("click", () =>
        selectAutocompleteSuggestion(div, inputElement, type),
      );
      autocompleteDropdown.appendChild(div);
    });
    const rect = (type === 'language' ? inputElement.closest(".language-input-wrapper") : inputElement).getBoundingClientRect();
    autocompleteDropdown.style.position = "absolute";
    autocompleteDropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
    autocompleteDropdown.style.left = `${rect.left + window.scrollX}px`;
    autocompleteDropdown.style.width = `${rect.width}px`;
    autocompleteDropdown.style.display = "block";
    activeAutocompleteInput = inputElement;
  }
  function hideAutocompleteSuggestions() {
    if (autocompleteDropdown) {
      autocompleteDropdown.style.display = "none";
      highlightedAutocompleteIndex = -1;
    }
    activeAutocompleteInput = null;
  }
  function selectAutocompleteSuggestion(itemElement, inputElement, type = 'language') {
    if (type === 'language') {
      inputElement.value = itemElement.dataset.languageName;
      const flagImg = inputElement.parentElement.querySelector(".language-flag");
      if (flagImg) {
        flagImg.src = chrome.runtime.getURL(
          `country-flags/svg/${itemElement.dataset.languageCode.toLowerCase()}.svg`,
        );
        flagImg.alt = `${itemElement.dataset.languageName} flag`;
      }
    } else if (type === 'model') {
      inputElement.value = itemElement.dataset.modelId;
    }
    const event = new Event("input", { bubbles: true });
    inputElement.dispatchEvent(event);
    hideAutocompleteSuggestions();
  }
  function handleAutocompleteKeydown(event) {
    if (!autocompleteDropdown || autocompleteDropdown.style.display === "none")
      return;
    const items = autocompleteDropdown.querySelectorAll(".autocomplete-item");
    if (items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlightedAutocompleteIndex =
        (highlightedAutocompleteIndex + 1) % items.length;
      updateAutocompleteHighlight(items);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlightedAutocompleteIndex =
        (highlightedAutocompleteIndex - 1 + items.length) % items.length;
      updateAutocompleteHighlight(items);
    } else if (event.key === "Enter") {
      if (highlightedAutocompleteIndex > -1) {
        event.preventDefault();
        selectAutocompleteSuggestion(
          items[highlightedAutocompleteIndex],
          activeAutocompleteInput,
          activeAutocompleteInput.id.startsWith('modelText_') ? 'model' : 'language'
        );
      }
    } else if (event.key === "Escape") {
      hideAutocompleteSuggestions();
    }
  }
  function updateAutocompleteHighlight(items) {
    items.forEach((item, index) => {
      item.classList.toggle("selected", index === highlightedAutocompleteIndex);
    });
  }
  function handleGlobalClick(event) {
    const clickedInside =
      activeAutocompleteInput &&
      activeAutocompleteInput
        .closest(".language-input-wrapper")
        .contains(event.target);
    if (!clickedInside) {
      hideAutocompleteSuggestions();
    }
  }
  // --- End Autocomplete Functions ---
  // --- Model Selection Rendering and Handlers (UPDATED - No Labels) ---
  function renderModelOptions() {
    if (!modelSelectionArea) return;
    modelSelectionArea.innerHTML = "";

    if (!currentModels || currentModels.length === 0) {
      modelSelectionArea.innerHTML =
        "<p>No models configured. Add one below or save to use defaults.</p>";
      if (addModelBtn) addModelBtn.disabled = true;
      return;
    }

    if (addModelBtn) {
      addModelBtn.disabled = currentModels.length >= MAX_MODELS;
      addModelBtn.title =
        currentModels.length >= MAX_MODELS
          ? `Maximum limit of ${MAX_MODELS} models reached.`
          : `Add another model (max ${MAX_MODELS}).`;
    }

    const validModelIds = currentModels
      .filter((m) => m.id.trim() !== "")
      .map((m) => m.id);
    if (!validModelIds.includes(currentSummaryModelId)) {
      currentSummaryModelId = validModelIds.length > 0 ? validModelIds[0] : "";
    }
    if (!validModelIds.includes(currentChatModelId)) {
      currentChatModelId = validModelIds.length > 0 ? validModelIds[0] : "";
    }

    currentModels.forEach((model, index) => {
      const modelIdTrimmed = model.id.trim();
      const isModelIdValid = modelIdTrimmed !== "";

      const group = document.createElement("div");
      group.className = "option-group model-option";

      // --- Model Info (ID Input ONLY) ---
      const modelInfo = document.createElement("div");
      modelInfo.className = "model-info"; // Wrapper div

      const textInput = document.createElement("input"); // Model ID Input
      textInput.type = "text";
      textInput.id = `modelText_${index}`;
      textInput.value = model.id;
      textInput.placeholder = "Enter OpenRouter Model ID";
      textInput.dataset.index = index;
      textInput.addEventListener("input", handleModelTextChange);

      modelInfo.appendChild(textInput); // Only append ID input
      group.appendChild(modelInfo);
      setupAutocomplete(textInput, 'model'); // Setup autocomplete for model input

      // --- Radios Container (Summary + Chat) ---
      const modelRadios = document.createElement("div");
      modelRadios.className = "model-radios";

      // -- Summary Radio Group --
      const summaryGroup = document.createElement("div");
      summaryGroup.className = "radio-group";
      const summaryRadio = document.createElement("input");
      summaryRadio.type = "radio";
      summaryRadio.id = `summary-radio-${index}`;
      summaryRadio.name = "summary-default";
      summaryRadio.value = modelIdTrimmed;
      summaryRadio.checked =
        isModelIdValid && modelIdTrimmed === currentSummaryModelId;
      summaryRadio.disabled = !isModelIdValid;
      summaryRadio.dataset.index = index;
      summaryRadio.addEventListener("change", handleRadioChange);
      summaryRadio.addEventListener("change", () =>
        calculateKbLimitForSummary(),
      );
      const summaryLabel = document.createElement("label");
      summaryLabel.htmlFor = summaryRadio.id;
      summaryLabel.className = "radio-label";
      summaryLabel.textContent = "Summary";
      summaryGroup.appendChild(summaryRadio);
      summaryGroup.appendChild(summaryLabel);
      modelRadios.appendChild(summaryGroup);

      // -- Chat Radio Group --
      const chatGroup = document.createElement("div");
      chatGroup.className = "radio-group";
      const chatRadio = document.createElement("input");
      chatRadio.type = "radio";
      chatRadio.id = `chat-radio-${index}`;
      chatRadio.name = "chat-default";
      chatRadio.value = modelIdTrimmed;
      chatRadio.checked =
        isModelIdValid && modelIdTrimmed === currentChatModelId;
      chatRadio.disabled = !isModelIdValid;
      chatRadio.dataset.index = index;
      chatRadio.addEventListener("change", handleRadioChange);
      const chatLabel = document.createElement("label");
      chatLabel.htmlFor = chatRadio.id;
      chatLabel.className = "radio-label";
      chatLabel.textContent = "Chat";
      chatGroup.appendChild(chatRadio);
      chatGroup.appendChild(chatLabel);
      modelRadios.appendChild(chatGroup);

      group.appendChild(modelRadios);

      // --- Remove Button ---
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "✕";
      removeBtn.className = "button remove-button";
      removeBtn.title = "Remove this model";
      removeBtn.dataset.index = index;
      removeBtn.addEventListener("click", handleModelRemoveClick);
      group.appendChild(removeBtn);

      modelSelectionArea.appendChild(group);
    });
    calculateKbLimitForSummary();
  }

  // Handler for Summary/Chat radio changes (Updated for immediate save)
  function handleRadioChange(event) {
    if (!event.target.checked) return;
    const modelId = event.target.value;
    const type = event.target.name === "summary-default" ? "summary" : "chat";

    if (type === "summary") {
      currentSummaryModelId = modelId;
      if (DEBUG)
        console.log(
          `[LLM Options] New Summary Default: ${currentSummaryModelId}`,
        );
    } else if (type === "chat") {
      currentChatModelId = modelId;
      if (DEBUG)
        console.log(`[LLM Options] New Chat Default: ${currentChatModelId}`);
    }
    saveSettings(); // Save settings immediately after selection
  }

  // UPDATED Handler for Model ID text changes (No Label Logic)
  function handleModelTextChange(event) {
    const idx = parseInt(event.target.dataset.index, 10);
    if (idx < 0 || idx >= currentModels.length) return; // Add boundary check

    const oldModelId = currentModels[idx].id.trim();
    const newModelId = event.target.value.trim();
    const isNewIdValid = newModelId !== "";

    currentModels[idx].id = newModelId;

    // Update the corresponding radio buttons' values and disabled state
    const summaryRadio = document.getElementById(`summary-radio-${idx}`);
    const chatRadio = document.getElementById(`chat-radio-${idx}`);

    let needsReRender = false; // Flag if defaults need recalculation

    if (summaryRadio) {
      summaryRadio.value = newModelId;
      summaryRadio.disabled = !isNewIdValid;
      if (!isNewIdValid && summaryRadio.checked) {
        summaryRadio.checked = false;
        const firstValid = currentModels.find(
          (m, i) => i !== idx && m.id.trim() !== "",
        );
        currentSummaryModelId = firstValid ? firstValid.id.trim() : "";
        needsReRender = true;
      }
    }
    if (chatRadio) {
      chatRadio.value = newModelId;
      chatRadio.disabled = !isNewIdValid;
      if (!isNewIdValid && chatRadio.checked) {
        chatRadio.checked = false;
        const firstValid = currentModels.find(
          (m, i) => i !== idx && m.id.trim() !== "",
        );
        currentChatModelId = firstValid ? firstValid.id.trim() : "";
        needsReRender = true;
      }
    }

    // Re-render if defaults were potentially invalidated and reset
    if (needsReRender) {
      if (DEBUG)
        console.log(
          `[LLM Options] Model ID made invalid, re-calculating defaults and re-rendering.`,
        );
      renderModelOptions();
      return; // Exit early as render handles the rest
    }

    // Update default selections if the changed model *was* the default
    if (oldModelId === currentSummaryModelId && isNewIdValid) {
      currentSummaryModelId = newModelId;
    }
    if (oldModelId === currentChatModelId && isNewIdValid) {
      currentChatModelId = newModelId;
    }
  }

  // REMOVED handleModelLabelChange function entirely

  // Handler for Model Removal (Unchanged logic, state already lacks labels)
  function handleModelRemoveClick(event) {
    const index = parseInt(event.target.dataset.index, 10);
    if (index < 0 || index >= currentModels.length) return;

    const removedModelId = currentModels[index].id.trim();
    currentModels.splice(index, 1);

    const remainingValidIds = currentModels
      .filter((m) => m.id.trim() !== "")
      .map((m) => m.id.trim());
    const newDefaultId =
      remainingValidIds.length > 0 ? remainingValidIds[0] : "";

    let changedDefaults = false;
    if (removedModelId !== "" && removedModelId === currentSummaryModelId) {
      currentSummaryModelId = newDefaultId;
      changedDefaults = true;
      if (DEBUG)
        console.log(
          `[LLM Options] Summary default removed, new default: ${currentSummaryModelId || "None"}`,
        );
    }
    if (removedModelId !== "" && removedModelId === currentChatModelId) {
      currentChatModelId = newDefaultId;
      changedDefaults = true;
      if (DEBUG)
        console.log(
          `[LLM Options] Chat default removed, new default: ${currentChatModelId || "None"}`,
        );
    }

    renderModelOptions();
  }

  // UPDATED Function to add a new model row (No Label)
  function addModel() {
    if (currentModels.length < MAX_MODELS) {
      currentModels.push({ id: "" }); // Only add ID property
      renderModelOptions();
      const newIndex = currentModels.length - 1;
      const newInput = document.getElementById(`modelText_${newIndex}`);
      if (newInput) {
        newInput.focus();
      }
      checkPricingData(); // Check for missing pricing data after adding a new model
      if (DEBUG) console.log("[LLM Options] Added new model row (no label).");
    } else {
      alert(`Maximum limit of ${MAX_MODELS} models reached.`);
      if (DEBUG)
        console.warn(`[LLM Options] Max models (${MAX_MODELS}) reached.`);
    }
  }
  // --- End Model Selection ---

  // --- Language Selection Rendering and Handlers (Unchanged) ---
  function renderLanguageOptions() {
    if (!languageSelectionArea) return;
    languageSelectionArea.innerHTML = "";
    language_info.forEach((langInfo, index) => {
      const group = document.createElement("div");
      group.className = "option-group language-option";
      group.dataset.index = index;
      const grabHandle = document.createElement("div");
      grabHandle.className = "grab-handle";
      grabHandle.draggable = true;
      grabHandle.title = "Drag to reorder";
      grabHandle.setAttribute("aria-label", "Drag to reorder language");
      grabHandle.setAttribute("role", "button");
      grabHandle.setAttribute("tabindex", "0");
      const dotsContainer = document.createElement("div");
      dotsContainer.className = "grab-handle-dots";
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement("div");
        dot.className = "grab-handle-dot";
        dotsContainer.appendChild(dot);
      }
      grabHandle.appendChild(dotsContainer);
      grabHandle.addEventListener("dragstart", handleDragStart);
      grabHandle.addEventListener("dragend", handleDragEnd);
      const label = document.createElement("label");
      label.className = "language-input-wrapper";
      const flagImg = document.createElement("img");
      flagImg.className = LANGUAGE_FLAG_CLASS;
      flagImg.src = langInfo.svg_path;
      flagImg.alt = `${langInfo.language_name} flag`;
      const textInput = document.createElement("input");
      textInput.type = "text";
      textInput.id = `langText_${index}`;
      textInput.value = langInfo.language_name;
      textInput.placeholder = "Enter Language Name";
      textInput.dataset.index = index;
      textInput.setAttribute("autocomplete", "off");
      textInput.addEventListener("input", handleLanguageTextChange);
      label.appendChild(flagImg);
      label.appendChild(textInput);
      group.appendChild(grabHandle);
      group.appendChild(label);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "✕";
      removeBtn.className = "button remove-button";
      removeBtn.title = "Remove this language";
      removeBtn.dataset.index = index;
      removeBtn.addEventListener("click", handleLanguageRemoveClick);
      group.appendChild(removeBtn);
      group.addEventListener("dragover", handleDragOver);
      group.addEventListener("dragleave", handleDragLeave);
      group.addEventListener("drop", handleDrop);
      languageSelectionArea.appendChild(group);
      setupAutocomplete(textInput);
    });

    if (addLangBtn) {
      addLangBtn.disabled = language_info.length >= MAX_LANGUAGES;
      addLangBtn.title =
        language_info.length >= MAX_LANGUAGES
          ? `Maximum limit of ${MAX_LANGUAGES} languages reached.`
          : `Add another language (max ${MAX_LANGUAGES}).`;
    }
  }
  function handleLanguageTextChange(event) {
    const newLangName = event.target.value.trim();
    const idx = parseInt(event.target.dataset.index, 10);
    if (idx >= 0 && idx < language_info.length) {
      language_info[idx].language_name = newLangName;
      const foundLang = allLanguages.find(
        (lang) => lang.name.toLowerCase() === newLangName.toLowerCase(),
      );
      if (foundLang) {
        language_info[idx].svg_path = chrome.runtime.getURL(
          `country-flags/svg/${foundLang.code.toLowerCase()}.svg`,
        );
        const flagImg =
          event.target.parentElement.querySelector(".language-flag");
        if (flagImg) {
          flagImg.src = language_info[idx].svg_path;
          flagImg.alt = `${newLangName} flag`;
        }
      } // If not found, keep existing svg_path (might be 'un')
    }
  }
  function handleLanguageRemoveClick(event) {
    const index = parseInt(event.target.dataset.index, 10);
    if (index >= 0 && index < language_info.length) {
      language_info.splice(index, 1);
      if (language_info.length === 0) {
        // Repopulate with defaults if list becomes empty
        const defaultLanguages = [
          "English",
          "Spanish",
          "Hebrew",
          "Mandarin Chinese",
        ];
        language_info = defaultLanguages.map((langName) => {
          const lang = allLanguages.find((l) => l.name === langName);
          return {
            language_name: langName,
            svg_path: lang
              ? chrome.runtime.getURL(
                  `country-flags/svg/${lang.code.toLowerCase()}.svg`,
                )
              : chrome.runtime.getURL("country-flags/svg/un.svg"),
          };
        });
      }
      renderLanguageOptions();
    }
  }
  function addLanguage() {
    if (language_info.length < MAX_LANGUAGES) {
      language_info.push({
        language_name: "",
        svg_path: chrome.runtime.getURL("country-flags/svg/un.svg"),
      });
      renderLanguageOptions();
      const newIndex = language_info.length - 1;
      const newInput = document.getElementById(`langText_${newIndex}`);
      if (newInput) newInput.focus();
      if (DEBUG) console.log("[LLM Options] Added new language row.");
    } else {
      alert(`Maximum limit of ${MAX_LANGUAGES} languages reached.`);
      if (DEBUG)
        console.warn(`[LLM Options] Max languages (${MAX_LANGUAGES}) reached.`);
    }
  }
  // --- Drag and Drop Handlers (Unchanged) ---
  function handleDragStart(event) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "text/plain",
      event.target.closest(".language-option").dataset.index,
    );
    draggedItemIndex = parseInt(
      event.target.closest(".language-option").dataset.index,
      10,
    );
    if (DEBUG)
      console.log(
        `[LLM Options] Drag started on language index: ${draggedItemIndex}`,
      );
    // Use setTimeout to allow the browser to render the drag image before applying class
    setTimeout(() => {
      if (event.target.closest(".language-option")) {
        event.target.closest(".language-option").classList.add("dragging");
      }
    }, 0);
  }
  function handleDragEnd(event) {
    // Find the element that was being dragged using the index if possible
    const draggedElement = languageSelectionArea.querySelector(
      `.language-option[data-index="${draggedItemIndex}"]`,
    );
    if (draggedElement) {
      draggedElement.classList.remove("dragging");
    } else {
      // Fallback if index somehow changed or element removed
      const draggingElements = languageSelectionArea.querySelectorAll(
        ".language-option.dragging",
      );
      draggingElements.forEach((el) => el.classList.remove("dragging"));
    }

    // Clear drag over styles from all items defensively
    languageSelectionArea.querySelectorAll(".language-option").forEach((el) => {
      el.classList.remove("drag-over-top", "drag-over-bottom");
    });
    draggedItemIndex = null;
    if (DEBUG) console.log("[LLM Options] Drag ended for language.");
  }
  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const targetElement = event.target.closest(".language-option");
    if (!targetElement || draggedItemIndex === null) return; // Ensure we have a target and are dragging
    const targetIndex = parseInt(targetElement.dataset.index, 10);

    // Clear previous indicators first
    languageSelectionArea.querySelectorAll(".language-option").forEach((el) => {
      // Don't remove indicator from the current target element yet
      if (el !== targetElement) {
        el.classList.remove("drag-over-top", "drag-over-bottom");
      }
    });

    if (draggedItemIndex !== targetIndex) {
      // Don't show indicator when hovering over itself
      const rect = targetElement.getBoundingClientRect();
      const isOverTopHalf = event.clientY < rect.top + rect.height / 2;
      if (isOverTopHalf) {
        targetElement.classList.add("drag-over-top");
        targetElement.classList.remove("drag-over-bottom");
      } else {
        targetElement.classList.add("drag-over-bottom");
        targetElement.classList.remove("drag-over-top");
      }
    } else {
      // Clear indicators if hovering over the original dragged item
      targetElement.classList.remove("drag-over-top", "drag-over-bottom");
    }
  }
  function handleDragLeave(event) {
    const relatedTarget = event.relatedTarget;
    const targetElement = event.target.closest(".language-option");

    // Check if the mouse is leaving the element entirely or just moving to a child/parent within it
    if (
      targetElement &&
      (!relatedTarget || !targetElement.contains(relatedTarget))
    ) {
      targetElement.classList.remove("drag-over-top", "drag-over-bottom");
    }
  }
  function handleDrop(event) {
    event.preventDefault();
    const targetElement = event.target.closest(".language-option");
    if (!targetElement || draggedItemIndex === null) return;

    const targetIndex = parseInt(targetElement.dataset.index, 10);
    targetElement.classList.remove("drag-over-top", "drag-over-bottom"); // Clean up indicator

    // Prevent dropping onto itself
    if (draggedItemIndex === targetIndex) {
      draggedItemIndex = null; // Reset drag state
      return;
    }

    const draggedItem = language_info[draggedItemIndex];
    if (!draggedItem) {
      // Safety check
      console.error("Could not find dragged item at index", draggedItemIndex);
      draggedItemIndex = null;
      return;
    }

    // Remove from old position first
    language_info.splice(draggedItemIndex, 1);

    // Calculate new index based on drop position relative to target
    const rect = targetElement.getBoundingClientRect();
    const isOverTopHalf = event.clientY < rect.top + rect.height / 2;

    // Determine insertion index: Before target if dropped on top half, Adjusted index if dropped on bottom half
    let newIndex =
      draggedItemIndex < targetIndex ? targetIndex - 1 : targetIndex; // Adjust index because splice shifted items
    if (!isOverTopHalf) {
      newIndex = draggedItemIndex < targetIndex ? targetIndex : targetIndex + 1; // Insert after target
    }

    // Insert at the calculated new position
    language_info.splice(newIndex, 0, draggedItem);

    if (DEBUG)
      console.log(
        `[LLM Options] Dropped language from original index ${draggedItemIndex} to new index ${newIndex}`,
      );
    renderLanguageOptions(); // Re-render to apply new order and indices

    draggedItemIndex = null; // Reset dragged item index
  }
  // --- End Language Selection ---

  // --- Prompt Preview & Collapsible (Unchanged) ---
  function updatePromptPreview() {
    let bulletCount = DEFAULT_BULLET_COUNT;
    document.querySelectorAll('input[name="bulletCount"]').forEach((radio) => {
      if (radio.checked) bulletCount = radio.value;
    });
    const bulletWord = NUM_TO_WORD[bulletCount] || "five";
    if (promptPreambleDiv)
      promptPreambleDiv.textContent = DEFAULT_PREAMBLE_TEMPLATE.replace(
        "${bulletWord}",
        bulletWord,
      );
    if (promptPostambleDiv)
      promptPostambleDiv.textContent = DEFAULT_POSTAMBLE_TEXT;
    if (promptFormatInstructionsTextarea)
      promptFormatInstructionsTextarea.value = currentCustomFormatInstructions;
  }
  function setupCollapsible() {
    if (advancedOptionsToggle && advancedOptionsContent) {
      const toggleSection = () => {
        const isExpanded =
          advancedOptionsToggle.getAttribute("aria-expanded") === "true";
        advancedOptionsToggle.setAttribute("aria-expanded", !isExpanded);
        advancedOptionsContent.classList.toggle("active");
        const toggleIndicator =
          advancedOptionsToggle.querySelector(".toggle-indicator");
        if (toggleIndicator)
          toggleIndicator.textContent = isExpanded ? "►" : "▼";
      };
      advancedOptionsToggle.addEventListener("click", toggleSection);
      advancedOptionsToggle.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleSection();
        }
      });
      const isInitiallyExpanded = false;
      advancedOptionsToggle.setAttribute("aria-expanded", isInitiallyExpanded);
      if (isInitiallyExpanded) advancedOptionsContent.classList.add("active");
      const initialIndicator =
        advancedOptionsToggle.querySelector(".toggle-indicator");
      if (initialIndicator)
        initialIndicator.textContent = isInitiallyExpanded ? "▼" : "►";
    }
  }
  // --- End Prompt Preview ---

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
    
    if (Object.keys(knownModelsAndPrices).length > 0) {
      const firstModel = Object.values(knownModelsAndPrices)[0];
      if (firstModel && firstModel.timestamp) {
        isDataExpired = currentTime - firstModel.timestamp >= cacheExpiry;
      }
    }
    
    if (Object.keys(knownModelsAndPrices).length === 0 || isDataExpired) {
      pricingNotification.textContent = "Model and pricing data missing or expired. Fetching data...";
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
  function updateKnownModelsAndPricing() {
    if (!pricingNotification || !updatePricingBtn) return;
    
    updatePricingBtn.disabled = true;
    pricingNotification.textContent = "Fetching model and pricing data...";
    
    chrome.runtime.sendMessage({
      action: "updateKnownModelsAndPricing"
    }, (response) => {
      if (chrome.runtime.lastError || !response || response.status !== "success") {
        pricingNotification.textContent = `Error updating data: ${chrome.runtime.lastError?.message || response?.message || "Unknown error"}`;
        if (DEBUG) console.error("[LLM Options] Error updating model and pricing data:", chrome.runtime.lastError || response?.message);
      } else {
        const updated = response.updated || 0;
        pricingNotification.textContent = `Updated data for ${updated} model(s). Settings saved.`;
        if (DEBUG) console.log(`[LLM Options] Updated data for ${updated} models.`);
        // Reload the cache after update
        chrome.storage.local.get(STORAGE_KEY_KNOWN_MODELS_AND_PRICES, (cacheData) => {
          knownModelsAndPrices = cacheData[STORAGE_KEY_KNOWN_MODELS_AND_PRICES] || {};
          if (DEBUG) console.log("[LLM Options] Reloaded model and pricing data:", knownModelsAndPrices);
          calculateKbLimitForSummary(); // Recalculate KB limit after updating data
          validateCurrentModels(); // Validate models after update
          updateAllModelsList(); // Update autocomplete list after data refresh
        });
        // Save settings after successful refresh to confirm API key validity
        if (apiKeyInput && apiKeyInput.value.trim()) {
          if (DEBUG) console.log("[LLM Options] API key validated, saving settings automatically.");
          saveSettings();
        } else {
          if (DEBUG) console.log("[LLM Options] API key is empty, skipping automatic save.");
        }
      }
      updatePricingBtn.disabled = false;
    });
  }
  
  /**
   * Validates current models against known_models_and_prices and updates UI if necessary.
   */
  function validateCurrentModels() {
    if (Object.keys(knownModelsAndPrices).length === 0) return;
    
    const validModelIds = Object.keys(knownModelsAndPrices);
    let hasChanged = false;
    
    // Check summary model
    if (currentSummaryModelId && !validModelIds.includes(currentSummaryModelId)) {
      const newSummaryModel = validModelIds.length > 0 ? validModelIds[0] : "";
      if (DEBUG) console.log(`[LLM Options] Summary model ${currentSummaryModelId} not compatible, switching to ${newSummaryModel}`);
      currentSummaryModelId = newSummaryModel;
      hasChanged = true;
    }
    
    // Check chat model (optional flexibility)
    if (currentChatModelId && !validModelIds.includes(currentChatModelId)) {
      const newChatModel = validModelIds.length > 0 ? validModelIds[0] : "";
      if (DEBUG) console.log(`[LLM Options] Chat model ${currentChatModelId} not compatible, switching to ${newChatModel}`);
      currentChatModelId = newChatModel;
      hasChanged = true;
    }
    
    // Check all configured models and warn if some are not in the known list
    const unknownModels = currentModels.filter(model => model.id && !validModelIds.includes(model.id));
    if (unknownModels.length > 0) {
      if (DEBUG) console.log(`[LLM Options] Unknown models detected:`, unknownModels);
      // Optionally notify user or adjust list
    }
    
    if (hasChanged) {
      renderModelOptions();
    }
  }

  // --- Load, Save, Reset (UPDATED - No Labels) ---
  async function loadSettings() {
    try {
      DEBUG =
        (await chrome.storage.sync.get("debug"))?.debug ?? DEFAULT_DEBUG_MODE;
    } catch (e) {
      DEBUG = DEFAULT_DEBUG_MODE;
    }
    if (DEBUG) console.log("[LLM Options] Loading settings...");

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

      const keysToGet = [
        "apiKey",
        "models",
        "summaryModelId",
        "chatModelId",
        "debug",
        "bulletCount",
        "language_info",
        PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
        STORAGE_KEY_MAX_REQUEST_PRICE,
        STORAGE_KEY_MAX_PRICE_BEHAVIOR,
        STORAGE_KEY_NEWSBLUR_TOKEN,
        STORAGE_KEY_JOPLIN_TOKEN, // New: Joplin API Token
      ];
      const data = await chrome.storage.sync.get(keysToGet);

      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
      }

      DEBUG = data.debug ?? DEFAULT_DEBUG_MODE;
      if (apiKeyInput) apiKeyInput.value = data.apiKey || "";
      if (newsblurTokenInput) newsblurTokenInput.value = data[STORAGE_KEY_NEWSBLUR_TOKEN] || "";
      if (joplinTokenInput) joplinTokenInput.value = data[STORAGE_KEY_JOPLIN_TOKEN] || ""; // New: Populate Joplin Token Input
      if (debugCheckbox) debugCheckbox.checked = DEBUG;

      let countValue = data.bulletCount || DEFAULT_BULLET_COUNT;
      bulletCountRadios.forEach(
        (radio) => (radio.checked = radio.value === countValue),
      );

      // Load models - now expect array of {id: string}
      currentModels = data.models || [...DEFAULT_MODEL_OPTIONS];
      // Basic validation: ensure models is an array and items have an 'id'
      if (
        !Array.isArray(currentModels) ||
        currentModels.some((m) => typeof m.id !== "string")
      ) {
        console.warn(
          "[LLM Options] Loaded models data is invalid, resetting to defaults.",
        );
        currentModels = [...DEFAULT_MODEL_OPTIONS];
      }

      currentSummaryModelId = data.summaryModelId || "";
      currentChatModelId = data.chatModelId || "";

      const validModelIds = currentModels
        .filter((m) => m.id.trim() !== "")
        .map((m) => m.id.trim());
      if (validModelIds.length === 0) {
        currentModels = [...DEFAULT_MODEL_OPTIONS]; // Use defaults from constants (already no labels)
        const firstDefaultId =
          currentModels.length > 0 ? currentModels[0].id : "";
        currentSummaryModelId = firstDefaultId;
        currentChatModelId = firstDefaultId;
        if (DEBUG)
          console.warn(
            "[LLM Options] No valid models loaded or found, resetting to defaults.",
          );
      } else {
        if (!validModelIds.includes(currentSummaryModelId)) {
          currentSummaryModelId = validModelIds[0];
          if (DEBUG)
            console.warn(
              "[LLM Options] Loaded summary default invalid, resetting to first available.",
            );
        }
        if (!validModelIds.includes(currentChatModelId)) {
          currentChatModelId = validModelIds[0];
          if (DEBUG)
            console.warn(
              "[LLM Options] Loaded chat default invalid, resetting to first available.",
            );
        }
      }

      language_info = data.language_info || [];
      if (language_info.length === 0) {
        const defaultLanguages = [
          "English",
          "Spanish",
          "Hebrew",
          "Mandarin Chinese",
        ];
        language_info = defaultLanguages.map((langName) => {
          const lang = allLanguages.find((l) => l.name === langName);
          return {
            language_name: langName,
            svg_path: lang
              ? chrome.runtime.getURL(
                  `country-flags/svg/${lang.code.toLowerCase()}.svg`,
                )
              : chrome.runtime.getURL("country-flags/svg/un.svg"),
          };
        });
        if (DEBUG)
          console.log("[LLM Options] No languages loaded, applying defaults.");
      }

      currentCustomFormatInstructions =
        data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] || DEFAULT_FORMAT_INSTRUCTIONS;
      if (promptFormatInstructionsTextarea)
        promptFormatInstructionsTextarea.value =
          currentCustomFormatInstructions;

      currentMaxRequestPrice =
        data[STORAGE_KEY_MAX_REQUEST_PRICE] || DEFAULT_MAX_REQUEST_PRICE;
      currentMaxPriceBehavior =
        data[STORAGE_KEY_MAX_PRICE_BEHAVIOR] || DEFAULT_MAX_PRICE_BEHAVIOR;
      // Handled in calculateKbLimitForSummary

      // Load known models and pricing data from local storage
      const cacheData = await chrome.storage.local.get([STORAGE_KEY_PRICING_CACHE, STORAGE_KEY_KNOWN_MODELS_AND_PRICES]);
      modelPricingCache = cacheData[STORAGE_KEY_PRICING_CACHE] || {};
      knownModelsAndPrices = cacheData[STORAGE_KEY_KNOWN_MODELS_AND_PRICES] || {};
      if (DEBUG) console.log("[LLM Options] Loaded pricing cache:", modelPricingCache);
      if (DEBUG) console.log("[LLM Options] Loaded known models and pricing data:", knownModelsAndPrices);
      
      // Populate allModels from knownModelsAndPrices for autocomplete
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
      document.querySelector(`input[name="maxPriceBehavior"][value="${currentMaxPriceBehavior}"]`).checked = true;
      if (DEBUG) console.log("[LLM Options] Settings loaded successfully.");
    } catch (error) {
      showError(`Error loading settings: ${error.message}. Using defaults.`);
      if (apiKeyInput) apiKeyInput.value = "";
      if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
      DEBUG = DEFAULT_DEBUG_MODE;
      bulletCountRadios.forEach(
        (radio) => (radio.checked = radio.value === DEFAULT_BULLET_COUNT),
      );
      currentModels = [...DEFAULT_MODEL_OPTIONS]; // Use defaults from constants (no labels)
      const firstDefaultId =
        currentModels.length > 0 ? currentModels[0].id : "";
      currentSummaryModelId = firstDefaultId;
      currentChatModelId = firstDefaultId;
      language_info = [];
      currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
      if (promptFormatInstructionsTextarea)
        promptFormatInstructionsTextarea.value =
          currentCustomFormatInstructions;
      currentMaxRequestPrice = DEFAULT_MAX_REQUEST_PRICE;
      currentMaxPriceBehavior = DEFAULT_MAX_PRICE_BEHAVIOR;
      // Input field is handled in calculateKbLimitForSummary
      if (DEBUG)
        console.error(
          "[LLM Options] Error loading settings, applied defaults.",
          error,
        );
    }

    renderModelOptions();
    renderLanguageOptions();
    updatePromptPreview();
    calculateKbLimitForSummary();
    checkModelAndPricingData(); // Check pricing data on load
  }

  // UPDATED Save Settings function (No Labels)
  function saveSettings() {
    if (DEBUG) console.log("[LLM Options] Attempting to save settings...");
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
    const debug = debugCheckbox ? debugCheckbox.checked : false;
    let bulletCount = DEFAULT_BULLET_COUNT;
    document.querySelectorAll('input[name="bulletCount"]').forEach((radio) => {
      if (radio.checked) bulletCount = radio.value;
    });
    const customFormatInstructionsToSave = promptFormatInstructionsTextarea
      ? promptFormatInstructionsTextarea.value
      : currentCustomFormatInstructions;

    // Filter models: keep only valid IDs, limit count, store only {id: string}
    const modelsToSave = currentModels
      .map((m) => ({ id: m.id.trim() })) // Create object with only id
      .filter((m) => m.id !== "") // Keep only those with valid IDs
      .slice(0, MAX_MODELS); // Enforce maximum

    const savedModelIds = modelsToSave.map((m) => m.id);
    let finalSummaryModelId = currentSummaryModelId;
    let finalChatModelId = currentChatModelId;

    if (!savedModelIds.includes(finalSummaryModelId)) {
      finalSummaryModelId = savedModelIds.length > 0 ? savedModelIds[0] : "";
      if (DEBUG)
        console.warn(
          `[LLM Options] Summary default "${currentSummaryModelId}" invalid on save, resetting to "${finalSummaryModelId}".`,
        );
    }
    if (!savedModelIds.includes(finalChatModelId)) {
      finalChatModelId = savedModelIds.length > 0 ? savedModelIds[0] : "";
      if (DEBUG)
        console.warn(
          `[LLM Options] Chat default "${currentChatModelId}" invalid on save, resetting to "${finalChatModelId}".`,
        );
    }

    // Filter languages (unchanged from previous version)
    const language_infoToSave = language_info
      .map((lang) => {
        const name = lang.language_name.trim();
        if (name === "") return null;
        const foundLang = allLanguages.find(
          (l) => l.name.toLowerCase() === name.toLowerCase(),
        );
        if (!foundLang) {
          if (DEBUG)
            console.warn(
              `[LLM Options] Invalid language name "${name}" skipped on save.`,
            );
          return null;
        }
        return {
          language_name: foundLang.name,
          svg_path: chrome.runtime.getURL(
            `country-flags/svg/${foundLang.code.toLowerCase()}.svg`,
          ),
        };
      })
      .filter((item) => item !== null)
      .slice(0, MAX_LANGUAGES);

    const settingsToSave = {
      apiKey,
      models: modelsToSave, // Now saves array of {id: string}
      summaryModelId: finalSummaryModelId,
      chatModelId: finalChatModelId,
      debug,
      bulletCount,
      language_info: language_infoToSave,
      [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]: customFormatInstructionsToSave,
      [PROMPT_STORAGE_KEY_PREAMBLE]: DEFAULT_PREAMBLE_TEMPLATE,
      [PROMPT_STORAGE_KEY_POSTAMBLE]: DEFAULT_POSTAMBLE_TEXT,
      [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]: DEFAULT_FORMAT_INSTRUCTIONS,
      [STORAGE_KEY_MAX_REQUEST_PRICE]: currentMaxRequestPrice,
      [STORAGE_KEY_MAX_PRICE_BEHAVIOR]: currentMaxPriceBehavior,
      [STORAGE_KEY_NEWSBLUR_TOKEN]: newsblurTokenInput ? newsblurTokenInput.value.trim() : "", // New: Save NewsBlur Token
    };

    if (DEBUG)
      console.log(
        "[LLM Options] Settings prepared for saving (no labels):",
        settingsToSave,
      );

    chrome.storage.sync.set(settingsToSave, () => {
      if (chrome.runtime.lastError) {
        showError(`Error saving settings: ${chrome.runtime.lastError.message}`);
        if (statusMessage) {
          statusMessage.textContent = "Error saving options!";
          statusMessage.className = "status-message error";
        }
        if (DEBUG)
          console.error(
            "[LLM Options] Error saving settings:",
            chrome.runtime.lastError,
          );
      } else {
        if (DEBUG)
          console.log("[LLM Options] Settings saved successfully via API.");
        // Optional verification
        chrome.storage.sync.get(
          ["models", "summaryModelId", "chatModelId"],
          (retrievedData) => {
            if (
              JSON.stringify(settingsToSave.models) !==
                JSON.stringify(retrievedData.models) ||
              settingsToSave.summaryModelId !== retrievedData.summaryModelId ||
              settingsToSave.chatModelId !== retrievedData.chatModelId
            ) {
              console.warn(
                "[LLM Options] Save verification mismatch detected (basic check).",
              );
            } else {
              if (DEBUG)
                console.log(
                  "[LLM Options] Save verification passed (basic check).",
                );
            }
          },
        );

        if (statusMessage) {
          statusMessage.textContent = "Changes saved!";
          statusMessage.className = "status-message success";
          setTimeout(() => {
            statusMessage.textContent = "";
            statusMessage.className = "status-message";
          }, 1000); // Reduced timeout for immediate saves to be less intrusive
        }
      }
    });
  }

  // UPDATED Reset to Defaults function (Uses constants without labels)
  function resetToDefaults() {
    if (DEBUG) console.log("[LLM Options] Reset to Defaults initiated.");
    if (
      confirm(
        "Are you sure you want to reset all options (except API key) to their defaults?",
      )
    ) {
      if (DEBUG) console.log("[LLM Options] Reset confirmed.");

      // Reset Models using defaults from constants (already no labels)
      currentModels = [...DEFAULT_MODEL_OPTIONS];
      const firstDefaultId =
        currentModels.length > 0 ? currentModels[0].id : "";
      currentSummaryModelId = firstDefaultId;
      currentChatModelId = firstDefaultId;

      const defaultLanguages = [
        "English",
        "Spanish",
        "Hebrew",
        "Mandarin Chinese",
      ];
      language_info = defaultLanguages.map((langName) => {
        const lang = allLanguages.find((l) => l.name === langName);
        return {
          language_name: langName,
          svg_path: lang
            ? chrome.runtime.getURL(
                `country-flags/svg/${lang.code.toLowerCase()}.svg`,
              )
            : chrome.runtime.getURL("country-flags/svg/un.svg"),
        };
      });

      if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
      bulletCountRadios.forEach((radio) => {
        radio.checked = radio.value === DEFAULT_BULLET_COUNT;
      });
      currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
      if (promptFormatInstructionsTextarea)
        promptFormatInstructionsTextarea.value =
          currentCustomFormatInstructions;
      currentMaxRequestPrice = DEFAULT_MAX_REQUEST_PRICE;
      // Input field is handled in calculateKbLimitForSummary

      renderModelOptions();
      renderLanguageOptions();
      updatePromptPreview();
      calculateKbLimitForSummary();
      // Reset the radio button for max price behavior
      document.querySelector(`input[name="maxPriceBehavior"][value="${currentMaxPriceBehavior}"]`).checked = true;

      saveSettings();

      if (statusMessage) {
        statusMessage.textContent = "Options reset to defaults.";
        statusMessage.className = "status-message success";
        setTimeout(() => {
          statusMessage.textContent = "";
          statusMessage.className = "status-message";
        }, 2000);
      }
      if (DEBUG)
        console.log("[LLM Options] Reset operation completed and saved.");
    } else {
      if (DEBUG) console.log("[LLM Options] Reset cancelled.");
    }
  }
  // --- End Load, Save, Reset ---

  /**
   * Handles input changes for the max price field in the table.
   */
  function handleMaxPriceInput(event) {
    if (debounceTimeoutId) {
      clearTimeout(debounceTimeoutId);
    }
    debounceTimeoutId = setTimeout(() => {
      const priceValue = parseFloat(event.target.value);
      if (!isNaN(priceValue) && priceValue >= 0.001) {
        currentMaxRequestPrice = priceValue;
      } else if (!isNaN(priceValue) && priceValue < 0.001) {
        currentMaxRequestPrice = DEFAULT_MAX_REQUEST_PRICE;
        event.target.value = DEFAULT_MAX_REQUEST_PRICE.toFixed(3);
      }
      calculateKbLimitForSummary();
      debounceTimeoutId = null;
    }, DEBOUNCE_DELAY);
  }

  /**
   * Handles blur event for the max price field to reset invalid values.
   */
  function handleMaxPriceBlur(event) {
    const priceValue = parseFloat(event.target.value);
    if (isNaN(priceValue) || priceValue < 0.001) {
      event.target.value = DEFAULT_MAX_REQUEST_PRICE.toFixed(3);
      currentMaxRequestPrice = DEFAULT_MAX_REQUEST_PRICE;
      if (debounceTimeoutId) {
        clearTimeout(debounceTimeoutId);
      }
      calculateKbLimitForSummary();
    }
  }

  /**
   * Handles input changes for the NewsBlur token field, extracting token from URL if necessary.
   */
  function handleNewsblurTokenInput(event) {
    if (debounceTimeoutId) {
      clearTimeout(debounceTimeoutId);
    }
    debounceTimeoutId = setTimeout(() => {
      let tokenValue = newsblurTokenInput.value.trim();
      // Check if it's a URL and try to extract the token
      if (tokenValue.startsWith("http://") || tokenValue.startsWith("https://")) {
        try {
          const url = new URL(tokenValue);
          const pathParts = url.pathname.split('/');
          // Assuming token is the last part of the path, e.g., /NB/token_here
          // Or sometimes it's in a query parameter like ?token=...
          let extractedToken = pathParts[pathParts.length - 1];
          if (!extractedToken && url.searchParams.has('token')) {
            extractedToken = url.searchParams.get('token');
          } else if (!extractedToken && url.searchParams.has('secret')) { // Another possible param
            extractedToken = url.searchParams.get('secret');
          }

          // Basic validation for typical token format (alphanumeric, possibly with hyphens/underscores)
          // Ensure it's not just 'NB' or a short segment.
          if (extractedToken && /^[a-zA-Z0-9_-]{10,}$/.test(extractedToken) && extractedToken.toUpperCase() !== 'NB') {
            newsblurTokenInput.value = extractedToken; // Update input field with extracted token
            tokenValue = extractedToken;
            if (DEBUG) console.log("[LLM Options] Extracted NewsBlur token from URL:", tokenValue);
          } else {
            if (DEBUG) console.warn("[LLM Options] Could not extract a valid-looking NewsBlur token from URL:", tokenValue, "Extracted part:", extractedToken);
          }
        } catch (e) {
          if (DEBUG) console.warn("[LLM Options] Error parsing NewsBlur URL:", e);
          // If parsing fails, proceed with the raw value, it might be the token itself
        }
      }
      // Save all settings, as this function is also called on blur
      saveSettings();
      debounceTimeoutId = null;
    }, DEBOUNCE_DELAY);
  }

  /**
   * Handles input changes for the API key field with debouncing to prevent frequent updates.
   */
  function handleApiAndJoplinInput(event) {
    if (debounceTimeoutId) {
        clearTimeout(debounceTimeoutId);
   }
   debounceTimeoutId = setTimeout(() => {
       // This function saves all settings, so it's fine for both (apiKey and joplinToken)
       saveSettings();
       // Specific logic for API key to trigger model refresh
       if (event.target.id === 'apiKey') {
           const apiKey = apiKeyInput.value.trim();
           if (apiKey) {
               if (DEBUG) console.log("[LLM Options] API key entered, triggering model refresh after debounce.");
               updateKnownModelsAndPricing();
           } else {
               if (DEBUG) console.log("[LLM Options] API key is empty, skipping model refresh.");
           }
       }
       debounceTimeoutId = null;
   }, DEBOUNCE_DELAY);
 }

 /**
  * Updates the allModels list for autocomplete from knownModelsAndPrices.
  */
 function updateAllModelsList() {
   allModels = Object.values(knownModelsAndPrices).map(model => ({
     id: model.id,
     name: model.name || ''
   }));
   if (DEBUG) console.log("[LLM Options] Updated allModels list for autocomplete:", allModels.length, "models available.");
 }

 /**
  * Checks pricing data for all configured models and updates if necessary.
  */
 function checkPricingData() {
   if (!pricingNotification) return;
   
   const currentTime = Date.now();
   const cacheExpiry = DEFAULT_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
   let isDataExpired = true;
   
   if (Object.keys(knownModelsAndPrices).length > 0) {
     const firstModel = Object.values(knownModelsAndPrices)[0];
     if (firstModel && firstModel.timestamp) {
       isDataExpired = currentTime - firstModel.timestamp >= cacheExpiry;
     }
   }
   
   if (Object.keys(knownModelsAndPrices).length === 0 || isDataExpired) {
     pricingNotification.textContent = "Model and pricing data missing or expired. Fetching data...";
     updateKnownModelsAndPricing();
   } else {
     pricingNotification.textContent = "Model and pricing data up to date.";
     updateAllModelsList(); // Ensure autocomplete list is updated
   }
 }

 // --- Tab Handling ---
 function setupTabNavigation() {
   const tabButtons = document.querySelectorAll('.tab-button');
   const tabContents = document.querySelectorAll('.tab-content');

   tabButtons.forEach(button => {
     button.addEventListener('click', () => {
       // Deactivate all tabs and hide all content
       tabButtons.forEach(btn => btn.classList.remove('active'));
       tabContents.forEach(content => content.classList.remove('active'));

       // Activate clicked tab
       button.classList.add('active');
       // Show corresponding content
       const targetTabId = button.dataset.tab;
       document.getElementById(targetTabId).classList.add('active');
       if (DEBUG) console.log(`[LLM Options] Switched to tab: ${targetTabId}`);

       // Special handling for advanced options tab: ensure collapsible is correct
       if (targetTabId === 'advanced-tab') {
         const isExpanded = advancedOptionsToggle.getAttribute('aria-expanded') === 'true';
         const toggleIndicator = advancedOptionsToggle.querySelector('.toggle-indicator');
         if (toggleIndicator) {
           // Ensure indicator is aligned with the aria-expanded state
           toggleIndicator.textContent = isExpanded ? '▼' : '►';
         }
          // Ensure content visibility matches the tab and collapsible header state
          advancedOptionsContent.classList.toggle('active', isExpanded);
       } else {
         // If leaving advanced tab, collapse it visually
         if (advancedOptionsToggle.getAttribute('aria-expanded') === 'true') {
           advancedOptionsToggle.setAttribute('aria-expanded', 'false');
           advancedOptionsContent.classList.remove('active');
           const toggleIndicator = advancedOptionsToggle.querySelector('.toggle-indicator');
           if (toggleIndicator) {
             toggleIndicator.textContent = '►';
           }
         }
       }
     });
   });

   // Set initial active tab
   // Check local storage for last active tab, otherwise default to 'summary-tab'
   chrome.storage.local.get('lastActiveTab', (result) => {
       const lastActiveTab = result.lastActiveTab || 'summary-tab'; // New default is 'summary-tab'
       const initialTabButton = document.querySelector(`.tab-button[data-tab="${lastActiveTab}"]`);
       if (initialTabButton) {
           initialTabButton.click(); // Simulate click to activate tab and its content
       } else {
           // Fallback to the new default tab if stored tab doesn't exist (e.g., if 'api-keys-tokens-tab' was stored)
           document.querySelector(`.tab-button[data-tab="summary-tab"]`).click();
       }
   });

   // Save active tab on change
   tabButtons.forEach(button => {
       button.addEventListener('click', () => {
           const currentTabId = button.dataset.tab;
           chrome.storage.local.set({ 'lastActiveTab': currentTabId });
       });
   });
 }

 async function initializeOptionsPage() {
   try {
     setupCollapsible();
     await loadSettings();

     // Connect input fields for API Key and Joplin Token to the unified handler
     if (apiKeyInput) {
       apiKeyInput.addEventListener("input", handleApiAndJoplinInput);
       apiKeyInput.addEventListener("blur", handleApiAndJoplinInput);
     } else {
       console.error("[LLM Options] API Key input field not found.");
     }

     const joplinTokenInput = document.getElementById("joplinToken");
     if (joplinTokenInput) {
       joplinTokenInput.addEventListener("input", handleApiAndJoplinInput);
       joplinTokenInput.addEventListener("blur", handleApiAndJoplinInput);
     } else {
       console.error("[LLM Options] Joplin Token input field not found.");
     }

     // NewsBlur token input still needs its specific URL extraction logic
     if (newsblurTokenInput) {
       newsblurTokenInput.addEventListener("input", handleNewsblurTokenInput);
       newsblurTokenInput.addEventListener("blur", handleNewsblurTokenInput);
     } else {
       console.error("[LLM Options] NewsBlur Token input field not found.");
     }

     if (addModelBtn) {
       addModelBtn.addEventListener("click", addModel);
     } else {
       console.error("[LLM Options] Add Model button not found.");
     }
     
     // Add event listeners for bullet count radios to save immediately
     bulletCountRadios.forEach(radio => {
       radio.addEventListener("change", () => {
         if (DEBUG)
           console.log(`[LLM Options] Bullet Count changed to: ${radio.value}`);
         saveSettings();
         updatePromptPreview();
       });
     });
     if (addLangBtn) {
       addLangBtn.addEventListener("click", addLanguage);
     } else {
       console.error("[LLM Options] Add Language button not found.");
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
     document.querySelectorAll('input[name="maxPriceBehavior"]').forEach(radio => {
       radio.addEventListener("change", () => {
         currentMaxPriceBehavior = radio.value;
       });
     });
     setupTabNavigation(); // Setup tab navigation
     if (DEBUG) console.log("[LLM Options] Event listeners attached.");
   } catch (error) {
     console.error("[LLM Options] Error during initialization:", error);
     showError("Failed to initialize options page: " + error.message);
   }
 }

 initializeOptionsPage();
 // --- End Initial Setup ---
}); // End DOMContentLoaded

