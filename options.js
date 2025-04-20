// options.js
// v2.13 - Use background for settings & Re-added API key sanitization

import {
    // Keep prompt keys for saving, but defaults come from background now
    PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
    PROMPT_STORAGE_KEY_PREAMBLE,
    PROMPT_STORAGE_KEY_POSTAMBLE,
    PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
    // Keep defaults for reset functionality and initial state before load
    DEFAULT_PREAMBLE_TEMPLATE,
    DEFAULT_POSTAMBLE_TEXT,
    DEFAULT_FORMAT_INSTRUCTIONS,
    DEFAULT_MODEL_OPTIONS,
    DEFAULT_PREPOPULATE_LANGUAGES
    // SVG paths are fetched from background
} from './constants.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM Elements ---
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelectionArea = document.getElementById('modelSelectionArea');
    const addModelBtn = document.getElementById('addModelBtn');
    const languageSelectionArea = document.getElementById('languageSelectionArea');
    const addLangBtn = document.getElementById('addLangBtn');
    const debugCheckbox = document.getElementById('debug');
    const bulletCountRadios = document.querySelectorAll('input[name="bulletCount"]');
    const saveButton = document.getElementById('save');
    const resetButton = document.getElementById('resetDefaultsBtn');
    const statusMessage = document.getElementById('status');
    const promptPreambleDiv = document.getElementById('promptPreamble');
    const promptFormatInstructionsTextarea = document.getElementById('promptFormatInstructions');
    const promptPostambleDiv = document.getElementById('promptPostamble');
    const advancedOptionsToggle = document.getElementById('advancedOptionsToggle');
    const advancedOptionsContent = document.getElementById('advancedOptionsContent');

    // --- Constants ---
    const DEFAULT_BULLET_COUNT = "5";
    const LANGUAGE_FLAG_CLASS = 'language-flag';
    const DEFAULT_DEBUG_MODE = false;
    const NUM_TO_WORD = { 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };

    // --- Language Data Storage ---
    let ALL_LANGUAGES_MAP = {}; // Populated from background.js
    let ALL_LANGUAGE_NAMES_MAP = {}; // Populated from background.js
    let SVG_PATH_PREFIX = ''; // Populated from background.js
    let FALLBACK_SVG_PATH = ''; // Populated from background.js

    // --- State Variables ---
    let DEBUG = false;
    let currentModels = []; // Stores {id, label} objects, now fetched from background message
    let currentSelectedModel = '';
    let currentAvailableLanguages = []; // Stores language names
    let currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS; // Default before load

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
        modelSelectionArea.innerHTML = '';
        if (!currentModels || currentModels.length === 0) {
             modelSelectionArea.innerHTML = '<p>No models configured. Add one below or save to use defaults.</p>';
             if (addModelBtn) addModelBtn.disabled = true;
             return;
        } else {
             if (addModelBtn) addModelBtn.disabled = false;
        }
        const availableModelIds = currentModels.map(m => m.id);
        if (!currentSelectedModel || !availableModelIds.includes(currentSelectedModel)) {
             currentSelectedModel = currentModels.length > 0 ? currentModels[0].id : '';
        }
        currentModels.forEach((model, index) => {
            const isChecked = (model.id === currentSelectedModel && model.id.trim() !== '');
            const group = document.createElement('div'); group.className = 'option-group model-option';
            const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'selectedModelOption'; radio.id = `modelRadio_${index}`; radio.value = model.id; radio.checked = isChecked; radio.dataset.index = index; radio.disabled = !model.id.trim(); radio.addEventListener('change', handleModelRadioChange);
            const textInput = document.createElement('input'); textInput.type = 'text'; textInput.id = `modelText_${index}`; textInput.value = model.id; textInput.placeholder = "Enter OpenRouter Model ID"; textInput.dataset.index = index; textInput.addEventListener('input', handleModelTextChange);
            const labelInput = document.createElement('input'); labelInput.type = 'text'; labelInput.id = `modelLabel_${index}`; labelInput.value = model.label || model.id; labelInput.placeholder = "Enter Model Label (Optional)"; labelInput.dataset.index = index; labelInput.addEventListener('input', handleModelLabelChange);
            const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.textContent = '✕'; removeBtn.className = 'button remove-button'; removeBtn.title = 'Remove this model'; removeBtn.dataset.index = index; removeBtn.addEventListener('click', handleModelRemoveClick);
            group.appendChild(radio); group.appendChild(textInput); group.appendChild(labelInput); group.appendChild(removeBtn);
            modelSelectionArea.appendChild(group);
        });
    }
    function handleModelRadioChange(event) {
        if (event.target.checked) {
            const index = parseInt(event.target.dataset.index, 10);
            const selectedModel = currentModels[index];
            if (selectedModel && selectedModel.id.trim()) {
                currentSelectedModel = selectedModel.id.trim();
                if (DEBUG) console.log("Selected model ID changed to:", currentSelectedModel);
            } else {
                event.target.checked = false;
                const firstValidModel = currentModels.find(m => m.id.trim() !== '');
                if (firstValidModel) {
                     const firstValidRadio = modelSelectionArea.querySelector(`input[type="radio"][value="${firstValidModel.id}"]`);
                     if (firstValidRadio) { firstValidRadio.checked = true; currentSelectedModel = firstValidModel.id; }
                     else { currentSelectedModel = ''; }
                } else { currentSelectedModel = ''; }
                if (DEBUG) console.log("Selected model ID adjusted after radio change:", currentSelectedModel);
            }
        }
     }
    function handleModelTextChange(event) {
        const newModelId = event.target.value.trim();
        const idx = parseInt(event.target.dataset.index, 10);
        if (idx >= 0 && idx < currentModels.length) {
             currentModels[idx].id = newModelId;
             const labelInput = document.getElementById(`modelLabel_${idx}`);
             if (labelInput && !labelInput.value.trim()) { labelInput.value = newModelId; currentModels[idx].label = newModelId; }
        } else { console.error("handleModelTextChange invalid index:", idx); return; }
        const associatedRadio = document.getElementById(`modelRadio_${idx}`);
        if (associatedRadio) {
            associatedRadio.value = newModelId; associatedRadio.disabled = !newModelId;
            if (associatedRadio.checked) {
                 if (!newModelId) {
                    associatedRadio.checked = false; currentSelectedModel = '';
                    const firstValidModel = currentModels.find(m => m.id.trim() !== '');
                    if (firstValidModel) {
                         const firstValidRadio = modelSelectionArea.querySelector(`input[type="radio"][value="${firstValidModel.id}"]`);
                         if (firstValidRadio) { firstValidRadio.checked = true; currentSelectedModel = firstValidModel.id; }
                    }
                 } else { currentSelectedModel = newModelId; }
                 if (DEBUG) console.log("Selected model ID updated via text input to:", currentSelectedModel);
            }
        }
     }
     function handleModelLabelChange(event) {
         const newModelLabel = event.target.value.trim();
         const idx = parseInt(event.target.dataset.index, 10);
         if (idx >= 0 && idx < currentModels.length) { currentModels[idx].label = newModelLabel; }
         else { console.error("handleModelLabelChange invalid index:", idx); }
     }
    function handleModelRemoveClick(event) { removeModel(parseInt(event.target.dataset.index, 10)); }
    function addModel() {
        currentModels.push({ id: "", label: "" });
        renderModelOptions();
        const newIndex = currentModels.length - 1;
        const newInput = document.getElementById(`modelText_${newIndex}`);
        if (newInput) { newInput.focus(); }
     }
    function removeModel(indexToRemove) {
        if (indexToRemove < 0 || indexToRemove >= currentModels.length) return;
        const removedModelId = currentModels[indexToRemove].id;
        currentModels.splice(indexToRemove, 1);
        if (removedModelId === currentSelectedModel) {
            const firstValidModel = currentModels.find(m => m.id.trim() !== '');
            currentSelectedModel = firstValidModel ? firstValidModel.id : '';
        }
        renderModelOptions();
     }

    // --- Language Selection & Autocomplete Functions ---
    function filterLanguages(query) {
        const lowerQuery = query.toLowerCase().trim();
        if (!lowerQuery || !ALL_LANGUAGE_NAMES_MAP) return [];
        // Use ALL_LANGUAGE_NAMES_MAP for efficient filtering
        return Object.keys(ALL_LANGUAGE_NAMES_MAP)
               .filter(lowerName => lowerName.includes(lowerQuery))
               .map(lowerName => ALL_LANGUAGE_NAMES_MAP[lowerName]); // Return {code, name} objects
    }
    function findLanguageByName(name) {
        if (!name || typeof name !== 'string' || !ALL_LANGUAGE_NAMES_MAP) return undefined;
        const cleanName = name.trim().toLowerCase();
        return ALL_LANGUAGE_NAMES_MAP[cleanName]; // Returns { code, name } or undefined
    }
    function showAutocompleteSuggestions(inputElement, suggestions) {
        if (!autocompleteDropdown) {
            autocompleteDropdown = document.createElement('div'); autocompleteDropdown.className = 'autocomplete-dropdown'; document.body.appendChild(autocompleteDropdown);
            document.addEventListener('click', handleGlobalClick);
            autocompleteDropdown.addEventListener('mousedown', (event) => { event.preventDefault(); });
        }
        autocompleteDropdown.innerHTML = ''; highlightedAutocompleteIndex = -1;
        if (suggestions.length === 0) { autocompleteDropdown.style.display = 'none'; return; }
        suggestions.forEach((lang, index) => { // lang is {code, name}
            const item = document.createElement('div'); item.className = 'autocomplete-item'; item.dataset.index = index; item.dataset.languageCode = lang.code; item.dataset.languageName = lang.name;
            const flagImg = document.createElement('img'); flagImg.className = LANGUAGE_FLAG_CLASS;
            flagImg.src = `${SVG_PATH_PREFIX}${lang.code.toLowerCase()}.svg`; flagImg.alt = `${lang.name} flag`;
            flagImg.onerror = function() { this.src = FALLBACK_SVG_PATH; this.alt = 'Flag not found'; };
            const nameSpan = document.createElement('span'); nameSpan.textContent = lang.name; nameSpan.className = 'language-name';
            item.appendChild(flagImg); item.appendChild(nameSpan);
            item.addEventListener('click', () => { selectAutocompleteSuggestion(item, inputElement); });
            autocompleteDropdown.appendChild(item);
        });
        const rect = inputElement.closest('.language-input-wrapper').getBoundingClientRect();
        autocompleteDropdown.style.position = 'absolute'; autocompleteDropdown.style.top = `${rect.bottom + window.scrollY + 4}px`; autocompleteDropdown.style.left = `${rect.left + window.scrollX}px`; autocompleteDropdown.style.width = `${rect.width}px`; autocompleteDropdown.style.display = 'block';
        activeAutocompleteInput = inputElement;
    }
    function hideAutocompleteSuggestions() {
        if (autocompleteDropdown) { autocompleteDropdown.style.display = 'none'; highlightedAutocompleteIndex = -1; /* ... remove selected class ... */ }
        activeAutocompleteInput = null;
    }
    function selectAutocompleteSuggestion(itemElement, inputElement) {
        if (!itemElement || !inputElement) return;
        const languageName = itemElement.dataset.languageName; const languageCode = itemElement.dataset.languageCode;
        inputElement.value = languageName;
        const flagImg = inputElement.parentElement?.querySelector('.language-flag');
        if (flagImg && languageCode) {
            flagImg.src = `${SVG_PATH_PREFIX}${languageCode.toLowerCase()}.svg`; flagImg.alt = `${languageName} flag`;
            flagImg.onerror = function() { this.src = FALLBACK_SVG_PATH; this.alt = 'Flag not found'; };
        } else if (flagImg) { flagImg.src = FALLBACK_SVG_PATH; flagImg.alt = 'Flag not found'; }
        const event = new Event('input', { bubbles: true }); inputElement.dispatchEvent(event);
        hideAutocompleteSuggestions();
    }
    function handleAutocompleteKeydown(event) {
        if (!autocompleteDropdown || autocompleteDropdown.style.display === 'none') return;
        const items = autocompleteDropdown.querySelectorAll('.autocomplete-item'); if (items.length === 0) return;
        if (event.key === 'ArrowDown') { event.preventDefault(); highlightedAutocompleteIndex = (highlightedAutocompleteIndex + 1) % items.length; updateAutocompleteHighlight(items); items[highlightedAutocompleteIndex].scrollIntoView({ block: 'nearest' }); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); highlightedAutocompleteIndex = (highlightedAutocompleteIndex - 1 + items.length) % items.length; updateAutocompleteHighlight(items); items[highlightedAutocompleteIndex].scrollIntoView({ block: 'nearest' }); }
        else if (event.key === 'Enter') { if (highlightedAutocompleteIndex > -1 && activeAutocompleteInput) { event.preventDefault(); selectAutocompleteSuggestion(items[highlightedAutocompleteIndex], activeAutocompleteInput); } }
        else if (event.key === 'Escape') { hideAutocompleteSuggestions(); event.preventDefault(); }
    }
    function updateAutocompleteHighlight(items) { items.forEach((item, index) => { item.classList.toggle('selected', index === highlightedAutocompleteIndex); }); }
    function handleGlobalClick(event) {
        const clickedInsideInputWrapper = activeAutocompleteInput ? activeAutocompleteInput.closest('.language-input-wrapper').contains(event.target) : false;
        if (activeAutocompleteInput && (clickedInsideInputWrapper || (autocompleteDropdown && autocompleteDropdown.contains(event.target)))) { return; }
        hideAutocompleteSuggestions();
    }
    function setupAutocomplete(inputElement) {
        inputElement.addEventListener('input', (event) => {
            const query = event.target.value; const suggestions = filterLanguages(query);
            if (query.length > 0 && suggestions.length > 0) { showAutocompleteSuggestions(event.target, suggestions); } else { hideAutocompleteSuggestions(); }
            handleLanguageTextChange(event); // Always update flag/state on input
        });
        inputElement.addEventListener('focus', (event) => {
             const query = event.target.value; if (query.length > 0) { const suggestions = filterLanguages(query); if (suggestions.length > 0) { showAutocompleteSuggestions(event.target, suggestions); } else { hideAutocompleteSuggestions(); } }
        });
        inputElement.addEventListener('blur', hideAutocompleteSuggestions); // Mousedown on dropdown prevents this
        inputElement.addEventListener('keydown', handleAutocompleteKeydown);
    }
    function renderLanguageOptions() {
        if (!languageSelectionArea) return;
        languageSelectionArea.innerHTML = '';
        currentAvailableLanguages.forEach((langName, index) => {
            const group = document.createElement('div'); group.className = 'option-group language-option'; group.dataset.index = index;
            const grabHandle = document.createElement('div'); grabHandle.className = 'grab-handle'; grabHandle.draggable = true; grabHandle.title = 'Drag to reorder'; grabHandle.setAttribute('aria-label', 'Drag to reorder language'); grabHandle.setAttribute('role', 'button'); grabHandle.setAttribute('tabindex', '0');
            const dotsContainer = document.createElement('div'); dotsContainer.className = 'grab-handle-dots'; for (let i = 0; i < 3; i++) { const dot = document.createElement('div'); dot.className = 'grab-handle-dot'; dotsContainer.appendChild(dot); } grabHandle.appendChild(dotsContainer);
            grabHandle.addEventListener('dragstart', handleDragStart); grabHandle.addEventListener('dragend', handleDragEnd);
            const label = document.createElement('label'); label.className = 'language-input-wrapper';
            const flagImg = document.createElement('img'); flagImg.className = LANGUAGE_FLAG_CLASS;
            const languageData = findLanguageByName(langName); const languageCode = languageData ? languageData.code : null;
            if (languageCode && SVG_PATH_PREFIX) { flagImg.src = `${SVG_PATH_PREFIX}${languageCode.toLowerCase()}.svg`; flagImg.alt = `${langName} flag`; flagImg.onerror = function() { this.src = FALLBACK_SVG_PATH || ''; this.alt = 'Flag not found'; }; }
            else { flagImg.src = FALLBACK_SVG_PATH || ''; flagImg.alt = 'Flag not found'; }
            const textInput = document.createElement('input'); textInput.type = 'text'; textInput.id = `langText_${index}`; textInput.value = langName; textInput.placeholder = "Enter Language Name"; textInput.dataset.index = index; textInput.setAttribute('autocomplete', 'off'); textInput.addEventListener('input', handleLanguageTextChange);
            const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.textContent = '✕'; removeBtn.className = 'button remove-button'; removeBtn.title = 'Remove this language'; removeBtn.dataset.index = index; removeBtn.addEventListener('click', handleLanguageRemoveClick);
            label.appendChild(flagImg); label.appendChild(textInput);
            group.appendChild(grabHandle); group.appendChild(label); group.appendChild(removeBtn);
            group.addEventListener('dragover', handleDragOver); group.addEventListener('dragleave', handleDragLeave); group.addEventListener('drop', handleDrop);
            languageSelectionArea.appendChild(group);
            setupAutocomplete(textInput);
        });
     }
    function handleLanguageTextChange(event) {
        const newLangName = event.target.value; const idx = parseInt(event.target.dataset.index, 10);
        if (idx >= 0 && idx < currentAvailableLanguages.length) { currentAvailableLanguages[idx] = newLangName.trim(); }
        else { console.error("handleLanguageTextChange invalid index:", idx); return; }
        const flagImg = event.target.parentElement?.querySelector('.language-flag');
        if (flagImg) {
            const languageData = findLanguageByName(newLangName); const languageCode = languageData ? languageData.code : null;
            if (languageCode && SVG_PATH_PREFIX) { flagImg.src = `${SVG_PATH_PREFIX}${languageCode.toLowerCase()}.svg`; flagImg.alt = `${languageData.name} flag`; flagImg.style.display = ''; flagImg.onerror = function() { this.src = FALLBACK_SVG_PATH; this.alt = 'Flag not found'; }; }
            else { flagImg.src = FALLBACK_SVG_PATH; flagImg.alt = 'Flag not found'; }
        }
     }
    function handleLanguageRemoveClick(event) { removeLanguage(parseInt(event.target.dataset.index, 10)); }
    function addLanguage() {
        currentAvailableLanguages.push(""); renderLanguageOptions();
        const newIndex = currentAvailableLanguages.length - 1; const newInput = document.getElementById(`langText_${newIndex}`); if (newInput) { newInput.focus(); }
     }
    function removeLanguage(indexToRemove) {
        if (indexToRemove < 0 || indexToRemove >= currentAvailableLanguages.length) return;
        currentAvailableLanguages.splice(indexToRemove, 1); renderLanguageOptions();
     }

    // --- Drag and Drop Handlers ---
    function handleDragStart(event) {
        const languageOptionElement = event.target.closest('.language-option'); if (!languageOptionElement) { event.preventDefault(); return; }
        draggedItemIndex = parseInt(languageOptionElement.dataset.index, 10); event.dataTransfer.setData('text/plain', draggedItemIndex); event.dataTransfer.effectAllowed = 'move';
        languageOptionElement.classList.add('dragging'); if (DEBUG) console.log('[LLM Options Drag] Drag start for index:', draggedItemIndex);
    }
    function handleDragOver(event) {
        event.preventDefault(); const targetElement = event.target.closest('.language-option');
        if (!targetElement || targetElement.classList.contains('dragging')) { if (dragOverElement) { dragOverElement.classList.remove('drag-over-top', 'drag-over-bottom'); dragOverElement = null; } return; }
        const rect = targetElement.getBoundingClientRect(); const mouseY = event.clientY; const midpoint = rect.top + rect.height / 2;
        if (dragOverElement && dragOverElement !== targetElement) { dragOverElement.classList.remove('drag-over-top', 'drag-over-bottom'); }
        if (mouseY < midpoint) { targetElement.classList.add('drag-over-top'); targetElement.classList.remove('drag-over-bottom'); }
        else { targetElement.classList.add('drag-over-bottom'); targetElement.classList.remove('drag-over-top'); }
        dragOverElement = targetElement; event.dataTransfer.dropEffect = 'move';
    }
    function handleDragLeave(event) {
        if (event.relatedTarget && event.relatedTarget.closest('.language-option') === event.target.closest('.language-option')) { return; }
        if (dragOverElement) { dragOverElement.classList.remove('drag-over-top', 'drag-over-bottom'); dragOverElement = null; }
    }
    function handleDrop(event) {
        event.preventDefault(); if (dragOverElement) { dragOverElement.classList.remove('drag-over-top', 'drag-over-bottom'); dragOverElement = null; }
        const droppedItemIndex = parseInt(event.dataTransfer.getData('text/plain'), 10); const targetElement = event.target.closest('.language-option');
        if (!targetElement || droppedItemIndex === null || droppedItemIndex === undefined) { if (DEBUG) console.warn('[LLM Options Drag] Drop failed: Invalid target or index.'); return; }
        const targetIndex = parseInt(targetElement.dataset.index, 10); const rect = targetElement.getBoundingClientRect(); const mouseY = event.clientY; const midpoint = rect.top + rect.height / 2;
        let newIndex = (mouseY < midpoint) ? targetIndex : targetIndex + 1; newIndex = Math.max(0, Math.min(newIndex, currentAvailableLanguages.length));
        if (newIndex === droppedItemIndex || newIndex === droppedItemIndex + 1) { if (DEBUG) console.log('[LLM Options Drag] Dropped onto original position.'); return; }
        if (DEBUG) console.log(`[LLM Options Drag] Dropped index ${droppedItemIndex} onto target index ${targetIndex}. New index: ${newIndex}.`);
        const [draggedLanguage] = currentAvailableLanguages.splice(droppedItemIndex, 1); const insertionIndex = newIndex > droppedItemIndex ? newIndex - 1 : newIndex;
        currentAvailableLanguages.splice(insertionIndex, 0, draggedLanguage); if (DEBUG) console.log('[LLM Options Drag] Array after splice:', [...currentAvailableLanguages]);
        renderLanguageOptions();
    }
    function handleDragEnd(event) {
        const languageOptionElement = event.target.closest('.language-option'); if (languageOptionElement) { languageOptionElement.classList.remove('dragging'); }
        if (dragOverElement) { dragOverElement.classList.remove('drag-over-top', 'drag-over-bottom'); dragOverElement = null; }
        draggedItemIndex = null; if (DEBUG) console.log('[LLM Options Drag] Drag end.');
    }

    // --- Prompt Preview Function ---
    function updatePromptPreview() {
        if (DEBUG) console.log("Updating prompt preview...");
        let bulletCount = DEFAULT_BULLET_COUNT; document.querySelectorAll('input[name="bulletCount"]').forEach(radio => { if (radio.checked) bulletCount = radio.value; });
        const bulletWord = NUM_TO_WORD[bulletCount] || "five";
        if (promptPreambleDiv) promptPreambleDiv.textContent = DEFAULT_PREAMBLE_TEMPLATE.replace('${bulletWord}', bulletWord);
        if (promptPostambleDiv) promptPostambleDiv.textContent = DEFAULT_POSTAMBLE_TEXT;
        if (promptFormatInstructionsTextarea) promptFormatInstructionsTextarea.value = currentCustomFormatInstructions;
    }


    /** Loads settings and populates the form (MODIFIED) */
    async function loadSettings() {
        if (DEBUG) console.log("Loading settings...");
        statusMessage.textContent = 'Loading...'; statusMessage.className = 'status-message';

        try {
            // Fetch all data concurrently
            const [langDataResponse, modelsResponse, settingsResponse] = await Promise.all([
                new Promise(resolve => chrome.runtime.sendMessage({ action: "getLanguageData" }, resolve)),
                new Promise(resolve => chrome.runtime.sendMessage({ action: "getModelsList" }, resolve)),
                new Promise(resolve => chrome.runtime.sendMessage({ action: "getSettings" }, resolve))
            ]);

            // Process Language Data
            if (chrome.runtime.lastError || !langDataResponse?.ALL_LANGUAGE_NAMES_MAP) {
                console.error("Error fetching language data:", chrome.runtime.lastError || "Invalid response");
                statusMessage.textContent = `Error loading language list.`; statusMessage.className = 'status-message error';
                ALL_LANGUAGES_MAP = {}; ALL_LANGUAGE_NAMES_MAP = {}; SVG_PATH_PREFIX = ''; FALLBACK_SVG_PATH = '';
            } else {
                ALL_LANGUAGES_MAP = langDataResponse.ALL_LANGUAGES_MAP;
                ALL_LANGUAGE_NAMES_MAP = langDataResponse.ALL_LANGUAGE_NAMES_MAP;
                SVG_PATH_PREFIX = langDataResponse.SVG_PATH_PREFIX;
                FALLBACK_SVG_PATH = langDataResponse.FALLBACK_SVG_PATH;
                if (DEBUG) console.log(`Fetched ${Object.keys(ALL_LANGUAGE_NAMES_MAP).length} languages.`);
            }

            // Process Models List
            if (chrome.runtime.lastError || !modelsResponse?.models) {
                 console.error("Error fetching models list:", chrome.runtime.lastError || "Invalid response");
                 statusMessage.textContent = `Error loading models list. Using defaults.`; statusMessage.className = 'status-message error';
                 currentModels = [...DEFAULT_MODEL_OPTIONS];
            } else {
                 currentModels = modelsResponse.models;
                 if (DEBUG) console.log(`Fetched ${currentModels.length} models.`);
            }

            // Process Settings
            if (chrome.runtime.lastError || settingsResponse?.error) {
                console.error("Error loading settings:", chrome.runtime.lastError || settingsResponse?.error);
                statusMessage.textContent = `Error loading settings: ${chrome.runtime.lastError?.message || settingsResponse?.error}. Using defaults.`;
                statusMessage.className = 'status-message error';
                // Apply defaults manually
                if (apiKeyInput) apiKeyInput.value = '';
                if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE; DEBUG = DEFAULT_DEBUG_MODE;
                bulletCountRadios.forEach(radio => radio.checked = (radio.value === DEFAULT_BULLET_COUNT));
                currentSelectedModel = currentModels.length > 0 ? currentModels[0].id : '';
                currentAvailableLanguages = DEFAULT_PREPOPULATE_LANGUAGES.filter(name => findLanguageByName(name));
                currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
                if (promptFormatInstructionsTextarea) promptFormatInstructionsTextarea.value = currentCustomFormatInstructions;
            } else {
                // --- Populate UI using fetched settings ---
                const data = settingsResponse;

                // --- *** ADDED SANITIZATION HERE *** ---
                if (DEBUG) {
                    const settingsToLog = { ...data }; // Create copy
                    if (settingsToLog.apiKey) {
                        settingsToLog.apiKey = '[API Key Hidden]'; // Mask
                    }
                    console.log("Loaded settings from background:", settingsToLog); // Log sanitized copy
                }
                // --- *** END SANITIZATION *** ---

                DEBUG = !!data.debug;
                if (apiKeyInput) apiKeyInput.value = data.apiKey || '';
                if (debugCheckbox) debugCheckbox.checked = DEBUG;

                let countValue = data.bulletCount || DEFAULT_BULLET_COUNT;
                bulletCountRadios.forEach(radio => radio.checked = (radio.value === countValue));

                const storedSelectedModel = data.model ? data.model.trim() : '';
                const availableModelIds = currentModels.map(m => m.id);
                if (storedSelectedModel && availableModelIds.includes(storedSelectedModel)) { currentSelectedModel = storedSelectedModel; }
                else if (currentModels.length > 0) { currentSelectedModel = currentModels[0].id; }
                else { currentSelectedModel = ''; }

                currentAvailableLanguages = data.availableLanguages || [];
                if (currentAvailableLanguages.length === 0) { currentAvailableLanguages.push(""); }

                currentCustomFormatInstructions = data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] || DEFAULT_FORMAT_INSTRUCTIONS;
                if (promptFormatInstructionsTextarea) { promptFormatInstructionsTextarea.value = currentCustomFormatInstructions; }

                statusMessage.textContent = 'Options loaded.'; statusMessage.className = 'status-message success';
                setTimeout(() => { if (statusMessage) { statusMessage.textContent = ''; statusMessage.className = 'status-message'; } }, 1500);
            }

        } catch (error) {
            console.error("Error during settings loading process:", error);
            statusMessage.textContent = `Error: ${error.message}`; statusMessage.className = 'status-message error';
            // Apply defaults as a fallback
            if (apiKeyInput) apiKeyInput.value = ''; if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE; DEBUG = DEFAULT_DEBUG_MODE;
            bulletCountRadios.forEach(radio => radio.checked = (radio.value === DEFAULT_BULLET_COUNT));
            currentModels = [...DEFAULT_MODEL_OPTIONS]; currentSelectedModel = currentModels.length > 0 ? currentModels[0].id : '';
            currentAvailableLanguages = DEFAULT_PREPOPULATE_LANGUAGES.filter(name => findLanguageByName(name));
            currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS; if (promptFormatInstructionsTextarea) promptFormatInstructionsTextarea.value = currentCustomFormatInstructions;
        }

        // --- Render UI elements ---
        renderModelOptions();
        renderLanguageOptions();
        updatePromptPreview();
        if (DEBUG) console.log("Settings loaded and UI populated.");
    }


    /** Saves the current settings */
    function saveSettings() {
        if (DEBUG) console.log("Saving settings...");
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        const debug = debugCheckbox ? debugCheckbox.checked : false;
        let bulletCount = DEFAULT_BULLET_COUNT; document.querySelectorAll('input[name="bulletCount"]').forEach(radio => { if (radio.checked) bulletCount = radio.value; });
        const customFormatInstructionsToSave = promptFormatInstructionsTextarea ? promptFormatInstructionsTextarea.value : currentCustomFormatInstructions;
        currentCustomFormatInstructions = customFormatInstructionsToSave;

        // Save models as array of IDs only
        const modelsToSave = currentModels.filter(m => m.id.trim() !== '').map(m => m.id);

        let finalSelectedModel = '';
        if (currentSelectedModel && modelsToSave.includes(currentSelectedModel)) { finalSelectedModel = currentSelectedModel; }
        else if (modelsToSave.length > 0) { finalSelectedModel = modelsToSave[0]; }
        else { finalSelectedModel = ''; }

        const languageInputs = languageSelectionArea.querySelectorAll('.language-option input[type="text"]');
        const languagesToSave = Array.from(languageInputs).map(input => input.value.trim()).filter(lang => lang !== '' && findLanguageByName(lang));
        currentAvailableLanguages = languagesToSave;

        const settingsToSave = {
            apiKey, model: finalSelectedModel, models: modelsToSave,
            debug, bulletCount, availableLanguages: languagesToSave,
            [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]: customFormatInstructionsToSave,
            [PROMPT_STORAGE_KEY_PREAMBLE]: DEFAULT_PREAMBLE_TEMPLATE,
            [PROMPT_STORAGE_KEY_POSTAMBLE]: DEFAULT_POSTAMBLE_TEXT,
            [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]: DEFAULT_FORMAT_INSTRUCTIONS
        };

        // --- *** ADDED SANITIZATION FOR LOGGING *** ---
        if (DEBUG) {
            const settingsToLog = { ...settingsToSave };
            if (settingsToLog.apiKey) settingsToLog.apiKey = '[API Key Hidden]';
            console.log("Saving data:", settingsToLog);
        }
        // --- *** END SANITIZATION *** ---

        chrome.storage.sync.set(settingsToSave, () => {
            if (chrome.runtime.lastError) { statusMessage.textContent = `Error saving: ${chrome.runtime.lastError.message}`; statusMessage.className = 'status-message error'; console.error("Error saving settings:", chrome.runtime.lastError); }
            else {
                 statusMessage.textContent = 'Options saved!'; statusMessage.className = 'status-message success'; if (DEBUG) console.log("Options saved successfully.");
                 renderModelOptions(); renderLanguageOptions(); updatePromptPreview(); // Re-render after save
            }
            setTimeout(() => { if (statusMessage) { statusMessage.textContent = ''; statusMessage.className = 'status-message'; } }, 2000);
        });
     }

    /** Resets settings to defaults */
    function resetToDefaults() {
        if (DEBUG) console.log("Resetting options to defaults (excluding API key)...");
        currentModels = [...DEFAULT_MODEL_OPTIONS]; currentSelectedModel = currentModels.length > 0 ? currentModels[0].id : '';
        currentAvailableLanguages = DEFAULT_PREPOPULATE_LANGUAGES.filter(name => findLanguageByName(name));
        if (currentAvailableLanguages.length === 0) { currentAvailableLanguages.push(""); }
        currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
        renderModelOptions(); renderLanguageOptions();
        bulletCountRadios.forEach(radio => { radio.checked = (radio.value === DEFAULT_BULLET_COUNT); });
        if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
        if (promptFormatInstructionsTextarea) { promptFormatInstructionsTextarea.value = currentCustomFormatInstructions; }
        updatePromptPreview();
        saveSettings(); // Save the reset state
        if (statusMessage) { statusMessage.textContent = 'Defaults Reset & Saved!'; statusMessage.className = 'status-message success'; setTimeout(() => { statusMessage.textContent = ''; statusMessage.className = 'status-message'; }, 2500); }
    }

    // --- Collapsible Section Logic ---
    function setupCollapsible() {
        if (!advancedOptionsToggle || !advancedOptionsContent) { if (DEBUG) console.warn("Collapsible elements not found."); return; }
        const toggleIndicator = advancedOptionsToggle.querySelector('.toggle-indicator');
        const toggleSection = () => {
            const isExpanded = advancedOptionsToggle.getAttribute('aria-expanded') === 'true';
            advancedOptionsToggle.setAttribute('aria-expanded', !isExpanded); advancedOptionsContent.classList.toggle('active');
            if (toggleIndicator) { toggleIndicator.textContent = isExpanded ? '►' : '▼'; }
            if (!isExpanded) { setTimeout(() => { advancedOptionsToggle.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100); } // Adjusted block property
        };
        advancedOptionsToggle.addEventListener('click', toggleSection);
        advancedOptionsToggle.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSection(); } });
        advancedOptionsContent.classList.remove('active'); advancedOptionsToggle.setAttribute('aria-expanded', 'false'); if (toggleIndicator) { toggleIndicator.textContent = '►'; }
    }


    // --- Event Listeners ---
    if (saveButton) saveButton.addEventListener('click', saveSettings);
    if (addModelBtn) addModelBtn.addEventListener('click', addModel);
    if (addLangBtn) addLangBtn.addEventListener('click', addLanguage);
    if (resetButton) resetButton.addEventListener('click', () => { if (confirm("Are you sure you want to reset all options (except API key) to their defaults? This will also reset the prompt customization.")) { resetToDefaults(); } });
    bulletCountRadios.forEach(radio => { radio.addEventListener('change', updatePromptPreview); });
    if (promptFormatInstructionsTextarea) { promptFormatInstructionsTextarea.addEventListener('input', (event) => { currentCustomFormatInstructions = event.target.value; }); }
    document.addEventListener('click', handleGlobalClick);


    // --- Initial Load & Setup ---
    await loadSettings();
    setupCollapsible();

}); // End DOMContentLoaded
