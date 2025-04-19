// options.js
// v2.11

import {
    PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
    PROMPT_STORAGE_KEY_PREAMBLE,
    PROMPT_STORAGE_KEY_POSTAMBLE,
    PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
    DEFAULT_PREAMBLE_TEMPLATE,
    DEFAULT_POSTAMBLE_TEXT,
    DEFAULT_FORMAT_INSTRUCTIONS,
    DEFAULT_MODEL_OPTIONS, // Import default models
    DEFAULT_PREPOPULATE_LANGUAGES, // Import default languages list
    SVG_PATH_PREFIX, // Import SVG path prefix
    FALLBACK_SVG_PATH // Import fallback SVG path
} from './constants.js'; // Import constants from the new file

document.addEventListener('DOMContentLoaded', async () => { // Made async to await language data load
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
    // Prompt Elements
    const promptPreambleDiv = document.getElementById('promptPreamble');
    const promptFormatInstructionsTextarea = document.getElementById('promptFormatInstructions');
    // Removed promptTranslationPreviewDiv
    const promptPostambleDiv = document.getElementById('promptPostamble');
    // Collapsible Section Elements
    const advancedOptionsToggle = document.getElementById('advancedOptionsToggle');
    const advancedOptionsContent = document.getElementById('advancedOptionsContent');


    // --- Constants ---
    const DEFAULT_BULLET_COUNT = "5";
    // Removed: DEFAULT_MODELS and DEFAULT_SELECTED_MODEL (now imported from constants.js)
    // Removed: DEFAULT_PREPOPULATE_LANGUAGES (now imported from constants.js)

    // Removed: New Constants for Language Data (now imported from constants.js)
    // Removed: SVG_PATH_PREFIX and FALLBACK_SVG_PATH (now imported from constants.js)

    // --- FIX: Define LANGUAGE_FLAG_CLASS ---
    const LANGUAGE_FLAG_CLASS = 'language-flag';
    // --- END FIX ---

    // --- Data Storage for Languages (Removed local storage) ---
    // Will store { LanguageName: CountryCode, ... }
    let ALL_LANGUAGES_MAP = {}; // This will now be populated from background.js
    // Will store [{ code: CountryCode, name: LanguageName }, ...]
    let ALL_LANGUAGES_ARRAY = []; // This will now be populated from background.js
    // Map for quick lookup from lowercase name to {code, original name}
    let ALL_LANGUAGE_NAMES_MAP = {}; // This will now be populated from background.js


    // --- FIX: Define DEBUG at the top level ---
    let DEBUG = false; // Default to false
    // --- END FIX ---

    const DEFAULT_DEBUG_MODE = false; // This is just the default value for the setting
    const NUM_TO_WORD = { 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };

    // --- Centralized Prompt Definitions (Removed local definitions) ---
    // Now imported from constants.js
    // --- End Centralized Prompt Definitions ---


    // --- State Variables ---
    let currentModels = []; // Will store {id, label} objects fetched from background
    let currentSelectedModel = ''; // This will store the ID of the selected model
    // currentAvailableLanguages will store just the names of selected languages
    let currentAvailableLanguages = [];
    let currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS; // Tracks the value in the textarea

    // --- Autocomplete State ---
    let activeAutocompleteInput = null;
    let autocompleteDropdown = null;
    let highlightedAutocompleteIndex = -1;

    // --- Drag and Drop State ---
    let draggedItemIndex = null;
    let dragOverElement = null; // Element currently being dragged over


    // --- Functions ---

    // --- Model Selection Functions (Modified to handle {id, label} and use fetched list) ---
    function renderModelOptions() {
        if (!modelSelectionArea) return;
        modelSelectionArea.innerHTML = '';
        if (!currentModels || currentModels.length === 0) {
            modelSelectionArea.innerHTML = '<p>No models configured. Add one below or save to use defaults.</p>';
            // Disable add button if no models are available at all
            if (addModelBtn) addModelBtn.disabled = true;
            return;
        } else {
             if (addModelBtn) addModelBtn.disabled = false;
        }

        // Ensure currentSelectedModel (ID) is still in the list of fetched models
        const availableModelIds = currentModels.map(m => m.id);
        if (!currentSelectedModel || !availableModelIds.includes(currentSelectedModel)) {
             if (DEBUG) console.warn(`Selected model ID "${currentSelectedModel}" not in fetched list, defaulting to "${currentModels[0].id}" for render.`);
             currentSelectedModel = currentModels.length > 0 ? currentModels[0].id : '';
        } else if (currentModels.length === 0) {
             currentSelectedModel = '';
        }

        currentModels.forEach((model, index) => { // model is now {id, label}
            const isChecked = (model.id === currentSelectedModel && model.id.trim() !== '');
            const group = document.createElement('div'); group.className = 'option-group model-option';
            const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'selectedModelOption';
            radio.id = `modelRadio_${index}`; radio.value = model.id; radio.checked = isChecked; radio.dataset.index = index;
            radio.disabled = !model.id.trim(); // Disable radio if ID is empty
            radio.addEventListener('change', handleModelRadioChange);

            const textInput = document.createElement('input'); textInput.type = 'text'; textInput.id = `modelText_${index}`;
            textInput.value = model.id; // Use the ID for the input value
            textInput.placeholder = "Enter OpenRouter Model ID"; textInput.dataset.index = index;
            textInput.addEventListener('input', handleModelTextChange);

            const labelInput = document.createElement('input'); labelInput.type = 'text'; labelInput.id = `modelLabel_${index}`;
            labelInput.value = model.label || model.id; // Use the label for the label input
            labelInput.placeholder = "Enter Model Label (Optional)"; labelInput.dataset.index = index;
            labelInput.addEventListener('input', handleModelLabelChange);


            const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.textContent = '✕';
            removeBtn.className = 'button remove-button'; removeBtn.title = 'Remove this model'; removeBtn.dataset.index = index;
            removeBtn.addEventListener('click', handleModelRemoveClick);

            group.appendChild(radio);
            group.appendChild(textInput);
            group.appendChild(labelInput); // Add label input
            group.appendChild(removeBtn);
            modelSelectionArea.appendChild(group);
        });
    }

    function handleModelRadioChange(event) {
        if (event.target.checked) {
            const index = parseInt(event.target.dataset.index, 10);
            // Find the corresponding model object in currentModels by index
            const selectedModel = currentModels[index];
            if (selectedModel && selectedModel.id.trim()) {
                currentSelectedModel = selectedModel.id.trim();
                if (DEBUG) console.log("Selected model ID changed to:", currentSelectedModel);
            } else {
                // If the selected model ID is empty, uncheck it and try to revert
                event.target.checked = false;
                const previousValidRadio = modelSelectionArea.querySelector(`input[type="radio"][value="${currentSelectedModel}"]:not(:disabled)`);
                if (previousValidRadio) {
                    previousValidRadio.checked = true;
                } else {
                    // Try selecting the first valid one in the current list
                    const firstValidModel = currentModels.find(m => m.id.trim() !== '');
                    if (firstValidModel) {
                         const firstValidRadio = modelSelectionArea.querySelector(`input[type="radio"][value="${firstValidModel.id}"]`);
                         if (firstValidRadio) {
                            firstValidRadio.checked = true;
                            currentSelectedModel = firstValidModel.id;
                         } else {
                             currentSelectedModel = ''; // Should not happen if firstValidModel exists
                         }
                    } else {
                        currentSelectedModel = ''; // No valid models left
                    }
                }
                 if (DEBUG) console.log("Selected model ID adjusted after radio change:", currentSelectedModel);
            }
        }
     }

    function handleModelTextChange(event) {
        const newModelId = event.target.value.trim();
        const idx = parseInt(event.target.dataset.index, 10);

        if (idx >= 0 && idx < currentModels.length) {
             // Update the ID in the currentModels array
             currentModels[idx].id = newModelId;
             // If the label input is empty, update its value to the new ID
             const labelInput = document.getElementById(`modelLabel_${idx}`);
             if (labelInput && !labelInput.value.trim()) {
                 labelInput.value = newModelId;
                 currentModels[idx].label = newModelId; // Update label in state too
             }
        } else {
             console.error("handleModelTextChange called with invalid index:", idx);
             return;
        }

        const associatedRadio = document.getElementById(`modelRadio_${idx}`);
        if (associatedRadio) {
            associatedRadio.value = newModelId; // Update radio value to the new ID
            associatedRadio.disabled = !newModelId; // Disable radio if input is empty

            // If this was the selected model and input became empty, re-select a new default
            if (associatedRadio.checked) {
                 if (!newModelId) {
                    associatedRadio.checked = false;
                    currentSelectedModel = ''; // Clear selected if empty

                    // Attempt to select the first valid model in the updated list
                    const firstValidModel = currentModels.find(m => m.id.trim() !== '');
                    if (firstValidModel) {
                         const firstValidRadio = modelSelectionArea.querySelector(`input[type="radio"][value="${firstValidModel.id}"]`);
                         if (firstValidRadio) {
                            firstValidRadio.checked = true;
                            currentSelectedModel = firstValidModel.id;
                         }
                    }
                 } else {
                    currentSelectedModel = newModelId; // Update selected model ID if input changed and it's still checked
                 }
                 if (DEBUG) console.log("Selected model ID updated via text input to:", currentSelectedModel);
            }
        }
     }

     function handleModelLabelChange(event) {
         const newModelLabel = event.target.value.trim();
         const idx = parseInt(event.target.dataset.index, 10);

         if (idx >= 0 && idx < currentModels.length) {
              // Update the label in the currentModels array
              currentModels[idx].label = newModelLabel;
         } else {
              console.error("handleModelLabelChange called with invalid index:", idx);
         }
     }

    function handleModelRemoveClick(event) { removeModel(parseInt(event.target.dataset.index, 10)); }

    // Add a new empty model input field ({id: "", label: ""})
    function addModel() {
        currentModels.push({ id: "", label: "" });
        renderModelOptions(); // Re-render the whole list
        // Find the new ID input element and focus it
        const newIndex = currentModels.length - 1;
        const newInput = document.getElementById(`modelText_${newIndex}`);
        if (newInput) {
             newInput.focus();
        }
     }

    // Removes a model input field
    function removeModel(indexToRemove) {
        if (indexToRemove < 0 || indexToRemove >= currentModels.length) return;

        const removedModelId = currentModels[indexToRemove].id;
        currentModels.splice(indexToRemove, 1); // Remove the object from the array

        // If the removed model was the selected one, find a new selection
        if (removedModelId === currentSelectedModel) {
            const firstValidModel = currentModels.find(m => m.id.trim() !== '');
            currentSelectedModel = firstValidModel ? firstValidModel.id : '';
        }
        renderModelOptions(); // Re-render the whole list
     }
    // --- End Model Selection Functions ---


    // --- Language Selection & Autocomplete Functions (Modified to use fetched data) ---

    // Removed local loadLanguageData function

    // Filters languages from the loaded data based on the query matching the name
    function filterLanguages(query) {
        const lowerQuery = query.toLowerCase().trim();
        if (!lowerQuery) return []; // Don't show suggestions for empty input

        // Filter the array based on name containing the query
        return ALL_LANGUAGES_ARRAY.filter(lang =>
            lang.name.toLowerCase().includes(lowerQuery)
        );
    }

    // Finds a language object ({code, name}) by its name (case-insensitive, trims whitespace)
    // Returns undefined if not found
    function findLanguageByName(name) {
        if (!name || typeof name !== 'string') return undefined;
        const cleanName = name.trim().toLowerCase();
        // Now look up the lowercase name in the correctly built map
        const languageData = ALL_LANGUAGE_NAMES_MAP[cleanName];
        if (languageData) {
            return languageData; // Returns { code: CountryCode, name: OriginalLanguageName }
        }
         return undefined;
    }


    // Shows the autocomplete dropdown with language suggestions
    function showAutocompleteSuggestions(inputElement, suggestions) {
        if (!autocompleteDropdown) {
            autocompleteDropdown = document.createElement('div');
            autocompleteDropdown.className = 'autocomplete-dropdown';
            document.body.appendChild(autocompleteDropdown);
            // Add a global click listener only once
            document.addEventListener('click', handleGlobalClick);
             // Add mousedown listener to dropdown to prevent blur when clicking on suggestions
             autocompleteDropdown.addEventListener('mousedown', (event) => {
                 event.preventDefault(); // Prevent blur on the input
             });
        }

        autocompleteDropdown.innerHTML = '';
        highlightedAutocompleteIndex = -1; // Reset highlight

        if (suggestions.length === 0) {
            autocompleteDropdown.style.display = 'none';
            return;
        }

        suggestions.forEach((lang, index) => { // 'lang' is now {code, name}
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.dataset.index = index;
            item.dataset.languageCode = lang.code; // Store code for easy access
            item.dataset.languageName = lang.name; // Store name
            // Use <img> for SVG flag - Note: This assumes language codes map to country flags.
            // This might not be accurate for all languages (e.g., "English" vs "US" flag).
            // For now, we'll use the language code as the flag filename.
            const flagImg = document.createElement('img');
            flagImg.className = LANGUAGE_FLAG_CLASS; // Use language-flag class name from options for consistency
            flagImg.src = `${SVG_PATH_PREFIX}${lang.code.toLowerCase()}.svg`;
            flagImg.alt = `${lang.name} flag`;
            flagImg.onerror = function() { // Handle missing SVG
                this.src = FALLBACK_SVG_PATH;
                 this.alt = 'Flag not found'; // Update alt text
                 if (DEBUG) console.warn(`Missing SVG for code: ${lang.code}`);
            };

            const nameSpan = document.createElement('span');
            nameSpan.textContent = lang.name;
            nameSpan.className = 'language-name'; // Class for the name text

            item.appendChild(flagImg);
            item.appendChild(nameSpan);

            item.addEventListener('click', () => {
                selectAutocompleteSuggestion(item, inputElement);
            });
            autocompleteDropdown.appendChild(item);
        });

        // Position the dropdown below the input field
        const rect = inputElement.closest('.language-input-wrapper').getBoundingClientRect(); // Position relative to the wrapper/label
        autocompleteDropdown.style.position = 'absolute';
        autocompleteDropdown.style.top = `${rect.bottom + window.scrollY + 4}px`; // 4px margin below input
        autocompleteDropdown.style.left = `${rect.left + window.scrollX}px`;
        autocompleteDropdown.style.width = `${rect.width}px`; // Match input wrapper width
        autocompleteDropdown.style.display = 'block';

        activeAutocompleteInput = inputElement; // Keep track of which input owns the dropdown
    }

    // Hides the autocomplete dropdown
    function hideAutocompleteSuggestions() {
        if (autocompleteDropdown) {
            autocompleteDropdown.style.display = 'none';
            highlightedAutocompleteIndex = -1;
            const currentHighlighted = autocompleteDropdown.querySelector('.autocomplete-item.selected');
            if (currentHighlighted) {
                currentHighlighted.classList.remove('selected');
            }
        }
        activeAutocompleteInput = null;
    }

    // Selects a highlighted or clicked suggestion
    function selectAutocompleteSuggestion(itemElement, inputElement) {
        if (!itemElement || !inputElement) return;

        const languageName = itemElement.dataset.languageName;
        const languageCode = itemElement.dataset.languageCode;

        inputElement.value = languageName; // Put the full language name into the input

        // Manually update the flag next to the input
        const flagImg = inputElement.parentElement ? inputElement.parentElement.querySelector('.language-flag') : null;
        if (flagImg && languageCode) { // Ensure flagImg exists and we have a code
            flagImg.src = `${SVG_PATH_PREFIX}${languageCode.toLowerCase()}.svg`;
             flagImg.alt = `${languageName} flag`;
             flagImg.onerror = function() { // Handle missing SVG after selection
                 this.src = FALLBACK_SVG_PATH;
                 this.alt = 'Flag not found';
                 if (DEBUG) console.warn(`Missing SVG for code: ${languageCode} (after selection)`);
             };
        } else if (flagImg) { // If no language code (shouldn't happen with valid selection), show fallback
             flagImg.src = FALLBACK_SVG_PATH;
             flagImg.alt = 'Flag not found';
             if (DEBUG) console.warn(`No language code found for selected item: ${languageName}`);
        }


        // Trigger an input event to update the underlying data array (currentAvailableLanguages)
        // and potentially update the selected language and prompt preview
        const event = new Event('input', { bubbles: true });
        inputElement.dispatchEvent(event);

        hideAutocompleteSuggestions();
    }

    // Handles keyboard navigation in the dropdown (mostly unchanged, works on .autocomplete-item)
    function handleAutocompleteKeydown(event) {
        if (!autocompleteDropdown || autocompleteDropdown.style.display === 'none') return;

        const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
        if (items.length === 0) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault(); // Prevent cursor movement in input
            highlightedAutocompleteIndex = (highlightedAutocompleteIndex + 1) % items.length;
            updateAutocompleteHighlight(items);
             items[highlightedAutocompleteIndex].scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'ArrowUp') {
            event.preventDefault(); // Prevent cursor movement in input
            highlightedAutocompleteIndex = (highlightedAutocompleteIndex - 1 + items.length) % items.length;
            updateAutocompleteHighlight(items);
             items[highlightedAutocompleteIndex].scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter') {
            if (highlightedAutocompleteIndex > -1 && activeAutocompleteInput) {
                event.preventDefault(); // Prevent form submission
                selectAutocompleteSuggestion(items[highlightedAutocompleteIndex], activeAutocompleteInput);
            }
        } else if (event.key === 'Escape') {
            hideAutocompleteSuggestions();
            event.preventDefault();
        }
    }

    // Updates the 'selected' class for keyboard highlighting (unchanged)
    function updateAutocompleteHighlight(items) {
        items.forEach((item, index) => {
            if (index === highlightedAutocompleteIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

     // Global click handler to hide dropdown when clicking outside it or the input wrapper
    function handleGlobalClick(event) {
        // Check if the click was inside the active input's wrapper or the dropdown itself
        // Using closest('.language-input-wrapper') because the click might be on the flag or input within the label
        const clickedInsideInputWrapper = activeAutocompleteInput ? activeAutocompleteInput.closest('.language-input-wrapper').contains(event.target) : false;

        if (activeAutocompleteInput && (clickedInsideInputWrapper || (autocompleteDropdown && autocompleteDropdown.contains(event.target)))) {
             return; // Do nothing if clicking inside the active elements
        }
         // Hide the dropdown if clicking anywhere else
         hideAutocompleteSuggestions();
    }


    // Sets up autocomplete on a given language input element
    function setupAutocomplete(inputElement) {
        inputElement.addEventListener('input', (event) => {
            const query = event.target.value;
            // Filter languages (by name)
            const suggestions = filterLanguages(query);
            if (query.length > 0 && suggestions.length > 0) {
                showAutocompleteSuggestions(event.target, suggestions);
            } else {
                hideAutocompleteSuggestions();
            }
             // Always handle the flag update whenever the input changes
             handleLanguageTextChange(event); // This is already attached via addEventListener below
        });

        inputElement.addEventListener('focus', (event) => {
             // On focus, show suggestions if there's already text
             const query = event.target.value;
             if (query.length > 0) {
                 const suggestions = filterLanguages(query);
                 if (suggestions.length > 0) {
                     showAutocompleteSuggestions(event.target, suggestions);
                 } else {
                     hideAutocompleteSuggestions(); // No suggestions for current text
                 }
             }
        });

        inputElement.addEventListener('blur', () => {
             // Note: The mousedown listener on the dropdown prevents blur if clicking an item.
             // This blur handler will hide the dropdown if clicking anywhere else.
             // Use a timeout if there are issues with blur/click timing on suggestions,
             // but preventing default on mousedown is usually sufficient.
             // setTimeout(hideAutocompleteSuggestions, 100); // Example with timeout
             hideAutocompleteSuggestions();
        });

        inputElement.addEventListener('keydown', handleAutocompleteKeydown);
    }


    // Renders the list of available languages in the options UI
    function renderLanguageOptions() {
        // --- ADDED LOG HERE ---
        if (DEBUG) console.log('[LLM Options Render] renderLanguageOptions called. Current languages:', [...currentAvailableLanguages]);
        // --- END ADDED LOG ---

        if (!languageSelectionArea) return;
        languageSelectionArea.innerHTML = ''; // Clear existing options

        // Add current available languages
        currentAvailableLanguages.forEach((langName, index) => { // langName is the language name here
            const group = document.createElement('div');
            group.className = 'option-group language-option';
            group.dataset.index = index; // Store index for drag/drop
            // group.draggable = true; // Make the group draggable - MOVED TO GRAB HANDLE

            // --- Create Grab Handle ---
            const grabHandle = document.createElement('div');
            grabHandle.className = 'grab-handle';
            grabHandle.draggable = true; // Make the handle draggable
            grabHandle.title = 'Drag to reorder'; // Tooltip
            grabHandle.setAttribute('aria-label', 'Drag to reorder language'); // Accessibility
            grabHandle.setAttribute('role', 'button'); // Indicate it's interactive
            grabHandle.setAttribute('tabindex', '0'); // Make it focusable

            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'grab-handle-dots';
            for (let i = 0; i < 3; i++) { // Create 3 dots
                 const dot = document.createElement('div');
                 dot.className = 'grab-handle-dot';
                 dotsContainer.appendChild(dot);
            }
            grabHandle.appendChild(dotsContainer);

            // Add dragstart and dragend event listeners to the GRAB HANDLE
            grabHandle.addEventListener('dragstart', handleDragStart);
            grabHandle.addEventListener('dragend', handleDragEnd);
            // --- End Grab Handle ---


            // Removed radio button creation

            const label = document.createElement('label');
            // Removed label 'for' attribute as there's no radio
            label.className = 'language-input-wrapper';


            // Use <img> for the flag - Note: This assumes language codes map to country flags.
            // We need to find the language code from the name to get the flag filename.
            const flagImg = document.createElement('img');
            flagImg.className = LANGUAGE_FLAG_CLASS; // Use language-flag class
            const languageData = findLanguageByName(langName); // Find the code for the name using loaded data
            const languageCode = languageData ? languageData.code : null;
            if (languageCode) {
                flagImg.src = `${SVG_PATH_PREFIX}${languageCode.toLowerCase()}.svg`;
                flagImg.alt = `${langName} flag`; // Use the found language name for alt
                flagImg.onerror = function() { // Handle missing SVG on render
                    this.src = FALLBACK_SVG_PATH; // Or hide: this.style.display = 'none';
                    this.alt = 'Flag not found'; // Update alt text
                     if (DEBUG) console.warn(`Missing SVG for code: ${languageCode} (on render)`);
                };
            } else {
                // If language name not found in data, show placeholder
                flagImg.src = FALLBACK_SVG_PATH;
                flagImg.alt = 'Flag not found';
                // flagImg.style.display = 'none'; // Alternatively, hide the flag
                 if (langName.trim().length > 0) { // Changed condition here
                    if (DEBUG) console.warn(`Language name "${langName}" not found in loaded data during render.`);
                 }
            }


            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.id = `langText_${index}`;
            textInput.value = langName;
            textInput.placeholder = "Enter Language Name"; // Updated placeholder
            textInput.dataset.index = index;
            textInput.setAttribute('autocomplete', 'off');

            // Attach input event listener directly for data updates and flag change
            textInput.addEventListener('input', handleLanguageTextChange);


            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = '✕';
            removeBtn.className = 'button remove-button';
            removeBtn.title = 'Remove this language';
            removeBtn.dataset.index = index;
            removeBtn.addEventListener('click', handleLanguageRemoveClick);

            label.appendChild(flagImg); // Append img instead of span
            label.appendChild(textInput);

            // Removed appending radio
            group.appendChild(grabHandle); // Add the grab handle first
            group.appendChild(label);
            group.appendChild(removeBtn);

            // --- ADD dragover, dragleave, drop listeners to the GROUP (language-option) ---
            group.addEventListener('dragover', handleDragOver);
            group.addEventListener('dragleave', handleDragLeave);
            group.addEventListener('drop', handleDrop);
            // --- END ADD ---


            languageSelectionArea.appendChild(group);

            // Set up autocomplete for this specific input field
            setupAutocomplete(textInput);
        });
     }

    // Removed handleLanguageRadioChange function

    // Handles input event on language text fields (typing or selection)
    function handleLanguageTextChange(event) {
        const newLangName = event.target.value; // Get raw value (don't trim yet for autocomplete filter)
        const idx = parseInt(event.target.dataset.index, 10);

        // Update the array of available languages (language names) with the raw value
        if (idx >= 0 && idx < currentAvailableLanguages.length) {
            currentAvailableLanguages[idx] = newLangName.trim(); // Store trimmed name in array
        } else {
             console.error("handleLanguageTextChange called with invalid index:", idx);
             return;
        }

        // Find and update the associated flag img
        const flagImg = event.target.parentElement ? event.target.parentElement.querySelector('.language-flag') : null;
        if (flagImg) {
            const languageData = findLanguageByName(newLangName); // Find using potentially untrimmed/partial name for flag preview while typing
            const languageCode = languageData ? languageData.code : null;

            if (languageCode) {
                flagImg.src = `${SVG_PATH_PREFIX}${languageCode.toLowerCase()}.svg`;
                flagImg.alt = `${languageData.name} flag`; // Use the found language name for alt
                flagImg.style.display = ''; // Ensure flag is visible
                flagImg.onerror = function() {
                     this.src = FALLBACK_SVG_PATH;
                     this.alt = 'Flag not found';
                     if (DEBUG) console.warn(`Missing SVG for code: ${languageCode} (on text input change)`);
                };
            } else {
                // If language name not found, show placeholder or hide flag
                flagImg.src = FALLBACK_SVG_PATH; // Show placeholder
                flagImg.alt = 'Flag not found';
                // flagImg.style.display = 'none'; // Alternatively, hide the flag
                // Removed the console.warn here as it's expected during typing
            }
        }

        // Removed all logic related to associatedRadio
     }


    // Handles click on language remove button
    function handleLanguageRemoveClick(event) { removeLanguage(parseInt(event.target.dataset.index, 10)); }

    // Adds a new empty language input field
    function addLanguage() {
        currentAvailableLanguages.push(""); // Add an empty string to the array
        renderLanguageOptions(); // Re-render the whole list
        // Find the new input element and focus it
        const newIndex = currentAvailableLanguages.length - 1;
        const newInput = document.getElementById(`langText_${newIndex}`);
        if (newInput) {
             newInput.focus();
        }
     }

    // Removes a language input field
    function removeLanguage(indexToRemove) {
        if (indexToRemove < 0 || indexToRemove >= currentAvailableLanguages.length) return;

        // Removed check if removed language was the selected one

        currentAvailableLanguages.splice(indexToRemove, 1); // Remove from the array

        renderLanguageOptions(); // Re-render the whole list
        // Removed updatePromptPreview call here
     }
    // --- End Language Selection & Autocomplete Functions ---

    // --- Drag and Drop Handlers ---

    function handleDragStart(event) {
        // event.target is the grab-handle div
        const languageOptionElement = event.target.closest('.language-option'); // Get the parent language option div
        if (!languageOptionElement) {
             if (DEBUG) console.warn('[LLM Options Drag] Drag start failed: Could not find parent language option.');
             event.preventDefault(); // Prevent drag if parent not found
             return;
        }

        // Set the data to be transferred - in this case, the index of the dragged item
        draggedItemIndex = parseInt(languageOptionElement.dataset.index, 10);
        event.dataTransfer.setData('text/plain', draggedItemIndex);
        event.dataTransfer.effectAllowed = 'move';

        // Add a class to the dragged item for styling
        languageOptionElement.classList.add('dragging');

        if (DEBUG) console.log('[LLM Options Drag] Drag start for index:', draggedItemIndex);
    }

    function handleDragOver(event) {
        event.preventDefault(); // Necessary to allow dropping

        // event.target could be the grab handle, label, input, flag, or remove button *within the target language-option*
        const targetElement = event.target.closest('.language-option'); // Find the closest draggable language option

        if (!targetElement || targetElement.classList.contains('dragging')) {
            // If not dragging over a language option or dragging over itself, remove highlight
            if (dragOverElement) {
                dragOverElement.classList.remove('drag-over-top', 'drag-over-bottom');
                dragOverElement = null;
            }
            return;
        }

        // Determine if dragging over the top or bottom half of the target element
        const rect = targetElement.getBoundingClientRect();
        const mouseY = event.clientY;
        const midpoint = rect.top + rect.height / 2;

        // Remove highlight from the previous dragOverElement if it's different
        if (dragOverElement && dragOverElement !== targetElement) {
            dragOverElement.classList.remove('drag-over-top', 'drag-over-bottom');
        }

        // Add highlight to the current target element
        if (mouseY < midpoint) {
            targetElement.classList.add('drag-over-top');
            targetElement.classList.remove('drag-over-bottom');
        } else {
            targetElement.classList.add('drag-over-bottom');
            targetElement.classList.remove('drag-over-top');
        }
        dragOverElement = targetElement; // Update the element being dragged over
        event.dataTransfer.dropEffect = 'move'; // Set drop effect here
    }

    function handleDragLeave(event) {
        // Check if the mouse is leaving the element and not entering a child element
        // Use closest('.language-option') to check if the relatedTarget is still within the same list item
        if (event.relatedTarget && event.relatedTarget.closest('.language-option') === event.target.closest('.language-option')) {
            return; // Still inside the same language option or its children
        }
        // If leaving the language option entirely, remove highlight
        if (dragOverElement) {
            dragOverElement.classList.remove('drag-over-top', 'drag-over-bottom');
            dragOverElement = null;
        }
    }

    function handleDrop(event) {
        event.preventDefault(); // Prevent default drop behavior

        if (dragOverElement) {
            dragOverElement.classList.remove('drag-over-top', 'drag-over-bottom');
            dragOverElement = null;
        }

        const droppedItemIndex = parseInt(event.dataTransfer.getData('text/plain'), 10);
        // event.target could be the grab handle, label, input, flag, or remove button *within the target language-option*
        const targetElement = event.target.closest('.language-option'); // Find the closest language option

        if (!targetElement || droppedItemIndex === null || droppedItemIndex === undefined) {
            if (DEBUG) console.warn('[LLM Options Drag] Drop failed: Invalid target or dragged item index.');
            return; // Invalid drop target or data
        }

        const targetIndex = parseInt(targetElement.dataset.index, 10);
        const rect = targetElement.getBoundingClientRect();
        const mouseY = event.clientY;
        const midpoint = rect.top + rect.height / 2;

        let newIndex = targetIndex;
        // If dropping onto the bottom half, the new index is after the target
        if (mouseY >= midpoint) {
            newIndex = targetIndex + 1;
        }

        // Ensure newIndex is within bounds
        newIndex = Math.max(0, Math.min(newIndex, currentAvailableLanguages.length));

        // Prevent dropping onto the original position
        // If newIndex is the same as the original index, or if newIndex is one greater than
        // the original index (which happens when dropping onto the bottom half of the original element)
        if (newIndex === droppedItemIndex || (newIndex === droppedItemIndex + 1 && newIndex <= currentAvailableLanguages.length)) {
             if (DEBUG) console.log('[LLM Options Drag] Dropped onto original position, no change.');
             return;
        }

        if (DEBUG) console.log(`[LLM Options Drag] Dropped index ${droppedItemIndex} onto target index ${targetIndex}. Calculated new index: ${newIndex}.`);
        if (DEBUG) console.log('[LLM Options Drag] Array before splice:', [...currentAvailableLanguages]);

        // Perform the reordering in the currentAvailableLanguages array
        const [draggedLanguage] = currentAvailableLanguages.splice(droppedItemIndex, 1);

        // Adjust the insertion index if the item was moved from a lower index to a higher index
        const insertionIndex = newIndex > droppedItemIndex ? newIndex - 1 : newIndex;

        currentAvailableLanguages.splice(insertionIndex, 0, draggedLanguage);

        if (DEBUG) console.log('[LLM Options Drag] Array after splice:', [...currentAvailableLanguages]);

        // Re-render the list to reflect the new order
        renderLanguageOptions(); // <--- This is the call that should update the UI

        // Optional: Automatically save after reordering? Or rely on user clicking save?
        // Let's rely on the user clicking save for now.
    }

    function handleDragEnd(event) {
        // event.target is the grab-handle div
        const languageOptionElement = event.target.closest('.language-option'); // Get the parent language option div
        if (languageOptionElement) {
             // Remove the 'dragging' class from the element that was dragged
             languageOptionElement.classList.remove('dragging');
        }

        // Ensure any lingering drag-over highlight is removed
        if (dragOverElement) {
            dragOverElement.classList.remove('drag-over-top', 'drag-over-bottom');
            dragOverElement = null;
        }
        draggedItemIndex = null; // Clear state
        if (DEBUG) console.log('[LLM Options Drag] Drag end.');
    }

    // --- End Drag and Drop Handlers ---


    // --- Prompt Preview Function (mostly unchanged) ---
    function updatePromptPreview() {
        if (DEBUG) console.log("Updating prompt preview...");
        let bulletCount = DEFAULT_BULLET_COUNT;
        document.querySelectorAll('input[name="bulletCount"]').forEach(radio => { if (radio.checked) bulletCount = radio.value; });
        const bulletWord = NUM_TO_WORD[bulletCount] || "five";

        // Use imported default templates for preview
        if (promptPreambleDiv) promptPreambleDiv.textContent = DEFAULT_PREAMBLE_TEMPLATE.replace('${bulletWord}', bulletWord);
        if (promptPostambleDiv) promptPostambleDiv.textContent = DEFAULT_POSTAMBLE_TEXT;

        // Removed translation text logic and promptTranslationPreviewDiv update

        // Use the current value from the textarea for preview
        if (promptFormatInstructionsTextarea) promptFormatInstructionsTextarea.value = currentCustomFormatInstructions;
    }


    /** Loads settings and populates the form, WITH VALIDATION. */
    async function loadSettings() { // Made async
        if (DEBUG) console.log("Loading settings...");

         // --- Fetch Language Data from Background ---
         // This replaces the local loadLanguageData call
         const languageDataResponse = await new Promise((resolve) => {
             chrome.runtime.sendMessage({ action: "getLanguageData" }, resolve);
         });

         if (chrome.runtime.lastError) {
             console.error("Error fetching language data from background:", chrome.runtime.lastError);
             if (statusMessage) {
                 statusMessage.textContent = `Error loading language list: ${chrome.runtime.lastError.message}`;
                 statusMessage.className = 'status-message error';
             }
             // Keep using empty lists if loading fails, rendering will handle missing data
             ALL_LANGUAGES_MAP = {};
             ALL_LANGUAGES_ARRAY = [];
             ALL_LANGUAGE_NAMES_MAP = {};
             // Continue loading other settings even if language data fails
         } else if (languageDataResponse && languageDataResponse.ALL_LANGUAGES_MAP) {
             ALL_LANGUAGES_MAP = languageDataResponse.ALL_LANGUAGES_MAP;
             ALL_LANGUAGES_ARRAY = languageDataResponse.ALL_LANGUAGES_ARRAY;
             ALL_LANGUAGE_NAMES_MAP = languageDataResponse.ALL_LANGUAGE_NAMES_MAP;
             // SVG_PATH_PREFIX and FALLBACK_SVG_PATH are now imported constants,
             // but the response includes the full URLs from background.js if needed elsewhere.
             if (DEBUG) console.log(`Fetched ${ALL_LANGUAGES_ARRAY.length} languages from background.`);
         } else {
              console.error("Invalid response fetching language data from background:", languageDataResponse);
              if (statusMessage) {
                 statusMessage.textContent = `Error loading language list: Invalid response.`;
                 statusMessage.className = 'status-message error';
             }
             ALL_LANGUAGES_MAP = {};
             ALL_LANGUAGES_ARRAY = [];
             ALL_LANGUAGE_NAMES_MAP = {};
         }
         // --- End Fetch Language Data ---


         // --- Fetch Models List from Background ---
         const modelsResponse = await new Promise((resolve) => {
             chrome.runtime.sendMessage({ action: "getModelsList" }, resolve);
         });

         if (chrome.runtime.lastError) {
             console.error("Error fetching models list from background:", chrome.runtime.lastError);
             if (statusMessage) {
                 statusMessage.textContent = `Error loading models list: ${chrome.runtime.lastError.message}`;
                 statusMessage.className = 'status-message error';
             }
             // Fallback to default models if fetching fails
             currentModels = [...DEFAULT_MODEL_OPTIONS];
             if (DEBUG) console.log("Using default models due to fetch error.");
         } else if (modelsResponse && Array.isArray(modelsResponse.models)) {
             // Expecting array of {id, label} objects
             currentModels = modelsResponse.models;
             if (DEBUG) console.log(`Fetched ${currentModels.length} models from background.`);
         } else {
              console.error("Invalid response fetching models list from background:", modelsResponse);
              if (statusMessage) {
                 statusMessage.textContent = `Error loading models list: Invalid response.`;
                 statusMessage.className = 'status-message error';
             }
             // Fallback to default models if response is invalid
             currentModels = [...DEFAULT_MODEL_OPTIONS];
             if (DEBUG) console.log("Using default models due to invalid fetch response.");
         }
         // --- End Fetch Models List ---


        const keysToFetch = [
            'apiKey', 'model', 'debug', 'bulletCount',
            // Removed 'translate', 'translateLanguage',
            'availableLanguages', // Still fetch saved language names
            PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
            PROMPT_STORAGE_KEY_PREAMBLE, // Fetch default prompt parts from storage
            PROMPT_STORAGE_KEY_POSTAMBLE,
            PROMPT_STORAGE_KEY_DEFAULT_FORMAT
        ];

        chrome.storage.sync.get(keysToFetch, (data) => {
            // --- Start of Async Callback --- (This runs after storage sync is done, but after language data and models are loaded)
            if (chrome.runtime.lastError) {
                console.error("Error loading settings:", chrome.runtime.lastError);
                statusMessage.textContent = `Error loading settings: ${chrome.runtime.lastError.message}`;
                statusMessage.className = 'status-message error';
                alert(`Critical Error loading settings:\n${chrome.runtime.lastError.message}\n\nPlease try saving the options again.`);
            } else {
                if (DEBUG) console.log("Loaded data from storage:", data);
            }

            // --- FIX: Update DEBUG state variable here ---
            DEBUG = !!data.debug;
            if (DEBUG) console.log('[LLM Options] Debug mode enabled.');
            // --- END FIX ---


            let validationErrors = []; // Keep the validation array

            // --- Populate UI (using loaded data or defaults) ---
            if (apiKeyInput) apiKeyInput.value = data.apiKey || '';
            if (debugCheckbox) debugCheckbox.checked = !!data.debug || DEFAULT_DEBUG_MODE;

            let countValue = data.bulletCount || DEFAULT_BULLET_COUNT;
            let bulletSet = false;
            bulletCountRadios.forEach(radio => { if (radio.value === countValue) { radio.checked = true; bulletSet = true; } else { radio.checked = false; } });
            if (!bulletSet) { const defaultBulletRadio = document.querySelector(`input[name="bulletCount"][value="${DEFAULT_BULLET_COUNT}"]`); if (defaultBulletRadio) defaultBulletRadio.checked = true; }

            // currentModels is already populated from the background message response
            const storedSelectedModel = data.model ? data.model.trim() : ''; // Trim loaded selected model
            const availableModelIds = currentModels.map(m => m.id); // Get IDs from fetched models
            // Ensure loaded model is in the list of models after fetching
            if (storedSelectedModel && availableModelIds.includes(storedSelectedModel)) {
                currentSelectedModel = storedSelectedModel;
            } else if (currentModels.length > 0) {
                currentSelectedModel = currentModels[0].id; // Default to first available model ID
            } else {
                currentSelectedModel = ''; // No models available
            }
            renderModelOptions(); // Render models using the fetched list and determined selection


            // --- Language Loading Logic (Modified) ---
            const loadedLanguages = data.availableLanguages; // Get the raw value from storage

            // Check if availableLanguages is undefined (first load)
            if (loadedLanguages === undefined) {
                 if (DEBUG) console.log("availableLanguages is undefined in storage, prepopulating with defaults.");
                 // On first load, use defaults directly. Validation against ALL_LANGUAGES_MAP happens later during save.
                 currentAvailableLanguages = [...DEFAULT_PREPOPULATE_LANGUAGES];

                 // Add a validation warning if language data wasn't loaded, as defaults can't be validated yet
                 if (Object.keys(ALL_LANGUAGES_MAP).length === 0) {
                      validationErrors.push("Language data could not be loaded. Language flags may not appear correctly until data is available and options are saved.");
                 }

            } else {
                 // Existing logic for when availableLanguages is an array (could be empty)
                 const trimmedLoadedLanguages = (Array.isArray(loadedLanguages) && loadedLanguages.length > 0 && loadedLanguages.every(l => typeof l === 'string'))
                                        ? loadedLanguages.map(l => l.trim()).filter(l => l !== '') // Get saved names, trim, filter empty
                                        : [];

                 // Filter loaded names to only include names found in the fetched language data
                 const validLoadedLanguages = trimmedLoadedLanguages.filter(name => findLanguageByName(name));

                 if (trimmedLoadedLanguages.length > validLoadedLanguages.length) {
                      if (DEBUG) console.warn(`${trimmedLoadedLanguages.length - validLoadedLanguages.length} saved languages were not found in the languages list.`);
                      if (trimmedLoadedLanguages.length > 0) {
                          const invalidNames = trimmedLoadedLanguages.filter(name => !findLanguageByName(name)).join(', ');
                           if (invalidNames) {
                                validationErrors.push(`Some saved languages (${invalidNames}) were not found in the available list and were removed.`);
                           }
                      }
                 }

                 // Use valid loaded languages or prepopulate defaults (filtered against loaded data)
                 if (validLoadedLanguages.length > 0) {
                      currentAvailableLanguages = validLoadedLanguages;
                 } else {
                      if (DEBUG) console.log("No valid languages found in storage, prepopulating with defaults (filtered).");
                      // Filter default prepopulate languages against the fetched language list
                      currentAvailableLanguages = DEFAULT_PREPOPULATE_LANGUAGES.filter(name => findLanguageByName(name));
                      if (ALL_LANGUAGES_ARRAY.length > 0 && currentAvailableLanguages.length < DEFAULT_PREPOPULATE_LANGUAGES.length) {
                           if (DEBUG) console.warn(`Some default languages (${DEFAULT_PREPOPULATE_LANGUAGES.filter(name => !findLanguageByName(name)).join(', ')}) were not found in the languages list.`);
                          const filteredDefaults = DEFAULT_PREPOPULATE_LANGUAGES.filter(name => !findLanguageByName(name)).join(', ');
                          if (filteredDefaults && DEFAULT_PREPOPULATE_LANGUAGES.length > 0) {
                              validationErrors.push(`Some default languages (${filteredDefaults}) were not found in the available list and were not added.`);
                          }
                      }
                 }
            }

            // If after all this, the list is still empty, add an empty one so the user can type.
            // This handles the case where DEFAULT_PREPOPULATE_LANGUAGES is empty or all defaults were invalid.
            if (currentAvailableLanguages.length === 0) {
                 currentAvailableLanguages.push("");
            }

             // Now render the languages based on the potentially modified currentAvailableLanguages
            renderLanguageOptions();
            // --- End Language Loading Logic ---


            // Load custom instructions, falling back to the LOADED default, then the HARDCODED default
            // Use imported default prompt parts if not found in storage
            const savedDefaultFormat = data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] || DEFAULT_FORMAT_INSTRUCTIONS;
            currentCustomFormatInstructions = data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] || savedDefaultFormat;
            if (promptFormatInstructionsTextarea) {
                 promptFormatInstructionsTextarea.value = currentCustomFormatInstructions;
                 // Also store the current value back to the state variable on load
                 currentCustomFormatInstructions = promptFormatInstructionsTextarea.value;
            }

            updatePromptPreview();
            if (DEBUG) console.log("Settings loaded and UI populated.");

            // --- Display Validation Errors if any ---
            if (validationErrors.length > 0) {
                let errorMsg = "Warning: Problems detected with stored settings!\n\n";
                errorMsg += validationErrors.join("\n");
                // alert(errorMsg); // Use alert for critical issues, status message for minor
                // Display the first error in the status message area
                 statusMessage.textContent = `Validation issue: ${validationErrors[0].split('\n')[0]}`;
                 statusMessage.className = 'status-message error';
                console.warn("[LLM Options Load] Validation failed for stored settings:", validationErrors);
            } else {
                 statusMessage.textContent = 'Options loaded.';
                 statusMessage.className = 'status-message success';
                 setTimeout(() => { if (statusMessage) { statusMessage.textContent = ''; statusMessage.className = 'status-message'; } }, 1500);
            }

            // --- End of Async Callback ---
        });
     }

    /** Saves the current settings, INCLUDING the default prompt components. */
    function saveSettings() {
        if (DEBUG) console.log("Saving settings...");
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        const debug = debugCheckbox ? debugCheckbox.checked : false;
        let bulletCount = DEFAULT_BULLET_COUNT;
        document.querySelectorAll('input[name="bulletCount"]').forEach(radio => { if (radio.checked) bulletCount = radio.value; });

        // Get the potentially updated custom format instructions from the textarea
        const customFormatInstructionsToSave = promptFormatInstructionsTextarea ? promptFormatInstructionsTextarea.value : currentCustomFormatInstructions;
         // Update the state variable from the textarea value before saving
         currentCustomFormatInstructions = customFormatInstructionsToSave;

        // Get models from the currentModels state array (which includes id and label)
        // Filter out models with empty IDs
        const modelsToSave = currentModels.filter(m => m.id.trim() !== '').map(m => ({ id: m.id.trim(), label: m.label.trim() }));

        let finalSelectedModel = '';
        // Ensure the selected model ID is actually in the list of IDs being saved
        const savedModelIds = modelsToSave.map(m => m.id);
        if (currentSelectedModel && savedModelIds.includes(currentSelectedModel)) { finalSelectedModel = currentSelectedModel; }
        else if (modelsToSave.length > 0) { finalSelectedModel = modelsToSave[0].id; }
        else { finalSelectedModel = ''; } // No models saved

        // Get language names directly from the input fields for saving, filtering empty and invalid ones
        const languageInputs = languageSelectionArea.querySelectorAll('.language-option input[type="text"]'); // Removed :not(.no-translate-option)
        const languagesToSave = Array.from(languageInputs)
                                     .map(input => input.value.trim())
                                     .filter(lang => lang !== '' && findLanguageByName(lang)); // Only save non-empty names that match a language


        // Removed logic related to determining finalTranslate and finalTranslateLanguage

         // Ensure the currentAvailableLanguages state variable reflects the *valid* names *being saved*
         currentAvailableLanguages = languagesToSave;


        const settingsToSave = {
            apiKey, model: finalSelectedModel,
            // Save models as an array of IDs only, as background.js has the labels
            models: modelsToSave.map(m => m.id), // Save only the IDs
            debug, bulletCount,
            // Removed translate: finalTranslate, translateLanguage: finalTranslateLanguage,
            availableLanguages: languagesToSave, // Save the list of valid names
            [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]: customFormatInstructionsToSave,
            // Save default prompt parts from imported constants
            [PROMPT_STORAGE_KEY_PREAMBLE]: DEFAULT_PREAMBLE_TEMPLATE,
            [PROMPT_STORAGE_KEY_POSTAMBLE]: DEFAULT_POSTAMBLE_TEXT,
            [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]: DEFAULT_FORMAT_INSTRUCTIONS
        };
        if (DEBUG) console.log("Saving data:", settingsToSave);
        chrome.storage.sync.set(settingsToSave, () => {
            if (chrome.runtime.lastError) { statusMessage.textContent = `Error saving: ${chrome.runtime.lastError.message}`; statusMessage.className = 'status-message error'; console.error("Error saving settings:", chrome.runtime.lastError); }
            else {
                 statusMessage.textContent = 'Options saved!'; statusMessage.className = 'status-message success'; if (DEBUG) console.log("Options saved successfully.");
                 // After saving, re-render to ensure UI reflects the saved state (e.g., selected radio, filtered invalid)
                 renderModelOptions(); // Re-render models based on the filtered list
                 renderLanguageOptions(); // Re-render languages specifically
                 updatePromptPreview(); // Ensure prompt preview is correct
            }
            setTimeout(() => { if (statusMessage) { statusMessage.textContent = ''; statusMessage.className = 'status-message'; } }, 2000);
        });
     }

    /** Resets settings to defaults (excluding API key). */
    function resetToDefaults() {
        if (DEBUG) console.log("Resetting options to defaults (excluding API key)...");
        // Reset models to the imported default options (id, label)
        currentModels = [...DEFAULT_MODEL_OPTIONS];
        currentSelectedModel = currentModels.length > 0 ? currentModels[0].id : ''; // Select the first default model ID

        // Reset languages to the imported default pre-populate list, filtering against fetched languages
        // Ensure ALL_LANGUAGES_MAP is available before filtering defaults
        currentAvailableLanguages = DEFAULT_PREPOPULATE_LANGUAGES.filter(name => findLanguageByName(name));
         if (ALL_LANGUAGES_ARRAY.length > 0 && currentAvailableLanguages.length < DEFAULT_PREPOPULATE_LANGUAGES.length) {
              if (DEBUG) console.warn(`Some default languages (${DEFAULT_PREPOPULATE_LANGUAGES.filter(name => !findLanguageByName(name)).join(', ')}) were not found in the languages list during reset and were not added.`);
         }
         if (currentAvailableLanguages.length === 0) { // Ensure at least one empty slot if defaults filtered out
              currentAvailableLanguages.push("");
         }

        currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;

        renderModelOptions(); // Re-render with new default models
        renderLanguageOptions(); // Re-render with new default languages
        bulletCountRadios.forEach(radio => { radio.checked = (radio.value === DEFAULT_BULLET_COUNT); });
        if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;

        if (promptFormatInstructionsTextarea) {
             promptFormatInstructionsTextarea.value = currentCustomFormatInstructions;
        }
         updatePromptPreview();

        saveSettings(); // Save the reset state
        if (statusMessage) {
            statusMessage.textContent = 'Defaults Reset & Saved!'; statusMessage.className = 'status-message success';
            setTimeout(() => { statusMessage.textContent = ''; statusMessage.className = 'status-message'; }, 2500);
        }
    }

    // --- Collapsible Section Logic (unchanged) ---
    function setupCollapsible() {
        if (!advancedOptionsToggle || !advancedOptionsContent) {
             if (DEBUG) console.warn("Collapsible elements not found."); return;
        }
        const toggleIndicator = advancedOptionsToggle.querySelector('.toggle-indicator');
        const toggleSection = () => {
            const isExpanded = advancedOptionsToggle.getAttribute('aria-expanded') === 'true';
            advancedOptionsToggle.setAttribute('aria-expanded', !isExpanded);
            advancedOptionsContent.classList.toggle('active');
            if (toggleIndicator) { toggleIndicator.textContent = isExpanded ? '►' : '▼'; }
            // Optional: Adjust scroll to bring the section into view if it was expanded far down
             if (!isExpanded) {
                // Add a slight delay to allow the height transition to start
                setTimeout(() => {
                     advancedOptionsToggle.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
             }
        };
        advancedOptionsToggle.addEventListener('click', toggleSection);
        advancedOptionsToggle.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSection(); } });
         // Initialize state (closed)
         advancedOptionsContent.classList.remove('active');
         advancedOptionsToggle.setAttribute('aria-expanded', 'false');
         if (toggleIndicator) { toggleIndicator.textContent = '►'; }
    }


    // --- Event Listeners ---
    if (saveButton) saveButton.addEventListener('click', saveSettings);
    if (addModelBtn) addModelBtn.addEventListener('click', addModel);
    if (addLangBtn) addLangBtn.addEventListener('click', addLanguage);
    if (resetButton) resetButton.addEventListener('click', () => { if (confirm("Are you sure you want to reset all options (except API key) to their defaults? This will also reset the prompt customization.")) { resetToDefaults(); } });
    bulletCountRadios.forEach(radio => { radio.addEventListener('change', updatePromptPreview); });
    if (promptFormatInstructionsTextarea) {
        promptFormatInstructionsTextarea.addEventListener('input', (event) => {
            currentCustomFormatInstructions = event.target.value;
        });
    }

    // Initial setup of the global click listener for the autocomplete dropdown
    // This is called early to ensure it's ready when dropdown is first created
    document.addEventListener('click', handleGlobalClick);

    // --- Initial Load & Setup ---
    // loadSettings is now async and loads language data and models before proceeding
    await loadSettings();

    setupCollapsible(); // Setup collapsible after elements are created/loaded

});
