import {
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_POSTAMBLE_TEXT,
  DEFAULT_FORMAT_INSTRUCTIONS,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_PREPOPULATE_LANGUAGES,
  // SVG paths and full language map are fetched from background
} from "./constants.js";
import { showError } from './utils.js';  // Import from new utils.js

const VER = "v2.26";
const LASTUPD = "Correctly save/load custom model list with labels";

console.log(`[LLM Options] Script Start (${VER})`);

document.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("apiKey");
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
  const saveButton = document.getElementById("save");
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

  const DEFAULT_BULLET_COUNT = "5";
  const LANGUAGE_FLAG_CLASS = "language-flag";
  const DEFAULT_DEBUG_MODE = false;
  const NUM_TO_WORD = {
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
  };

  let ALL_LANGUAGE_NAMES_MAP = {};
  let SVG_PATH_PREFIX = "";
  let FALLBACK_SVG_PATH = "";

  let DEBUG = false;
  let currentModels = [];
  let currentSelectedModel = "";
  let currentAvailableLanguages = [];

  let currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;

  let activeAutocompleteInput = null;
  let autocompleteDropdown = null;
  let highlightedAutocompleteIndex = -1;

  let draggedItemIndex = null;
  let dragOverElement = null;

  // Define setupAutocomplete here to ensure it's available early
  function setupAutocomplete(textInput) {
    if (!textInput) return;
    textInput.addEventListener("input", (event) => {
      const query = event.target.value;
      const suggestions = filterLanguages(query);
      if (DEBUG) console.log(`[LLM Options] Autocomplete suggestions for "${query}":`, suggestions);
      showAutocompleteSuggestions(textInput, suggestions);
    });
    textInput.addEventListener("keydown", handleAutocompleteKeydown);
  }

  function renderModelOptions() {
    if (!modelSelectionArea) return;
    modelSelectionArea.innerHTML = "";
    if (!currentModels || currentModels.length === 0) {
      modelSelectionArea.innerHTML =
        "<p>No models configured. Add one below or save to use defaults.</p>";
      if (addModelBtn) addModelBtn.disabled = true;
      return;
    } else {
      if (addModelBtn) addModelBtn.disabled = false;
    }

    const availableModelIds = currentModels.map((m) => m.id);
    if (
      !currentSelectedModel ||
      !availableModelIds.includes(currentSelectedModel)
    ) {
      currentSelectedModel =
        currentModels.length > 0 ? currentModels[0].id : "";
    }

    currentModels.forEach((model, index) => {
      const isChecked =
        model.id === currentSelectedModel && model.id.trim() !== "";
      const group = document.createElement("div");
      group.className = "option-group model-option";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "selectedModelOption";
      radio.id = `modelRadio_${index}`;
      radio.value = model.id;
      radio.checked = isChecked;
      radio.dataset.index = index;
      radio.disabled = !model.id.trim();
      radio.addEventListener("change", handleModelRadioChange);
      const textInput = document.createElement("input");
      textInput.type = "text";
      textInput.id = `modelText_${index}`;
      textInput.value = model.id;
      textInput.placeholder = "Enter OpenRouter Model ID";
      textInput.dataset.index = index;
      textInput.addEventListener("input", handleModelTextChange);
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.id = `modelLabel_${index}`;
      labelInput.value = model.label || model.id;
      labelInput.placeholder = "Enter Model Label (Optional)";
      labelInput.dataset.index = index;
      labelInput.addEventListener("input", handleModelLabelChange);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "✕";
      removeBtn.className = "button remove-button";
      removeBtn.title = "Remove this model";
      removeBtn.dataset.index = index;
      removeBtn.addEventListener("click", handleModelRemoveClick);
      group.appendChild(radio);
      group.appendChild(textInput);
      group.appendChild(labelInput);
      group.appendChild(removeBtn);
      modelSelectionArea.appendChild(group);
    });
  }

  function handleModelRadioChange(event) {
    if (event.target.checked) {
      const index = parseInt(event.target.dataset.index, 10);
      const selectedModel = currentModels[index];
      if (selectedModel?.id.trim()) {
        currentSelectedModel = selectedModel.id.trim();
      } else {
        event.target.checked = false;
        currentSelectedModel = "";
        const firstValidModel = currentModels.find((m) => m.id.trim() !== "");
        if (firstValidModel) {
          const firstValidRadio = modelSelectionArea.querySelector(
            `input[type="radio"][value="${firstValidModel.id}"]`,
          );
          if (firstValidRadio) {
            firstValidRadio.checked = true;
            currentSelectedModel = firstValidModel.id;
          }
        }
      }
    }
  }

  function handleModelTextChange(event) {
    const newModelId = event.target.value.trim();
    const idx = parseInt(event.target.dataset.index, 10);
    if (idx >= 0 && idx < currentModels.length) {
      currentModels[idx].id = newModelId;
      const labelInput = document.getElementById(`modelLabel_${idx}`);
      if (labelInput && !labelInput.value.trim()) {
        labelInput.value = newModelId;
        currentModels[idx].label = newModelId;
      }
    }
    const associatedRadio = document.getElementById(`modelRadio_${idx}`);
    if (associatedRadio) {
      associatedRadio.value = newModelId;
      associatedRadio.disabled = !newModelId;
      if (associatedRadio.checked) {
        if (!newModelId) {
          associatedRadio.checked = false;
          currentSelectedModel = "";
          const firstValidModel = currentModels.find((m) => m.id.trim() !== "");
          if (firstValidModel) {
            const firstValidRadio = modelSelectionArea.querySelector(
              `input[type="radio"][value="${firstValidModel.id}"]`,
            );
            if (firstValidRadio) {
              firstValidRadio.checked = true;
              currentSelectedModel = firstValidModel.id;
            }
          }
        } else {
          currentSelectedModel = newModelId;
        }
      }
    }
  }

  function handleModelLabelChange(event) {
    const newModelLabel = event.target.value.trim();
    const idx = parseInt(event.target.dataset.index, 10);
    if (idx >= 0 && idx < currentModels.length) {
      currentModels[idx].label = newModelLabel;
    }
  }

  function handleModelRemoveClick(event) {
    const index = parseInt(event.target.dataset.index, 10);
    if (index >= 0 && index < currentModels.length) {
      const removedModelId = currentModels[index].id;
      currentModels.splice(index, 1);
      if (removedModelId === currentSelectedModel) {
        const firstValidModel = currentModels.find((m) => m.id.trim() !== "");
        currentSelectedModel = firstValidModel ? firstValidModel.id : "";
      }
      renderModelOptions();
    }
  }

  function addModel() {
    console.log("[LLM Options] Add Model button clicked.");
    currentModels.push({ id: "", label: "" });
    renderModelOptions();
    console.log("[LLM Options] Add Model operation completed.");
  }

  function findLanguageByName(name) {
    if (!name || typeof name !== "string" || !ALL_LANGUAGE_NAMES_MAP) return undefined;
    const cleanName = name.trim().toLowerCase();
    const languageData = ALL_LANGUAGE_NAMES_MAP[cleanName];
    return languageData ? languageData : undefined;
  }

  function filterLanguages(query) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery || !ALL_LANGUAGE_NAMES_MAP) return [];
    return Object.keys(ALL_LANGUAGE_NAMES_MAP)
      .filter((lowerName) => lowerName.includes(lowerQuery))
      .map((lowerName) => ALL_LANGUAGE_NAMES_MAP[lowerName]);
  }

  function showAutocompleteSuggestions(inputElement, suggestions) {
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
    suggestions.forEach((lang, index) => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.dataset.index = index;
      item.dataset.languageCode = lang.code;
      item.dataset.languageName = lang.name;
      const flagImg = document.createElement("img");
      flagImg.className = LANGUAGE_FLAG_CLASS;
      flagImg.src = `${SVG_PATH_PREFIX}${lang.code.toLowerCase()}.svg`;
      flagImg.alt = `${lang.name} flag`;
      flagImg.onerror = () => {
        flagImg.src = FALLBACK_SVG_PATH;
        flagImg.alt = "Flag not found";
      };
      const nameSpan = document.createElement("span");
      nameSpan.textContent = lang.name;
      nameSpan.className = "language-name";
      item.appendChild(flagImg);
      item.appendChild(nameSpan);
      item.addEventListener("click", () => selectAutocompleteSuggestion(item, inputElement));
      autocompleteDropdown.appendChild(item);
    });
    const rect = inputElement.closest(".language-input-wrapper").getBoundingClientRect();
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

  function selectAutocompleteSuggestion(itemElement, inputElement) {
    inputElement.value = itemElement.dataset.languageName;
    const flagImg = inputElement.parentElement.querySelector(".language-flag");
    if (flagImg) {
      flagImg.src = `${SVG_PATH_PREFIX}${itemElement.dataset.languageCode.toLowerCase()}.svg`;
      flagImg.alt = `${itemElement.dataset.languageName} flag`;
    }
    const event = new Event("input", { bubbles: true });
    inputElement.dispatchEvent(event);
    hideAutocompleteSuggestions();
  }

  function handleAutocompleteKeydown(event) {
    if (!autocompleteDropdown || autocompleteDropdown.style.display === "none") return;
    const items = autocompleteDropdown.querySelectorAll(".autocomplete-item");
    if (items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlightedAutocompleteIndex = (highlightedAutocompleteIndex + 1) % items.length;
      updateAutocompleteHighlight(items);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlightedAutocompleteIndex = (highlightedAutocompleteIndex - 1 + items.length) % items.length;
      updateAutocompleteHighlight(items);
    } else if (event.key === "Enter") {
      if (highlightedAutocompleteIndex > -1) {
        event.preventDefault();
        selectAutocompleteSuggestion(items[highlightedAutocompleteIndex], activeAutocompleteInput);
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
    const clickedInside = activeAutocompleteInput && activeAutocompleteInput.closest(".language-input-wrapper").contains(event.target);
    if (!clickedInside) {
      hideAutocompleteSuggestions();
    }
  }

  function renderLanguageOptions() {
    if (!languageSelectionArea) return;
    languageSelectionArea.innerHTML = "";
    currentAvailableLanguages.forEach((langName, index) => {
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
      const languageData = findLanguageByName(langName);
      const languageCode = languageData ? languageData.code : null;
      if (languageCode && SVG_PATH_PREFIX) {
        flagImg.src = `${SVG_PATH_PREFIX}${languageCode.toLowerCase()}.svg`;
        flagImg.alt = `${langName} flag`;
        flagImg.onerror = () => {
          flagImg.src = FALLBACK_SVG_PATH;
          flagImg.alt = "Flag not found";
        };
      } else {
        flagImg.src = FALLBACK_SVG_PATH;
        flagImg.alt = "Flag not found";
      }
      const textInput = document.createElement("input");
      textInput.type = "text";
      textInput.id = `langText_${index}`;
      textInput.value = langName;
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
      setupAutocomplete(textInput);  // This line is now fixed as the function is defined earlier
    });
  }

  function handleLanguageTextChange(event) {
    const newLangName = event.target.value;
    const idx = parseInt(event.target.dataset.index, 10);
    if (idx >= 0 && idx < currentAvailableLanguages.length) {
      currentAvailableLanguages[idx] = newLangName.trim();
    }
    const flagImg = event.target.parentElement.querySelector(".language-flag");
    if (flagImg) {
      const languageData = findLanguageByName(newLangName);
      const languageCode = languageData ? languageData.code : null;
      if (languageCode && SVG_PATH_PREFIX) {
        flagImg.src = `${SVG_PATH_PREFIX}${languageCode.toLowerCase()}.svg`;
        flagImg.alt = `${languageData.name} flag`;
      } else {
        flagImg.src = FALLBACK_SVG_PATH;
        flagImg.alt = "Flag not found";
      }
    }
  }

  function handleLanguageRemoveClick(event) {
    const index = parseInt(event.target.dataset.index, 10);
    if (index >= 0 && index < currentAvailableLanguages.length) {
      currentAvailableLanguages.splice(index, 1);
      renderLanguageOptions();
    }
  }

  function addLanguage() {
    console.log("[LLM Options] Add Language button clicked.");
    currentAvailableLanguages.push("");
    renderLanguageOptions();
    console.log("[LLM Options] Add Language operation completed.");
  }

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

  async function loadSettings() {
    try {
      const initialDebug = await chrome.storage.sync.get("debug");
      DEBUG = !!initialDebug.debug;
    } catch (e) {
      DEBUG = false;
    }

    if (statusMessage) {
      statusMessage.textContent = "Loading...";
      statusMessage.className = "status-message";
    }

    try {
      const [langDataResponse, settingsResponse] = await Promise.all([
        new Promise((resolve) =>
          chrome.runtime.sendMessage({ action: "getLanguageData" }, resolve),
        ),
        new Promise((resolve) =>
          chrome.runtime.sendMessage({ action: "getSettings" }, resolve),
        ),
      ]);

      if (
        chrome.runtime.lastError ||
        !langDataResponse?.ALL_LANGUAGE_NAMES_MAP
      ) {
        showError(`Error loading language list. Autocomplete/flags disabled.`);
        ALL_LANGUAGE_NAMES_MAP = {};
        SVG_PATH_PREFIX = "";
        FALLBACK_SVG_PATH = "";
      } else {
        ALL_LANGUAGE_NAMES_MAP = langDataResponse.ALL_LANGUAGE_NAMES_MAP;
        SVG_PATH_PREFIX = langDataResponse.SVG_PATH_PREFIX;
        FALLBACK_SVG_PATH = langDataResponse.FALLBACK_SVG_PATH;
      }

      if (chrome.runtime.lastError || settingsResponse?.error) {
        showError(`Error loading settings: ${chrome.runtime.lastError?.message || settingsResponse?.error}. Using defaults.`);
        if (apiKeyInput) apiKeyInput.value = "";
        if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
        DEBUG = DEFAULT_DEBUG_MODE;
        bulletCountRadios.forEach(
          (radio) => (radio.checked = radio.value === DEFAULT_BULLET_COUNT),
        );
        currentModels = [...DEFAULT_MODEL_OPTIONS];
        currentSelectedModel =
          currentModels.length > 0 ? currentModels[0].id : "";
        currentAvailableLanguages = DEFAULT_PREPOPULATE_LANGUAGES.filter(
          (name) => findLanguageByName(name),
        );
        if (currentAvailableLanguages.length === 0) {
          currentAvailableLanguages.push("");
        }
        currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
        if (promptFormatInstructionsTextarea)
          promptFormatInstructionsTextarea.value =
            currentCustomFormatInstructions;
      } else {
        const data = settingsResponse;
        DEBUG = !!data.debug;
        if (apiKeyInput) apiKeyInput.value = data.apiKey || "";
        if (debugCheckbox) debugCheckbox.checked = DEBUG;
        let countValue = data.bulletCount || DEFAULT_BULLET_COUNT;
        bulletCountRadios.forEach(
          (radio) => (radio.checked = radio.value === countValue),
        );
        currentModels = data.models || [...DEFAULT_MODEL_OPTIONS];
        currentSelectedModel =
          data.model || (currentModels.length > 0 ? currentModels[0].id : "");
        if (
          !currentModels.some((m) => m.id === currentSelectedModel) &&
          currentModels.length > 0
        ) {
          currentSelectedModel = currentModels[0].id;
        } else if (currentModels.length === 0) {
          currentSelectedModel = "";
        }
        currentAvailableLanguages = data.availableLanguages || [];
        const validSavedLanguages = currentAvailableLanguages.filter((name) =>
          findLanguageByName(name),
        );
        currentAvailableLanguages = validSavedLanguages;
        if (currentAvailableLanguages.length === 0) {
          currentAvailableLanguages.push("");
        }
        currentCustomFormatInstructions =
          data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] || DEFAULT_FORMAT_INSTRUCTIONS;
        if (promptFormatInstructionsTextarea) {
          promptFormatInstructionsTextarea.value =
            currentCustomFormatInstructions;
        }
        if (statusMessage) {
          statusMessage.textContent = "Options loaded.";
          statusMessage.className = "status-message success";
          setTimeout(() => {
            statusMessage.textContent = "";
            statusMessage.className = "status-message";
          }, 1500);
        }
      }
    } catch (error) {
      showError(`Error during settings loading: ${error.message}`);
      if (apiKeyInput) apiKeyInput.value = "";
      if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
      DEBUG = DEFAULT_DEBUG_MODE;
      bulletCountRadios.forEach(
        (radio) => (radio.checked = radio.value === DEFAULT_BULLET_COUNT),
      );
      currentModels = [...DEFAULT_MODEL_OPTIONS];
      currentSelectedModel =
        currentModels.length > 0 ? currentModels[0].id : "";
      currentAvailableLanguages = DEFAULT_PREPOPULATE_LANGUAGES.filter((name) =>
        findLanguageByName(name),
      );
      if (currentAvailableLanguages.length === 0) {
        currentAvailableLanguages.push("");
      }
      currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
      if (promptFormatInstructionsTextarea)
        promptFormatInstructionsTextarea.value =
          currentCustomFormatInstructions;
    }

    renderModelOptions();
    renderLanguageOptions();
    updatePromptPreview();
  }

  function saveSettings() {
    console.log("[LLM Options] Save button clicked.");
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
    const debug = debugCheckbox ? debugCheckbox.checked : false;
    let bulletCount = DEFAULT_BULLET_COUNT;
    document.querySelectorAll('input[name="bulletCount"]').forEach((radio) => {
      if (radio.checked) bulletCount = radio.value;
    });
    const customFormatInstructionsToSave = promptFormatInstructionsTextarea
      ? promptFormatInstructionsTextarea.value
      : currentCustomFormatInstructions;

    const modelsToSave = currentModels
      .map((m) => ({ id: m.id.trim(), label: m.label.trim() }))
      .filter((m) => m.id !== "");

    let finalSelectedModel = "";
    const savedModelIds = modelsToSave.map((m) => m.id);
    if (currentSelectedModel && savedModelIds.includes(currentSelectedModel)) {
      finalSelectedModel = currentSelectedModel;
    } else if (modelsToSave.length > 0) {
      finalSelectedModel = modelsToSave[0].id;
    }

    const languageInputs = languageSelectionArea.querySelectorAll(
      '.language-option input[type="text"]',
    );
    const languagesToSave = Array.from(languageInputs)
      .map((input) => input.value.trim())
      .filter((lang) => lang !== "" && findLanguageByName(lang));

    const settingsToSave = {
      apiKey,
      model: finalSelectedModel,
      models: modelsToSave,
      debug,
      bulletCount,
      availableLanguages: languagesToSave,
      [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]: customFormatInstructionsToSave,
      [PROMPT_STORAGE_KEY_PREAMBLE]: DEFAULT_PREAMBLE_TEMPLATE,
      [PROMPT_STORAGE_KEY_POSTAMBLE]: DEFAULT_POSTAMBLE_TEXT,
      [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]: DEFAULT_FORMAT_INSTRUCTIONS,
    };

    chrome.storage.sync.set(settingsToSave, () => {
      if (chrome.runtime.lastError) {
        showError(`Error saving: ${chrome.runtime.lastError.message}`);
      } else {
        if (statusMessage) {
          statusMessage.textContent = "Options saved!";
          statusMessage.className = "status-message success";
        }
        currentAvailableLanguages = languagesToSave;
        renderModelOptions();
        renderLanguageOptions();
        updatePromptPreview();
      }
      if (statusMessage) {
        setTimeout(() => {
          statusMessage.textContent = "";
          statusMessage.className = "status-message";
        }, 2000);
      }
    });
  }

  function resetToDefaults() {
    console.log("[LLM Options] Reset button clicked.");
    if (
      confirm(
        "Are you sure you want to reset all options (except API key) to their defaults?",
      )
    ) {
      currentModels = [...DEFAULT_MODEL_OPTIONS];
      currentSelectedModel =
        currentModels.length > 0 ? currentModels[0].id : "";
      currentAvailableLanguages = DEFAULT_PREPOPULATE_LANGUAGES.filter((name) =>
        findLanguageByName(name),
      );
      if (currentAvailableLanguages.length === 0) {
        currentAvailableLanguages.push("");
      }
      currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
      renderModelOptions();
      renderLanguageOptions();
      bulletCountRadios.forEach((radio) => {
        radio.checked = radio.value === DEFAULT_BULLET_COUNT;
      });
      if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
      if (promptFormatInstructionsTextarea) {
        promptFormatInstructionsTextarea.value = currentCustomFormatInstructions;
      }
      updatePromptPreview();
      saveSettings();
      console.log("[LLM Options] Reset operation completed.");
    }
  }

  function setupCollapsible() {
    if (advancedOptionsToggle && advancedOptionsContent) {
      const toggleSection = () => {
        const isExpanded = advancedOptionsToggle.getAttribute("aria-expanded") === "true";
        advancedOptionsToggle.setAttribute("aria-expanded", !isExpanded);
        advancedOptionsContent.classList.toggle("active");
        const toggleIndicator = advancedOptionsToggle.querySelector(".toggle-indicator");
        if (toggleIndicator) {
          toggleIndicator.textContent = isExpanded ? "►" : "▼";
        }
      };
      advancedOptionsToggle.addEventListener("click", toggleSection);
      advancedOptionsToggle.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleSection();
        }
      });
    }
  }

  try {
    setupCollapsible();
    await loadSettings();
    try {
      if (saveButton) {
        saveButton.addEventListener("click", saveSettings);
      } else {
        console.error("[LLM Options] Save button not found in DOM.");
      }
      
      if (addModelBtn) {
        addModelBtn.addEventListener("click", addModel);
      } else {
        console.error("[LLM Options] Add Model button not found in DOM.");
      }
      
      if (addLangBtn) {
        addLangBtn.addEventListener("click", addLanguage);
      } else {
        console.error("[LLM Options] Add Language button not found in DOM.");
      }
      
      if (resetButton) {
        resetButton.addEventListener("click", resetToDefaults);
      } else {
        console.error("[LLM Options] Reset button not found in DOM.");
      }
    } catch (error) {
      console.error("[LLM Options] Error attaching event listeners:", error);
    }
  } catch (error) {
    console.error("[LLM Options] Error in DOMContentLoaded handler:", error);
  }

  // --- Drag and Drop Handlers ---
  function handleDragStart(event) {
    // Spec: Handles the start of a drag operation for language options.
    // Arguments: event (DragEvent) - The drag event.
    // Called from: renderLanguageOptions (on grabHandle elements).
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", event.target.parentElement.dataset.index);
    draggedItemIndex = parseInt(event.target.parentElement.dataset.index, 10);
    if (DEBUG) console.log(`[LLM Options] Drag started on index: ${draggedItemIndex}`);
    event.target.parentElement.classList.add("dragging");
  }

  function handleDragEnd(event) {
    // Spec: Handles the end of a drag operation.
    // Arguments: event (DragEvent) - The drag event.
    // Called from: renderLanguageOptions (on language-option elements).
    event.target.parentElement.classList.remove("dragging");
    draggedItemIndex = null;
    dragOverElement = null;
    if (DEBUG) console.log("[LLM Options] Drag ended.");
    renderLanguageOptions();  // Re-render to reflect any changes
  }

  function handleDragOver(event) {
    // Spec: Handles dragging over a language option for drop positioning.
    // Arguments: event (DragEvent) - The drag event.
    // Called from: renderLanguageOptions (on language-option elements).
    event.preventDefault();  // Necessary to allow dropping
    event.dataTransfer.dropEffect = "move";
    const targetIndex = parseInt(event.target.closest(".language-option").dataset.index, 10);
    if (draggedItemIndex !== targetIndex) {
      if (event.offsetY < event.target.closest(".language-option").offsetHeight / 2) {
        event.target.closest(".language-option").classList.add("drag-over-top");
        event.target.closest(".language-option").classList.remove("drag-over-bottom");
      } else {
        event.target.closest(".language-option").classList.add("drag-over-bottom");
        event.target.closest(".language-option").classList.remove("drag-over-top");
      }
      dragOverElement = event.target.closest(".language-option");
    }
    if (DEBUG) console.log(`[LLM Options] Dragging over index: ${targetIndex}`);
  }

  function handleDragLeave(event) {
    // Spec: Handles when the drag leaves a language option.
    // Arguments: event (DragEvent) - The drag event.
    // Called from: renderLanguageOptions (on language-option elements).
    event.target.closest(".language-option").classList.remove("drag-over-top");
    event.target.closest(".language-option").classList.remove("drag-over-bottom");
  }

  function handleDrop(event) {
    // Spec: Handles the drop event to reorder languages.
    // Arguments: event (DragEvent) - The drop event.
    // Called from: renderLanguageOptions (on language-option elements).
    event.preventDefault();
    const targetIndex = parseInt(event.target.closest(".language-option").dataset.index, 10);
    if (draggedItemIndex !== null && draggedItemIndex !== targetIndex) {
      const draggedItem = currentAvailableLanguages[draggedItemIndex];
      currentAvailableLanguages.splice(draggedItemIndex, 1);
      const newIndex = event.offsetY < event.target.closest(".language-option").offsetHeight / 2 ? targetIndex : targetIndex + 1;
      currentAvailableLanguages.splice(newIndex, 0, draggedItem);
      renderLanguageOptions();  // Re-render to apply new order
    }
    event.target.closest(".language-option").classList.remove("drag-over-top");
    event.target.closest(".language-option").classList.remove("drag-over-bottom");
    if (DEBUG) console.log(`[LLM Options] Dropped item at index: ${targetIndex}`);
  }
});
