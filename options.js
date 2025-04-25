import {
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_POSTAMBLE_TEXT,
  DEFAULT_FORMAT_INSTRUCTIONS,
  DEFAULT_MODEL_OPTIONS,
} from "./constants.js";
import { showError } from "./utils.js";

const LASTUPD = "Clarified language usage in options UI"; // Updated description

console.log(`[LLM Options] Script Start`);

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

  let DEBUG = false;
  let currentModels = [];
  let currentSelectedModel = "";
  let language_info = [];
  let allLanguages = []; // For autocomplete suggestions

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
      if (DEBUG)
        console.log(
          `[LLM Options] Autocomplete suggestions for "${query}":`,
          suggestions,
        );
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
      // Enable or disable Add Model button based on the maximum limit of 7 models
      if (addModelBtn) {
        const MAX_MODELS = 7;
        addModelBtn.disabled = currentModels.length >= MAX_MODELS;
        if (currentModels.length >= MAX_MODELS) {
          addModelBtn.title = "Maximum limit of 7 models reached.";
        } else {
          addModelBtn.title = "Add another model (max 7).";
        }
      }
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
      // Render each model entry with radio button for selection, text input for ID, label input for display name, and remove button
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
    // Allow adding a new model only if the current count is less than the maximum limit of 7
    console.log("[LLM Options] Add Model button clicked.");
    const MAX_MODELS = 7;
    if (currentModels.length < MAX_MODELS) {
      currentModels.push({ id: "", label: "" });
      renderModelOptions();
      console.log(
        "[LLM Options] Add Model operation completed. Current model count:",
        currentModels.length,
      );
    } else {
      console.warn(
        "[LLM Options] Maximum model limit of",
        MAX_MODELS,
        "reached. Cannot add more models.",
      );
      alert(
        "Maximum limit of " +
          MAX_MODELS +
          " models reached. Please remove an existing model to add a new one.",
      );
    }
  }

  function filterLanguages(query) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery || allLanguages.length === 0) return [];
    return allLanguages
      .filter((lang) => lang.name.toLowerCase().includes(lowerQuery))
      .map((lang) => ({ name: lang.name, code: lang.code }));
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
      flagImg.src = chrome.runtime.getURL(
        `country-flags/svg/${lang.code.toLowerCase()}.svg`,
      );
      flagImg.alt = `${lang.name} flag`;
      flagImg.onerror = () => {
        flagImg.src = chrome.runtime.getURL("country-flags/svg/un.svg");
        flagImg.alt = "Flag not found";
      };
      const nameSpan = document.createElement("span");
      nameSpan.textContent = lang.name;
      nameSpan.className = "language-name";
      item.appendChild(flagImg);
      item.appendChild(nameSpan);
      item.addEventListener("click", () =>
        selectAutocompleteSuggestion(item, inputElement),
      );
      autocompleteDropdown.appendChild(item);
    });
    const rect = inputElement
      .closest(".language-input-wrapper")
      .getBoundingClientRect();
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
      flagImg.src = chrome.runtime.getURL(
        `country-flags/svg/${itemElement.dataset.languageCode.toLowerCase()}.svg`,
      );
      flagImg.alt = `${itemElement.dataset.languageName} flag`;
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

  function renderLanguageOptions() {
    if (!languageSelectionArea) return;
    languageSelectionArea.innerHTML = "";
    language_info.forEach((langInfo, index) => {
      // Render each language entry with drag handle, flag, text input, and remove button
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
      setupAutocomplete(textInput); // Setup autocomplete for the language input field
    });

    // Enable or disable Add Language button based on the maximum limit of 5 languages
    if (addLangBtn) {
      const MAX_LANGUAGES = 5;
      addLangBtn.disabled = language_info.length >= MAX_LANGUAGES;
      if (language_info.length >= MAX_LANGUAGES) {
        addLangBtn.title = "Maximum limit of 5 languages reached.";
      } else {
        addLangBtn.title = "Add another language (max 5).";
      }
    }
  }

  function handleLanguageTextChange(event) {
    const newLangName = event.target.value.trim();
    const idx = parseInt(event.target.dataset.index, 10);
    if (idx >= 0 && idx < language_info.length) {
      language_info[idx].language_name = newLangName;
      // Update SVG path if a matching language is found
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
      }
    }
  }

  function handleLanguageRemoveClick(event) {
    const index = parseInt(event.target.dataset.index, 10);
    if (index >= 0 && index < language_info.length) {
      language_info.splice(index, 1);
      if (language_info.length === 0) {
        // Repopulate with default languages if all are removed
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
    // Allow adding a new language only if the current count is less than the maximum limit of 5
    console.log("[LLM Options] Add Language button clicked.");
    const MAX_LANGUAGES = 5;
    if (language_info.length < MAX_LANGUAGES) {
      language_info.push({
        language_name: "",
        svg_path: chrome.runtime.getURL("country-flags/svg/un.svg"),
      });
      renderLanguageOptions();
      // Focus on the new input field
      const newIndex = language_info.length - 1;
      const newInput = document.getElementById(`langText_${newIndex}`);
      if (newInput) {
        newInput.focus();
      }
      console.log(
        "[LLM Options] Add Language operation completed. Current language count:",
        language_info.length,
      );
    } else {
      console.warn(
        "[LLM Options] Maximum language limit of",
        MAX_LANGUAGES,
        "reached. Cannot add more languages.",
      );
      alert(
        "Maximum limit of " +
          MAX_LANGUAGES +
          " languages reached. Please remove an existing language to add a new one.",
      );
    }
  }

  function updatePromptPreview() {
    let bulletCount = DEFAULT_BULLET_COUNT;
    document.querySelectorAll('input[name="bulletCount"]').forEach((radio) => {
      if (radio.checked) bulletCount = radio.value;
    });
    const bulletWord = NUM_TO_WORD[bulletCount] || "five";
    // Use the DEFAULT_PREAMBLE_TEMPLATE directly as it no longer needs language replacement
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
      const settingsResponse = await new Promise((resolve) =>
        chrome.runtime.sendMessage({ action: "getSettings" }, resolve),
      );

      // Fetch all languages for autocomplete
      const langDataResponse = await fetch(
        chrome.runtime.getURL("country-flags/languages.json"),
      );
      const langData = await langDataResponse.json();
      allLanguages = Object.keys(langData).map((name) => ({
        name,
        code: langData[name],
      }));

      if (chrome.runtime.lastError || settingsResponse?.error) {
        showError(
          `Error loading settings: ${chrome.runtime.lastError?.message || settingsResponse?.error}. Using defaults.`,
        );
        if (apiKeyInput) apiKeyInput.value = "";
        if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
        DEBUG = DEFAULT_DEBUG_MODE;
        bulletCountRadios.forEach(
          (radio) => (radio.checked = radio.value === DEFAULT_BULLET_COUNT),
        );
        currentModels = [...DEFAULT_MODEL_OPTIONS];
        currentSelectedModel =
          currentModels.length > 0 ? currentModels[0].id : "";
        language_info = [];
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
        language_info = data.language_info || [];
        // If language_info is empty, populate with default languages: English, Spanish, Hebrew, Chinese
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
      language_info = [];
      currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
      if (promptFormatInstructionsTextarea)
        promptFormatInstructionsTextarea.value =
          currentCustomFormatInstructions;
    }

    renderModelOptions();
    renderLanguageOptions();
    updatePromptPreview();
    setupAutoSave();
  }

  function saveSettings() {
    // Save the current settings to chrome.storage.sync with validation and verification
    console.log("[LLM Options] Saving settings manually.");
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
    const debug = debugCheckbox ? debugCheckbox.checked : false;
    let bulletCount = DEFAULT_BULLET_COUNT;
    document.querySelectorAll('input[name="bulletCount"]').forEach((radio) => {
      if (radio.checked) bulletCount = radio.value;
    });
    const customFormatInstructionsToSave = promptFormatInstructionsTextarea
      ? promptFormatInstructionsTextarea.value
      : currentCustomFormatInstructions;

    // Filter models to save only non-empty entries, limit to 7
    const MAX_MODELS = 7;
    const modelsToSave = currentModels
      .map((m) => ({ id: m.id.trim(), label: m.label.trim() }))
      .filter((m) => m.id !== "")
      .slice(0, MAX_MODELS); // Enforce maximum of 7 models

    let finalSelectedModel = "";
    const savedModelIds = modelsToSave.map((m) => m.id);
    if (currentSelectedModel && savedModelIds.includes(currentSelectedModel)) {
      finalSelectedModel = currentSelectedModel;
    } else if (modelsToSave.length > 0) {
      finalSelectedModel = modelsToSave[0].id;
    }

    // Filter language_info to save only non-empty entries, limit to 5
    const MAX_LANGUAGES = 5;
    const languageInputs = languageSelectionArea.querySelectorAll(
      '.language-option input[type="text"]',
    );
    const language_infoToSave = Array.from(languageInputs)
      .map((input) => {
        const langName = input.value.trim();
        if (langName === "") return null;
        const foundLang = allLanguages.find(
          (lang) => lang.name.toLowerCase() === langName.toLowerCase(),
        );
        if (!foundLang) return null;
        return {
          language_name: langName,
          svg_path: chrome.runtime.getURL(
            `country-flags/svg/${foundLang.code.toLowerCase()}.svg`,
          ),
        };
      })
      .filter((item) => item !== null)
      .slice(0, MAX_LANGUAGES); // Enforce maximum of 5 languages

    // Construct the settings object to save
    const settingsToSave = {
      apiKey,
      model: finalSelectedModel,
      models: modelsToSave,
      debug,
      bulletCount,
      language_info: language_infoToSave,
      [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]: customFormatInstructionsToSave,
      [PROMPT_STORAGE_KEY_PREAMBLE]: DEFAULT_PREAMBLE_TEMPLATE,
      [PROMPT_STORAGE_KEY_POSTAMBLE]: DEFAULT_POSTAMBLE_TEXT,
      [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]: DEFAULT_FORMAT_INSTRUCTIONS,
    };

    // Save settings to storage and verify after saving
    chrome.storage.sync.set(settingsToSave, () => {
      if (chrome.runtime.lastError) {
        showError(`Error saving: ${chrome.runtime.lastError.message}`);
        if (statusMessage) {
          statusMessage.textContent = "Error saving options!";
          statusMessage.className = "status-message error";
        }
      } else {
        // Verify saved settings by fetching them back to ensure correctness
        chrome.storage.sync.get(
          Object.keys(settingsToSave),
          (retrievedData) => {
            let verificationErrors = [];
            if (retrievedData.apiKey !== apiKey) {
              verificationErrors.push("API key was not saved correctly.");
            }
            if (retrievedData.model !== finalSelectedModel) {
              verificationErrors.push(
                "Selected model was not saved correctly.",
              );
            }
            if (
              JSON.stringify(retrievedData.models) !==
              JSON.stringify(modelsToSave)
            ) {
              verificationErrors.push("Model list was not saved correctly.");
            }
            if (retrievedData.debug !== debug) {
              verificationErrors.push("Debug setting was not saved correctly.");
            }
            if (retrievedData.bulletCount !== bulletCount) {
              verificationErrors.push("Bullet count was not saved correctly.");
            }
            if (
              JSON.stringify(retrievedData.language_info) !==
              JSON.stringify(language_infoToSave)
            ) {
              verificationErrors.push("Language info was not saved correctly.");
            }
            if (
              retrievedData[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] !==
              customFormatInstructionsToSave
            ) {
              verificationErrors.push(
                "Custom format instructions were not saved correctly.",
              );
            }

            if (verificationErrors.length > 0) {
              showError(
                "Verification failed after save:\n- " +
                  verificationErrors.join("\n- "),
              );
              if (statusMessage) {
                statusMessage.textContent = "Save verification failed!";
                statusMessage.className = "status-message error";
              }
            } else {
              if (statusMessage) {
                statusMessage.textContent = "Changes saved!";
                statusMessage.className = "status-message success";
              }
              // Force page update after 300ms to ensure UI reflects changes
              setTimeout(() => {
                window.location.reload();
              }, 300);
            }
          },
        );
      }
      if (statusMessage) {
        setTimeout(() => {
          statusMessage.textContent = "";
          statusMessage.className = "status-message";
        }, 1500);
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
      language_info = [];
      currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
      renderModelOptions();
      renderLanguageOptions();
      bulletCountRadios.forEach((radio) => {
        radio.checked = radio.value === DEFAULT_BULLET_COUNT;
      });
      if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
      if (promptFormatInstructionsTextarea) {
        promptFormatInstructionsTextarea.value =
          currentCustomFormatInstructions;
      }
      updatePromptPreview();
      saveSettings();
      console.log("[LLM Options] Reset operation completed.");
      // Force page update after 300ms to ensure UI reflects changes
      setTimeout(() => {
        window.location.reload();
      }, 300);
    }
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

      const saveBtn = document.getElementById("saveBtn");
      if (saveBtn) {
        saveBtn.addEventListener("click", saveSettings);
      } else {
        console.error("[LLM Options] Save button not found in DOM.");
      }
    } catch (error) {
      console.error("[LLM Options] Error attaching event listeners:", error);
    }
  } catch (error) {
    console.error("[LLM Options] Error in DOMContentLoaded handler:", error);
  }

  // --- Auto Save Setup (Disabled) ---
  let saveTimeout = null;
  function setupAutoSave() {
    // Spec: Previously set up event listeners for automatic saving of settings on input changes with debounce.
    // Now disabled to require manual saving via the Save button.
    console.log(
      "[LLM Options] Auto-save is disabled. Use the Save button to save changes.",
    );
  }

  // --- Drag and Drop Handlers ---
  function handleDragStart(event) {
    // Spec: Handles the start of a drag operation for language options.
    // Arguments: event (DragEvent) - The drag event.
    // Called from: renderLanguageOptions (on grabHandle elements).
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "text/plain",
      event.target.parentElement.dataset.index,
    );
    draggedItemIndex = parseInt(event.target.parentElement.dataset.index, 10);
    if (DEBUG)
      console.log(`[LLM Options] Drag started on index: ${draggedItemIndex}`);
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
    renderLanguageOptions(); // Re-render to reflect any changes
  }

  function handleDragOver(event) {
    // Spec: Handles dragging over a language option for drop positioning.
    // Arguments: event (DragEvent) - The drag event.
    // Called from: renderLanguageOptions (on language-option elements).
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = "move";
    const targetIndex = parseInt(
      event.target.closest(".language-option").dataset.index,
      10,
    );
    if (draggedItemIndex !== targetIndex) {
      if (
        event.offsetY <
        event.target.closest(".language-option").offsetHeight / 2
      ) {
        event.target.closest(".language-option").classList.add("drag-over-top");
        event.target
          .closest(".language-option")
          .classList.remove("drag-over-bottom");
      } else {
        event.target
          .closest(".language-option")
          .classList.add("drag-over-bottom");
        event.target
          .closest(".language-option")
          .classList.remove("drag-over-top");
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
    event.target
      .closest(".language-option")
      .classList.remove("drag-over-bottom");
  }

  function handleDrop(event) {
    // Spec: Handles the drop event to reorder languages.
    // Arguments: event (DragEvent) - The drop event.
    // Called from: renderLanguageOptions (on language-option elements).
    event.preventDefault();
    const targetIndex = parseInt(
      event.target.closest(".language-option").dataset.index,
      10,
    );
    if (draggedItemIndex !== null && draggedItemIndex !== targetIndex) {
      const draggedItem = language_info[draggedItemIndex];
      language_info.splice(draggedItemIndex, 1);
      const newIndex =
        event.offsetY <
        event.target.closest(".language-option").offsetHeight / 2
          ? targetIndex
          : targetIndex + 1;
      language_info.splice(newIndex, 0, draggedItem);
      renderLanguageOptions(); // Re-render to apply new order
    }
    event.target.closest(".language-option").classList.remove("drag-over-top");
    event.target
      .closest(".language-option")
      .classList.remove("drag-over-bottom");
    if (DEBUG)
      console.log(`[LLM Options] Dropped item at index: ${targetIndex}`);
  }
});
