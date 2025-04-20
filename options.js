// options.jsThat maens NEVER!!!
const VER = "v2.26"; // Update this as needed
const LASTUPD = "Improved multi-array JSON parsing in LLM response";

import {
  // Keep prompt keys for saving
  PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
  PROMPT_STORAGE_KEY_PREAMBLE,
  PROMPT_STORAGE_KEY_POSTAMBLE,
  PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  // Keep defaults for reset functionality and initial state before load
  DEFAULT_PREAMBLE_TEMPLATE,
  DEFAULT_POSTAMBLE_TEXT,
  DEFAULT_FORMAT_INSTRUCTIONS,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_PREPOPULATE_LANGUAGES,
  // SVG paths and full language map are fetched from background
} from "./constants.js";

// --- Version Info ---
const VER = "v2.26";
const LASTUPD = "Correctly save/load custom model list with labels";

console.log(`[LLM Options] Script Start (${VER})`);

document.addEventListener("DOMContentLoaded", async () => {
  // --- DOM Elements ---
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

  // --- Constants ---
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

  // --- Language Data Storage (Populated from background) ---
  let ALL_LANGUAGE_NAMES_MAP = {};
  let SVG_PATH_PREFIX = "";
  let FALLBACK_SVG_PATH = "";

  // --- State Variables ---
  let DEBUG = false;
  let currentModels = []; // Stores {id, label} objects
  let currentSelectedModel = ""; // Stores the ID of the selected model
  let currentAvailableLanguages = []; // Stores saved language names
  let currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;

  // --- Autocomplete State ---
  let activeAutocompleteInput = null;
  let autocompleteDropdown = null;
  let highlightedAutocompleteIndex = -1;

  // --- Drag and Drop State ---
  let draggedItemIndex = null;
  let dragOverElement = null;

  // --- Functions ---

  // --- Model Selection Functions ---
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

    // Ensure selected model ID exists in the current list
    const availableModelIds = currentModels.map((m) => m.id);
    if (
      !currentSelectedModel ||
      !availableModelIds.includes(currentSelectedModel)
    ) {
      currentSelectedModel =
        currentModels.length > 0 ? currentModels[0].id : "";
      if (DEBUG)
        console.log(
          `[Options Debug] Selected model '${currentSelectedModel}' invalid or missing, defaulting to first available: '${currentSelectedModel}'`,
        );
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
        if (DEBUG)
          console.log(
            "[Options Debug] Selected model ID changed to:",
            currentSelectedModel,
          );
      } else {
        event.target.checked = false;
        const firstValidModel = currentModels.find((m) => m.id.trim() !== "");
        if (firstValidModel) {
          const firstValidRadio = modelSelectionArea.querySelector(
            `input[type="radio"][value="${firstValidModel.id}"]`,
          );
          if (firstValidRadio) {
            firstValidRadio.checked = true;
            currentSelectedModel = firstValidModel.id;
          } else {
            currentSelectedModel = "";
          }
        } else {
          currentSelectedModel = "";
        }
        if (DEBUG)
          console.log(
            "[Options Debug] Selected model ID adjusted after radio change:",
            currentSelectedModel,
          );
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
    } else {
      console.error("handleModelTextChange invalid index:", idx);
      return;
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
        if (DEBUG)
          console.log(
            "[Options Debug] Selected model ID updated via text input to:",
            currentSelectedModel,
          );
      }
    }
  }
  function handleModelLabelChange(event) {
    const newModelLabel = event.target.value.trim();
    const idx = parseInt(event.target.dataset.index, 10);
    if (idx >= 0 && idx < currentModels.length) {
      currentModels[idx].label = newModelLabel;
    } else {
      console.error("handleModelLabelChange invalid index:", idx);
    }
  }
  function handleModelRemoveClick(event) {
    removeModel(parseInt(event.target.dataset.index, 10));
  }
  function addModel() {
    currentModels.push({ id: "", label: "" });
    renderModelOptions();
    const newIndex = currentModels.length - 1;
    const newInput = document.getElementById(`modelText_${newIndex}`);
    if (newInput) {
      newInput.focus();
    }
  }
  function removeModel(indexToRemove) {
    if (indexToRemove < 0 || indexToRemove >= currentModels.length) return;
    const removedModelId = currentModels[indexToRemove].id;
    currentModels.splice(indexToRemove, 1);
    if (removedModelId === currentSelectedModel) {
      const firstValidModel = currentModels.find((m) => m.id.trim() !== "");
      currentSelectedModel = firstValidModel ? firstValidModel.id : "";
    }
    renderModelOptions();
  }

  // --- Language Selection & Autocomplete Functions ---
  function findLanguageByName(name) {
    if (
      !name ||
      typeof name !== "string" ||
      !ALL_LANGUAGE_NAMES_MAP ||
      Object.keys(ALL_LANGUAGE_NAMES_MAP).length === 0
    ) {
      if (DEBUG && name?.trim())
        console.warn(
          `[Options Debug] findLanguageByName: Map empty or not loaded when searching for "${name}". Map keys:`,
          Object.keys(ALL_LANGUAGE_NAMES_MAP || {}).length,
        );
      return undefined;
    }
    const cleanName = name.trim().toLowerCase();
    return ALL_LANGUAGE_NAMES_MAP[cleanName];
  }
  function filterLanguages(query) {
    const lowerQuery = query.toLowerCase().trim();
    if (
      !lowerQuery ||
      !ALL_LANGUAGE_NAMES_MAP ||
      Object.keys(ALL_LANGUAGE_NAMES_MAP).length === 0
    )
      return [];
    if (DEBUG)
      console.log(
        `[Options Debug] filterLanguages: Filtering for "${lowerQuery}". Map size: ${Object.keys(ALL_LANGUAGE_NAMES_MAP).length}`,
      );
    const results = Object.keys(ALL_LANGUAGE_NAMES_MAP)
      .filter((lowerName) => lowerName.includes(lowerQuery))
      .map((lowerName) => ALL_LANGUAGE_NAMES_MAP[lowerName]);
    if (DEBUG)
      console.log(
        `[Options Debug] filterLanguages: Found ${results.length} results.`,
      );
    return results;
  }
  function showAutocompleteSuggestions(inputElement, suggestions) {
    if (DEBUG)
      console.log(
        `[Options Debug] showAutocompleteSuggestions called with ${suggestions.length} suggestions for input:`,
        inputElement.id,
      );
    if (!autocompleteDropdown) {
      autocompleteDropdown = document.createElement("div");
      autocompleteDropdown.className = "autocomplete-dropdown";
      document.body.appendChild(autocompleteDropdown);
      document.addEventListener("click", handleGlobalClick);
      autocompleteDropdown.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
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
      flagImg.onerror = function () {
        this.src = FALLBACK_SVG_PATH;
        this.alt = "Flag not found";
      };
      const nameSpan = document.createElement("span");
      nameSpan.textContent = lang.name;
      nameSpan.className = "language-name";
      item.appendChild(flagImg);
      item.appendChild(nameSpan);
      item.addEventListener("click", () => {
        selectAutocompleteSuggestion(item, inputElement);
      });
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
    if (DEBUG)
      console.log(
        `[Options Debug] showAutocompleteSuggestions: Dropdown positioned at top: ${autocompleteDropdown.style.top}, left: ${autocompleteDropdown.style.left}, width: ${autocompleteDropdown.style.width}`,
      );
    activeAutocompleteInput = inputElement;
  }
  function hideAutocompleteSuggestions() {
    if (autocompleteDropdown) {
      autocompleteDropdown.style.display = "none";
      highlightedAutocompleteIndex = -1;
      const currentHighlighted = autocompleteDropdown.querySelector(
        ".autocomplete-item.selected",
      );
      if (currentHighlighted) {
        currentHighlighted.classList.remove("selected");
      }
    }
    activeAutocompleteInput = null;
  }
  function selectAutocompleteSuggestion(itemElement, inputElement) {
    if (!itemElement || !inputElement) return;
    const languageName = itemElement.dataset.languageName;
    const languageCode = itemElement.dataset.languageCode;
    if (DEBUG)
      console.log(
        `[Options Debug] selectAutocompleteSuggestion: Selecting "${languageName}" (Code: ${languageCode}) for input #${inputElement.id}`,
      );
    inputElement.value = languageName;
    const flagImg = inputElement.parentElement?.querySelector(".language-flag");
    if (flagImg && languageCode) {
      flagImg.src = `${SVG_PATH_PREFIX}${languageCode.toLowerCase()}.svg`;
      flagImg.alt = `${languageName} flag`;
      flagImg.onerror = function () {
        this.src = FALLBACK_SVG_PATH;
        this.alt = "Flag not found";
      };
    } else if (flagImg) {
      flagImg.src = FALLBACK_SVG_PATH;
      flagImg.alt = "Flag not found";
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
      items[highlightedAutocompleteIndex].scrollIntoView({ block: "nearest" });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlightedAutocompleteIndex =
        (highlightedAutocompleteIndex - 1 + items.length) % items.length;
      updateAutocompleteHighlight(items);
      items[highlightedAutocompleteIndex].scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      if (highlightedAutocompleteIndex > -1 && activeAutocompleteInput) {
        event.preventDefault();
        selectAutocompleteSuggestion(
          items[highlightedAutocompleteIndex],
          activeAutocompleteInput,
        );
      }
    } else if (event.key === "Escape") {
      hideAutocompleteSuggestions();
      event.preventDefault();
    }
  }
  function updateAutocompleteHighlight(items) {
    items.forEach((item, index) => {
      item.classList.toggle("selected", index === highlightedAutocompleteIndex);
    });
  }
  function handleGlobalClick(event) {
    const clickedInsideInputWrapper = activeAutocompleteInput
      ? activeAutocompleteInput
          .closest(".language-input-wrapper")
          .contains(event.target)
      : false;
    if (
      activeAutocompleteInput &&
      (clickedInsideInputWrapper ||
        (autocompleteDropdown && autocompleteDropdown.contains(event.target)))
    ) {
      return;
    }
    hideAutocompleteSuggestions();
  }
  function setupAutocomplete(inputElement) {
    inputElement.addEventListener("input", (event) => {
      const query = event.target.value;
      if (DEBUG)
        console.log(
          `[Options Debug] Input event on #${inputElement.id}. Query: "${query}". Checking map size: ${Object.keys(ALL_LANGUAGE_NAMES_MAP).length}`,
        );
      const suggestions = filterLanguages(query);
      if (DEBUG)
        console.log(
          `[Options Debug] Input event on #${inputElement.id}. Suggestions found: ${suggestions.length}`,
        );
      if (query.length > 0 && suggestions.length > 0) {
        showAutocompleteSuggestions(event.target, suggestions);
      } else {
        hideAutocompleteSuggestions();
      }
      handleLanguageTextChange(event);
    });
    inputElement.addEventListener("focus", (event) => {
      const query = event.target.value;
      if (query.length > 0) {
        const suggestions = filterLanguages(query);
        if (suggestions.length > 0) {
          showAutocompleteSuggestions(event.target, suggestions);
        } else {
          hideAutocompleteSuggestions();
        }
      }
    });
    inputElement.addEventListener("blur", hideAutocompleteSuggestions);
    inputElement.addEventListener("keydown", handleAutocompleteKeydown);
  }
  function renderLanguageOptions() {
    if (!languageSelectionArea) return;
    languageSelectionArea.innerHTML = "";
    if (DEBUG)
      console.log(
        `[Options Debug] renderLanguageOptions: Rendering ${currentAvailableLanguages.length} languages. SVG Prefix: ${SVG_PATH_PREFIX ? "Loaded" : "Not Loaded"}`,
      );
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
        flagImg.onerror = function () {
          this.src = FALLBACK_SVG_PATH || "";
          this.alt = "Flag not found";
          if (DEBUG)
            console.warn(`[Options Debug] Flag onerror for ${langCode}`);
        };
      } else {
        flagImg.src = FALLBACK_SVG_PATH || "";
        flagImg.alt = "Flag not found";
        if (DEBUG && langName && SVG_PATH_PREFIX)
          console.warn(
            `[Options Debug] No valid code/path for language "${langName}"`,
          );
      }
      const textInput = document.createElement("input");
      textInput.type = "text";
      textInput.id = `langText_${index}`;
      textInput.value = langName;
      textInput.placeholder = "Enter Language Name";
      textInput.dataset.index = index;
      textInput.setAttribute("autocomplete", "off");
      textInput.addEventListener("input", handleLanguageTextChange);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "✕";
      removeBtn.className = "button remove-button";
      removeBtn.title = "Remove this language";
      removeBtn.dataset.index = index;
      removeBtn.addEventListener("click", handleLanguageRemoveClick);
      label.appendChild(flagImg);
      label.appendChild(textInput);
      group.appendChild(grabHandle);
      group.appendChild(label);
      group.appendChild(removeBtn);
      group.addEventListener("dragover", handleDragOver);
      group.addEventListener("dragleave", handleDragLeave);
      group.addEventListener("drop", handleDrop);
      languageSelectionArea.appendChild(group);
      setupAutocomplete(textInput);
    });
  }
  function handleLanguageTextChange(event) {
    const newLangName = event.target.value;
    const idx = parseInt(event.target.dataset.index, 10);
    if (idx >= 0 && idx < currentAvailableLanguages.length) {
      currentAvailableLanguages[idx] = newLangName.trim();
    } else {
      console.error("handleLanguageTextChange invalid index:", idx);
      return;
    }
    const flagImg = event.target.parentElement?.querySelector(".language-flag");
    if (flagImg) {
      const languageData = findLanguageByName(newLangName);
      const languageCode = languageData ? languageData.code : null;
      if (languageCode && SVG_PATH_PREFIX) {
        flagImg.src = `${SVG_PATH_PREFIX}${languageCode.toLowerCase()}.svg`;
        flagImg.alt = `${languageData.name} flag`;
        flagImg.style.display = "";
        flagImg.onerror = function () {
          this.src = FALLBACK_SVG_PATH;
          this.alt = "Flag not found";
        };
      } else {
        flagImg.src = FALLBACK_SVG_PATH;
        flagImg.alt = "Flag not found";
      }
    }
  }
  function handleLanguageRemoveClick(event) {
    removeLanguage(parseInt(event.target.dataset.index, 10));
  }
  function addLanguage() {
    currentAvailableLanguages.push("");
    renderLanguageOptions();
    const newIndex = currentAvailableLanguages.length - 1;
    const newInput = document.getElementById(`langText_${newIndex}`);
    if (newInput) {
      newInput.focus();
    }
  }
  function removeLanguage(indexToRemove) {
    if (indexToRemove < 0 || indexToRemove >= currentAvailableLanguages.length)
      return;
    currentAvailableLanguages.splice(indexToRemove, 1);
    renderLanguageOptions();
  }

  // --- Drag and Drop Handlers ---
  function handleDragStart(event) {
    const languageOptionElement = event.target.closest(".language-option");
    if (!languageOptionElement) {
      event.preventDefault();
      return;
    }
    draggedItemIndex = parseInt(languageOptionElement.dataset.index, 10);
    event.dataTransfer.setData("text/plain", draggedItemIndex);
    event.dataTransfer.effectAllowed = "move";
    languageOptionElement.classList.add("dragging");
    if (DEBUG)
      console.log("[Options Debug] Drag start for index:", draggedItemIndex);
  }
  function handleDragOver(event) {
    event.preventDefault();
    const targetElement = event.target.closest(".language-option");
    if (!targetElement || targetElement.classList.contains("dragging")) {
      if (dragOverElement) {
        dragOverElement.classList.remove("drag-over-top", "drag-over-bottom");
        dragOverElement = null;
      }
      return;
    }
    const rect = targetElement.getBoundingClientRect();
    const mouseY = event.clientY;
    const midpoint = rect.top + rect.height / 2;
    if (dragOverElement && dragOverElement !== targetElement) {
      dragOverElement.classList.remove("drag-over-top", "drag-over-bottom");
    }
    if (mouseY < midpoint) {
      targetElement.classList.add("drag-over-top");
      targetElement.classList.remove("drag-over-bottom");
    } else {
      targetElement.classList.add("drag-over-bottom");
      targetElement.classList.remove("drag-over-top");
    }
    dragOverElement = targetElement;
    event.dataTransfer.dropEffect = "move";
  }
  function handleDragLeave(event) {
    if (
      event.relatedTarget &&
      event.relatedTarget.closest(".language-option") ===
        event.target.closest(".language-option")
    ) {
      return;
    }
    if (dragOverElement) {
      dragOverElement.classList.remove("drag-over-top", "drag-over-bottom");
      dragOverElement = null;
    }
  }
  function handleDrop(event) {
    event.preventDefault();
    if (dragOverElement) {
      dragOverElement.classList.remove("drag-over-top", "drag-over-bottom");
      dragOverElement = null;
    }
    const droppedItemIndex = parseInt(
      event.dataTransfer.getData("text/plain"),
      10,
    );
    const targetElement = event.target.closest(".language-option");
    if (
      !targetElement ||
      droppedItemIndex === null ||
      droppedItemIndex === undefined
    ) {
      if (DEBUG)
        console.warn("[Options Debug] Drop failed: Invalid target or index.");
      return;
    }
    const targetIndex = parseInt(targetElement.dataset.index, 10);
    const rect = targetElement.getBoundingClientRect();
    const mouseY = event.clientY;
    const midpoint = rect.top + rect.height / 2;
    let newIndex = mouseY < midpoint ? targetIndex : targetIndex + 1;
    newIndex = Math.max(
      0,
      Math.min(newIndex, currentAvailableLanguages.length),
    );
    if (newIndex === droppedItemIndex || newIndex === droppedItemIndex + 1) {
      if (DEBUG) console.log("[Options Debug] Dropped onto original position.");
      return;
    }
    if (DEBUG)
      console.log(
        `[Options Debug] Dropped index ${droppedItemIndex} onto target index ${targetIndex}. New index: ${newIndex}.`,
      );
    const [draggedLanguage] = currentAvailableLanguages.splice(
      droppedItemIndex,
      1,
    );
    const insertionIndex =
      newIndex > droppedItemIndex ? newIndex - 1 : newIndex;
    currentAvailableLanguages.splice(insertionIndex, 0, draggedLanguage);
    if (DEBUG)
      console.log("[Options Debug] Array after splice:", [
        ...currentAvailableLanguages,
      ]);
    renderLanguageOptions();
  }
  function handleDragEnd(event) {
    const languageOptionElement = event.target.closest(".language-option");
    if (languageOptionElement) {
      languageOptionElement.classList.remove("dragging");
    }
    if (dragOverElement) {
      dragOverElement.classList.remove("drag-over-top", "drag-over-bottom");
      dragOverElement = null;
    }
    draggedItemIndex = null;
    if (DEBUG) console.log("[Options Debug] Drag end.");
  }

  // --- Prompt Preview Function ---
  function updatePromptPreview() {
    if (DEBUG) console.log("[Options Debug] Updating prompt preview...");
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

  /** Loads settings and populates the form */
  async function loadSettings() {
    try {
      const initialDebug = await chrome.storage.sync.get("debug");
      DEBUG = !!initialDebug.debug;
    } catch (e) {
      DEBUG = false;
    }
    console.log(
      "[Options Debug] Starting loadSettings. Initial DEBUG state:",
      DEBUG,
    );

    if (statusMessage) {
      statusMessage.textContent = "Loading...";
      statusMessage.className = "status-message";
    } else {
      console.warn("[Options Debug] Status message element not found in HTML.");
    }

    try {
      const [langDataResponse, settingsResponse] = await Promise.all([
        new Promise((resolve) =>
          chrome.runtime.sendMessage({ action: "getLanguageData" }, resolve),
        ),
        new Promise((resolve) =>
          chrome.runtime.sendMessage({ action: "getSettings" }, resolve),
        ), // Settings includes models now
      ]);

      let langError = false;
      // Process Language Data FIRST
      if (
        chrome.runtime.lastError ||
        !langDataResponse?.ALL_LANGUAGE_NAMES_MAP
      ) {
        console.error(
          "Error fetching language data:",
          chrome.runtime.lastError || "Invalid response",
        );
        if (statusMessage) {
          statusMessage.textContent = `Error loading language list. Autocomplete/flags disabled.`;
          statusMessage.className = "status-message error";
        }
        ALL_LANGUAGE_NAMES_MAP = {};
        SVG_PATH_PREFIX = "";
        FALLBACK_SVG_PATH = "";
        langError = true;
      } else {
        ALL_LANGUAGE_NAMES_MAP = langDataResponse.ALL_LANGUAGE_NAMES_MAP;
        SVG_PATH_PREFIX = langDataResponse.SVG_PATH_PREFIX;
        FALLBACK_SVG_PATH = langDataResponse.FALLBACK_SVG_PATH;
        if (DEBUG)
          console.log(
            `[Options Debug] Fetched ${Object.keys(ALL_LANGUAGE_NAMES_MAP).length} languages. Map keys sample:`,
            Object.keys(ALL_LANGUAGE_NAMES_MAP).slice(0, 5),
          );
      }

      // Process Settings (which includes models)
      if (chrome.runtime.lastError || settingsResponse?.error) {
        console.error(
          "Error loading settings:",
          chrome.runtime.lastError || settingsResponse?.error,
        );
        if (statusMessage) {
          statusMessage.textContent = `Error loading settings: ${chrome.runtime.lastError?.message || settingsResponse?.error}. Using defaults.`;
          statusMessage.className = "status-message error";
        }
        // Apply defaults manually
        if (apiKeyInput) apiKeyInput.value = "";
        if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
        DEBUG = DEFAULT_DEBUG_MODE;
        bulletCountRadios.forEach(
          (radio) => (radio.checked = radio.value === DEFAULT_BULLET_COUNT),
        );
        currentModels = [...DEFAULT_MODEL_OPTIONS]; // Use default models on error
        currentSelectedModel =
          currentModels.length > 0 ? currentModels[0].id : "";
        currentAvailableLanguages = DEFAULT_PREPOPULATE_LANGUAGES.filter(
          (name) => findLanguageByName(name),
        );
        currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
        if (promptFormatInstructionsTextarea)
          promptFormatInstructionsTextarea.value =
            currentCustomFormatInstructions;
      } else {
        // Populate UI using fetched settings
        const data = settingsResponse;
        DEBUG = !!data.debug; // Update DEBUG state from fetched settings
        if (DEBUG) {
          const settingsToLog = { ...data };
          if (settingsToLog.apiKey) settingsToLog.apiKey = "[API Key Hidden]";
          console.log(
            "[Options Debug] Loaded settings from background:",
            settingsToLog,
          );
        }

        if (apiKeyInput) apiKeyInput.value = data.apiKey || "";
        if (debugCheckbox) debugCheckbox.checked = DEBUG;

        let countValue = data.bulletCount || DEFAULT_BULLET_COUNT;
        bulletCountRadios.forEach(
          (radio) => (radio.checked = radio.value === countValue),
        );

        // Use models array directly from settings response
        currentModels = data.models || [...DEFAULT_MODEL_OPTIONS]; // Use saved or default
        currentSelectedModel =
          data.model || (currentModels.length > 0 ? currentModels[0].id : ""); // Use saved or default selected ID
        // Ensure selected model actually exists in the list
        if (
          !currentModels.some((m) => m.id === currentSelectedModel) &&
          currentModels.length > 0
        ) {
          currentSelectedModel = currentModels[0].id;
        } else if (currentModels.length === 0) {
          currentSelectedModel = "";
        }

        currentAvailableLanguages = data.availableLanguages || [];
        if (!langError) {
          // Only filter if language map loaded
          const validSavedLanguages = currentAvailableLanguages.filter((name) =>
            findLanguageByName(name),
          );
          if (
            validSavedLanguages.length < currentAvailableLanguages.length &&
            DEBUG
          ) {
            console.warn(
              "[Options Debug] Some saved languages were invalid and removed during load.",
            );
          }
          currentAvailableLanguages = validSavedLanguages;
        }
        if (currentAvailableLanguages.length === 0) {
          currentAvailableLanguages.push("");
        }

        currentCustomFormatInstructions =
          data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] || DEFAULT_FORMAT_INSTRUCTIONS;
        if (promptFormatInstructionsTextarea) {
          promptFormatInstructionsTextarea.value =
            currentCustomFormatInstructions;
        }

        if (!langError && statusMessage) {
          // Only show success if everything loaded
          statusMessage.textContent = "Options loaded.";
          statusMessage.className = "status-message success";
          setTimeout(() => {
            if (statusMessage) {
              statusMessage.textContent = "";
              statusMessage.className = "status-message";
            }
          }, 1500);
        }
      }
    } catch (error) {
      console.error("Error during settings loading process:", error);
      if (statusMessage) {
        statusMessage.textContent = `Error: ${error.message}`;
        statusMessage.className = "status-message error";
      }
      // Apply defaults as a fallback
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
      currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
      if (promptFormatInstructionsTextarea)
        promptFormatInstructionsTextarea.value =
          currentCustomFormatInstructions;
    }

    // --- Render UI elements ---
    renderModelOptions();
    renderLanguageOptions();
    updatePromptPreview();
    if (DEBUG) console.log("[Options Debug] Settings loaded and UI populated.");
  }

  /** Saves the current settings */
  function saveSettings() {
    if (DEBUG) console.log("[Options Debug] Attempting to save settings...");
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
    const debug = debugCheckbox ? debugCheckbox.checked : false;
    let bulletCount = DEFAULT_BULLET_COUNT;
    document.querySelectorAll('input[name="bulletCount"]').forEach((radio) => {
      if (radio.checked) bulletCount = radio.value;
    });
    const customFormatInstructionsToSave = promptFormatInstructionsTextarea
      ? promptFormatInstructionsTextarea.value
      : currentCustomFormatInstructions;
    currentCustomFormatInstructions = customFormatInstructionsToSave;

    // Filter and save the whole model objects
    const modelsToSave = currentModels
      .map((m) => ({ id: m.id.trim(), label: m.label.trim() }))
      .filter((m) => m.id !== "");

    let finalSelectedModel = "";
    const savedModelIds = modelsToSave.map((m) => m.id);
    if (currentSelectedModel && savedModelIds.includes(currentSelectedModel)) {
      finalSelectedModel = currentSelectedModel;
    } else if (modelsToSave.length > 0) {
      finalSelectedModel = modelsToSave[0].id;
    } else {
      finalSelectedModel = "";
    }
    currentSelectedModel = finalSelectedModel; // Update state

    // Validate languages before saving
    const languageInputs = languageSelectionArea.querySelectorAll(
      '.language-option input[type="text"]',
    );
    const languagesToSave = Array.from(languageInputs)
      .map((input) => input.value.trim())
      .filter((lang) => lang !== "" && findLanguageByName(lang));
    const allEnteredNames = Array.from(languageInputs)
      .map((input) => input.value.trim())
      .filter((lang) => lang !== "");
    let invalidLanguagesFound = false;
    if (allEnteredNames.length > languagesToSave.length) {
      invalidLanguagesFound = true;
      const invalidNames = allEnteredNames
        .filter((name) => !findLanguageByName(name))
        .join(", ");
      if (DEBUG)
        console.warn(
          `[Options Debug] Invalid languages entered: ${invalidNames}`,
        );
      alert(
        `Warning: The following entered languages are not recognized and will not be saved: ${invalidNames}\nPlease correct them or remove them.`,
      );
      languageInputs.forEach((input) => {
        input.style.borderColor =
          input.value.trim() !== "" && !findLanguageByName(input.value.trim())
            ? "red"
            : "";
      });
    } else {
      languageInputs.forEach((input) => (input.style.borderColor = ""));
    }

    const settingsToSave = {
      apiKey,
      model: finalSelectedModel,
      models: modelsToSave, // Save array of objects
      debug,
      bulletCount,
      availableLanguages: languagesToSave,
      [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]: customFormatInstructionsToSave,
      [PROMPT_STORAGE_KEY_PREAMBLE]: DEFAULT_PREAMBLE_TEMPLATE,
      [PROMPT_STORAGE_KEY_POSTAMBLE]: DEFAULT_POSTAMBLE_TEXT,
      [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]: DEFAULT_FORMAT_INSTRUCTIONS,
    };

    if (DEBUG) {
      const settingsToLog = { ...settingsToSave };
      if (settingsToLog.apiKey) settingsToLog.apiKey = "[API Key Hidden]";
      console.log("[Options Debug] Saving data:", settingsToLog);
    }

    chrome.storage.sync.set(settingsToSave, () => {
      if (chrome.runtime.lastError) {
        if (statusMessage) {
          statusMessage.textContent = `Error saving: ${chrome.runtime.lastError.message}`;
          statusMessage.className = "status-message error";
        }
        console.error("Error saving settings:", chrome.runtime.lastError);
      } else {
        if (statusMessage) {
          statusMessage.textContent = "Options saved!";
          statusMessage.className = "status-message success";
        }
        if (DEBUG) console.log("[Options Debug] Options saved successfully.");
        currentAvailableLanguages = languagesToSave; // Update state *after* successful save
        if (!invalidLanguagesFound) {
          renderModelOptions();
          renderLanguageOptions();
          updatePromptPreview();
        } else {
          renderModelOptions();
          updatePromptPreview();
        } // Don't re-render languages if invalid ones were shown
      }
      if (statusMessage) {
        setTimeout(() => {
          if (statusMessage) {
            statusMessage.textContent = "";
            statusMessage.className = "status-message";
          }
        }, 2000);
      }
    });
  }

  /** Resets settings to defaults */
  function resetToDefaults() {
    if (DEBUG)
      console.log(
        "[Options Debug] Resetting options to defaults (excluding API key)...",
      );
    currentModels = [...DEFAULT_MODEL_OPTIONS];
    currentSelectedModel = currentModels.length > 0 ? currentModels[0].id : "";
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
    saveSettings(); // Save the reset state
    if (statusMessage) {
      statusMessage.textContent = "Defaults Reset & Saved!";
      statusMessage.className = "status-message success";
      setTimeout(() => {
        if (statusMessage) {
          statusMessage.textContent = "";
          statusMessage.className = "status-message";
        }
      }, 2500);
    }
  }

  // --- Collapsible Section Logic ---
  function setupCollapsible() {
    if (!advancedOptionsToggle || !advancedOptionsContent) {
      if (DEBUG)
        console.warn("[Options Debug] Collapsible elements not found.");
      return;
    }
    const toggleIndicator =
      advancedOptionsToggle.querySelector(".toggle-indicator");
    const toggleSection = () => {
      const isExpanded =
        advancedOptionsToggle.getAttribute("aria-expanded") === "true";
      advancedOptionsToggle.setAttribute("aria-expanded", !isExpanded);
      advancedOptionsContent.classList.toggle("active");
      if (toggleIndicator) {
        toggleIndicator.textContent = isExpanded ? "►" : "▼";
      }
      if (!isExpanded) {
        setTimeout(() => {
          advancedOptionsToggle.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }, 100);
      }
    };
    advancedOptionsToggle.addEventListener("click", toggleSection);
    advancedOptionsToggle.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSection();
      }
    });
    advancedOptionsContent.classList.remove("active");
    advancedOptionsToggle.setAttribute("aria-expanded", "false");
    if (toggleIndicator) {
      toggleIndicator.textContent = "►";
    }
  }

  // --- Event Listeners ---
  if (saveButton) saveButton.addEventListener("click", saveSettings);
  if (addModelBtn) addModelBtn.addEventListener("click", addModel);
  if (addLangBtn) addLangBtn.addEventListener("click", addLanguage);
  if (resetButton)
    resetButton.addEventListener("click", () => {
      if (
        confirm(
          "Are you sure you want to reset all options (except API key) to their defaults? This will also reset the prompt customization.",
        )
      ) {
        resetToDefaults();
      }
    });
  bulletCountRadios.forEach((radio) => {
    radio.addEventListener("change", updatePromptPreview);
  });
  if (promptFormatInstructionsTextarea) {
    promptFormatInstructionsTextarea.addEventListener("input", (event) => {
      currentCustomFormatInstructions = event.target.value;
    });
  }
  document.addEventListener("click", handleGlobalClick);

  // --- Initial Load & Setup ---
  await loadSettings(); // Load settings AND language data using messages
  setupCollapsible();
}); // End DOMContentLoaded
