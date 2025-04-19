// options.js
// v2.5.0 - Replaced hardcoded language list with countries.json and emoji flags with SVG flags.

document.addEventListener('DOMContentLoaded', async () => { // Made async to await country data load
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
    const promptTranslationPreviewDiv = document.getElementById('promptTranslationPreview');
    const promptPostambleDiv = document.getElementById('promptPostamble');
    // Collapsible Section Elements
    const advancedOptionsToggle = document.getElementById('advancedOptionsToggle');
    const advancedOptionsContent = document.getElementById('advancedOptionsContent');


    // --- Constants ---
    const DEFAULT_BULLET_COUNT = "5";
    const DEFAULT_MODELS = [
        "google/gemini-2.0-flash-lite-001", "x-ai/grok-3-mini-beta",
        "deepseek/deepseek-chat-v3-0324:nitro", "deepseek/deepseek-r1",
        "openai/gpt-4.1-nano", "anthropic/claude-3.7-sonnet"
    ];
    const DEFAULT_SELECTED_MODEL = DEFAULT_MODELS[0];
    const NO_TRANSLATION_VALUE = "none";
    // Default countries (names) to pre-populate if none are saved. These names must match names in countries.json
    const DEFAULT_PREPOPULATE_LANGUAGES = [
        "France", "Spain", "Germany"
    ];

    // New Constants for Country Data
    const COUNTRIES_JSON_PATH = '../country-flags/countries.json'; // Path relative to options.html
    const SVG_PATH_PREFIX = '../country-flags/svg/'; // Path relative to options.html
    const FALLBACK_SVG_PATH = '../country-flags/svg/un.svg'; // Optional: A generic placeholder

    // --- Data Storage for Countries ---
    // Will store {"AD": "Andorra", ...}
    let ALL_COUNTRIES_MAP = {};
    // Will store [{ code: "AD", name: "Andorra" }, ...]
    let ALL_COUNTRIES_ARRAY = [];
    // Map for quick lookup from name to code (case-insensitive names)
    let ALL_COUNTRY_NAMES_MAP = {};


    const DEFAULT_DEBUG_MODE = false;
    const NUM_TO_WORD = { 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };

    // --- Centralized Prompt Definitions ---
    const PROMPT_STORAGE_KEY_CUSTOM_FORMAT = 'prompt_custom_format_instructions';
    const PROMPT_STORAGE_KEY_PREAMBLE = 'prompt_preamble_template';
    const PROMPT_STORAGE_KEY_POSTAMBLE = 'prompt_postamble_text';
    const PROMPT_STORAGE_KEY_TRANSLATION = 'prompt_translation_template';
    const PROMPT_STORAGE_KEY_DEFAULT_FORMAT = 'prompt_default_format_instructions';

    const DEFAULT_PREAMBLE_TEMPLATE = `Input is raw HTML. Treat it as article_text.
Using US English, prepare a summary of article_text containing approximately \${bulletWord} points.`;
    const DEFAULT_POSTAMBLE_TEXT = `Format the entire result as a single JSON array of strings.
Example JSON array structure: ["Point 1 as HTML string.", "<b>Point 2:</b> With bold.", "<i>Point 3:</i> With italics."]
Do not add any comments before or after the JSON array. Do not output your deliberations.
Just provide the JSON array string as the result. Ensure the output is valid JSON.`;
    const DEFAULT_TRANSLATION_TEMPLATE = `Translate the JSON array of HTML strings you created into the language commonly spoken in \${langName}. Drop the original summary, only return the translated JSON array. Ensure the translated strings retain the same HTML formatting (only <b> and <i> tags allowed). Ensure the output is valid JSON.`; // Updated prompt slightly
    const DEFAULT_FORMAT_INSTRUCTIONS = `Each point should be a concise HTML string, starting with a bold tag-like marker and a colon, followed by the description.
You may use ONLY the following HTML tags for emphasis: <b> for bold and <i> for italics. Do not use any other HTML tags (like <p>, <ul>, <li>, <br>, etc.).
For example: "<b>Key Finding:</b> The market showed <i>significant</i> growth in Q3."
After providing bullet points for article summary, add a bonus one - your insights, assessment and comments, and what should a mindful reader notice about this. Call it <b>Summarizer Insight</b>.`;
    // --- End Centralized Prompt Definitions ---


    // --- State Variables ---
    let currentModels = [];
    let currentSelectedModel = '';
    // currentAvailableLanguages will store just the names of selected countries/languages
    let currentAvailableLanguages = [];
    let currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
    let currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS; // Tracks the value in the textarea

    // --- Autocomplete State ---
    let activeAutocompleteInput = null;
    let autocompleteDropdown = null;
    let highlightedAutocompleteIndex = -1;


    // --- Functions ---

    // --- Model Selection Functions (unchanged) ---
    function renderModelOptions() {
        if (!modelSelectionArea) return;
        modelSelectionArea.innerHTML = '';
        if (!currentModels || currentModels.length === 0) {
            modelSelectionArea.innerHTML = '<p>No models configured. Add one below or save to use defaults.</p>'; return;
        }
        // Ensure currentSelectedModel is still in the list, otherwise default
        if (!currentModels.includes(currentSelectedModel) && currentModels.length > 0) {
             console.warn(`Selected model "${currentSelectedModel}" not in list, defaulting to "${currentModels[0]}" for render.`);
             currentSelectedModel = currentModels[0];
        } else if (currentModels.length === 0) {
             currentSelectedModel = '';
        }
        currentModels.forEach((modelId, index) => {
            const isChecked = (modelId === currentSelectedModel && modelId.trim() !== '');
            const group = document.createElement('div'); group.className = 'option-group model-option';
            const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'selectedModelOption';
            radio.id = `modelRadio_${index}`; radio.value = modelId; radio.checked = isChecked; radio.dataset.index = index;
            radio.disabled = !modelId.trim();
            radio.addEventListener('change', handleModelRadioChange);
            const textInput = document.createElement('input'); textInput.type = 'text'; textInput.id = `modelText_${index}`;
            textInput.value = modelId; textInput.placeholder = "Enter OpenRouter Model ID"; textInput.dataset.index = index;
            textInput.addEventListener('input', handleModelTextChange);
            const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.textContent = '✕';
            removeBtn.className = 'button remove-button'; removeBtn.title = 'Remove this model'; removeBtn.dataset.index = index;
            removeBtn.addEventListener('click', handleModelRemoveClick);
            group.appendChild(radio); group.appendChild(textInput); group.appendChild(removeBtn);
            modelSelectionArea.appendChild(group);
        });
    }
    function handleModelRadioChange(event) {
        if (event.target.checked) {
            const index = parseInt(event.target.dataset.index, 10);
            const textInput = document.getElementById(`modelText_${index}`);
            if (textInput && textInput.value.trim()) {
                currentSelectedModel = textInput.value.trim(); console.log("Selected model changed to:", currentSelectedModel);
            } else {
                // If the selected input is empty, uncheck it and try to revert to the previous valid one
                event.target.checked = false;
                const previousValidRadio = modelSelectionArea.querySelector(`input[type="radio"][value="${currentSelectedModel}"]:not(:disabled)`);
                if (previousValidRadio) {
                    previousValidRadio.checked = true;
                } else {
                    // If previous isn't found or invalid, try selecting the first valid one
                    const firstValidRadio = modelSelectionArea.querySelector('input[type="radio"]:not(:disabled)');
                    if (firstValidRadio) {
                        firstValidRadio.checked = true;
                        currentSelectedModel = firstValidRadio.value;
                    } else {
                        currentSelectedModel = ''; // No valid models left
                    }
                }
            }
        }
     }
    function handleModelTextChange(event) {
        const newModelId = event.target.value.trim(); const idx = parseInt(event.target.dataset.index, 10);
        if (idx >= 0 && idx < currentModels.length) { currentModels[idx] = newModelId; }

        const associatedRadio = document.getElementById(`modelRadio_${idx}`);
        if (associatedRadio) {
            associatedRadio.value = newModelId;
            associatedRadio.disabled = !newModelId; // Disable radio if input is empty

            // If this was the selected model and input became empty, re-select a new default
            if (associatedRadio.checked) {
                 if (!newModelId) {
                    associatedRadio.checked = false;
                    currentSelectedModel = ''; // Clear selected if empty

                    // Attempt to select the first valid model in the updated list
                    const firstValidModel = currentModels.find(m => m.trim() !== '');
                    if (firstValidModel) {
                         const firstValidRadio = modelSelectionArea.querySelector(`input[type="radio"][value="${firstValidModel}"]`);
                         if (firstValidRadio) {
                            firstValidRadio.checked = true;
                            currentSelectedModel = firstValidModel;
                         }
                    }
                 } else {
                    currentSelectedModel = newModelId; // Update selected model if input changed and it's still checked
                 }
                 console.log("Selected model ID updated via text input to:", currentSelectedModel);
            }
        }
     }
    function handleModelRemoveClick(event) { removeModel(parseInt(event.target.dataset.index, 10)); }
    function addModel() { currentModels.push(""); renderModelOptions(); const newIndex = currentModels.length - 1; const newInput = document.getElementById(`modelText_${newIndex}`); if (newInput) { newInput.focus(); } }
    function removeModel(indexToRemove) {
        if (indexToRemove < 0 || indexToRemove >= currentModels.length) return;
        const removedModelId = currentModels[indexToRemove]; currentModels.splice(indexToRemove, 1);
        // If the removed model was the selected one, find a new selection
        if (removedModelId === currentSelectedModel) {
            const firstValidModel = currentModels.find(m => m.trim() !== '');
            currentSelectedModel = firstValidModel || '';
        }
        renderModelOptions();
     }
    // --- End Model Selection Functions ---


    // --- Language Selection & Autocomplete Functions (Modified for JSON/SVG) ---

    // Function to load country data from JSON
    async function loadCountryData() {
        try {
            const response = await fetch(COUNTRIES_JSON_PATH);
            if (!response.ok) {
                throw new Error(`Failed to fetch countries.json: ${response.statusText}`);
            }
            const data = await response.json();
            ALL_COUNTRIES_MAP = data;
            ALL_COUNTRIES_ARRAY = Object.keys(data).map(code => ({ code: code, name: data[code] }));
            // Create name-to-code map for quick lookup (lowercase names)
            ALL_COUNTRY_NAMES_MAP = Object.keys(data).reduce((map, code) => {
                map[data[code].toLowerCase()] = code; // Store lowercase name -> original code
                return map;
            }, {});
            console.log(`Loaded ${ALL_COUNTRIES_ARRAY.length} countries.`);
        } catch (error) {
            console.error("Error loading country data:", error);
            // Display an error message or use a fallback mechanism
            if (statusMessage) {
                statusMessage.textContent = `Error loading country list: ${error.message}`;
                statusMessage.className = 'status-message error';
            }
            // Keep using empty lists if loading fails, rendering will handle missing data
            ALL_COUNTRIES_MAP = {};
            ALL_COUNTRIES_ARRAY = [];
            ALL_COUNTRY_NAMES_MAP = {};
        }
    }


    // Filters countries from the loaded data based on the query matching the name
    function filterCountries(query) {
        const lowerQuery = query.toLowerCase().trim();
        if (!lowerQuery) return []; // Don't show suggestions for empty input

        // Filter the array based on name containing the query
        return ALL_COUNTRIES_ARRAY.filter(country =>
            country.name.toLowerCase().includes(lowerQuery)
        );
    }

    // Finds a country object ({code, name}) by its name (case-insensitive, trims whitespace)
    // Returns undefined if not found
    function findCountryByName(name) {
        const cleanName = name.trim().toLowerCase();
        const code = ALL_COUNTRY_NAMES_MAP[cleanName];
        if (code) {
            return { code: code, name: ALL_COUNTRIES_MAP[code] }; // Return original name case
        }
        // Fallback to iterating array if exact map match fails (e.g., for aliases, though map is preferred)
        // Given the standard ISO list, the map should be sufficient.
         return undefined; // Explicitly return undefined if not found
    }


    // Shows the autocomplete dropdown with country suggestions
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

        suggestions.forEach((country, index) => { // 'country' is now {code, name}
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.dataset.index = index;
            item.dataset.countryCode = country.code; // Store code for easy access
            item.dataset.countryName = country.name; // Store name
            // Use <img> for SVG flag
            const flagImg = document.createElement('img');
            flagImg.className = 'language-flag'; // Use language-flag class for img
            flagImg.src = `${SVG_PATH_PREFIX}${country.code.toLowerCase()}.svg`;
            flagImg.alt = `${country.name} flag`;
            flagImg.onerror = function() { // Handle missing SVG
                this.src = FALLBACK_SVG_PATH;
                 this.alt = 'Flag not found'; // Update alt text
                 console.warn(`Missing SVG for code: ${country.code}`);
            };

            const nameSpan = document.createElement('span');
            nameSpan.textContent = country.name;
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

        const countryName = itemElement.dataset.countryName;
        const countryCode = itemElement.dataset.countryCode;

        inputElement.value = countryName; // Put the full country name into the input

        // Manually update the flag next to the input
        const flagImg = inputElement.parentElement ? inputElement.parentElement.querySelector('.language-flag') : null;
        if (flagImg && countryCode) { // Ensure flagImg exists and we have a code
            flagImg.src = `${SVG_PATH_PREFIX}${countryCode.toLowerCase()}.svg`;
             flagImg.alt = `${countryName} flag`;
             flagImg.onerror = function() { // Handle missing SVG after selection
                 this.src = FALLBACK_SVG_PATH;
                 this.alt = 'Flag not found';
                 console.warn(`Missing SVG for code: ${countryCode} (after selection)`);
             };
        } else if (flagImg) { // If no country code (shouldn't happen with valid selection), show fallback
             flagImg.src = FALLBACK_SVG_PATH;
             flagImg.alt = 'Flag not found';
             console.warn(`No country code found for selected item: ${countryName}`);
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
            // Filter countries (by name)
            const suggestions = filterCountries(query);
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
                 const suggestions = filterCountries(query);
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


    // Renders the list of available languages (countries) in the options UI
    function renderLanguageOptions() {
        if (!languageSelectionArea) return;
        languageSelectionArea.innerHTML = ''; // Clear existing options

        // Ensure currentSelectedLanguageValue is still in the list being rendered, otherwise default
        // Note: currentAvailableLanguages holds names. currentSelectedLanguageValue holds a name or NO_TRANSLATION_VALUE.
        // Check against the list of names
        if (currentSelectedLanguageValue !== NO_TRANSLATION_VALUE && !currentAvailableLanguages.includes(currentSelectedLanguageValue)) {
             console.warn(`Selected language "${currentSelectedLanguageValue}" not in available list, defaulting to "${NO_TRANSLATION_VALUE}" for render.`);
             currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
        } else if (currentAvailableLanguages.length === 0 && currentSelectedLanguageValue !== NO_TRANSLATION_VALUE) {
             // Edge case: List is empty, but something is still selected (shouldn't happen after loading/saving logic)
             currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
        }


        // Add "No translation needed" option first
        const noTransGroup = document.createElement('div');
        noTransGroup.className = 'option-group language-option no-translate-option';
        const noTransRadio = document.createElement('input');
        noTransRadio.type = 'radio';
        noTransRadio.name = 'selectedLanguageOption';
        noTransRadio.id = 'langRadio_none';
        noTransRadio.value = NO_TRANSLATION_VALUE;
        noTransRadio.checked = (currentSelectedLanguageValue === NO_TRANSLATION_VALUE);
        noTransRadio.addEventListener('change', handleLanguageRadioChange);
        const noTransLabel = document.createElement('label');
        noTransLabel.setAttribute('for', 'langRadio_none');
        const noTransSpan = document.createElement('span');
        noTransSpan.textContent = 'No translation needed';
        noTransSpan.className = 'language-label-static'; // Keep static style
        noTransLabel.appendChild(noTransSpan);
        noTransGroup.appendChild(noTransRadio);
        noTransGroup.appendChild(noTransLabel);
        languageSelectionArea.appendChild(noTransGroup);


        // Add current available languages (countries)
        currentAvailableLanguages.forEach((langName, index) => { // langName is actually a country name here
            const group = document.createElement('div');
            group.className = 'option-group language-option';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'selectedLanguageOption';
            radio.id = `langRadio_${index}`;
            radio.value = langName; // Radio value is the country name
            radio.checked = (langName === currentSelectedLanguageValue && langName.trim() !== '');
            radio.dataset.index = index;
            radio.disabled = !langName.trim(); // Disable radio if input is empty
            radio.addEventListener('change', handleLanguageRadioChange);

            const label = document.createElement('label');
            label.setAttribute('for', `langRadio_${index}`);
            label.className = 'language-input-wrapper';


            // Use <img> for the flag
            const flagImg = document.createElement('img');
            flagImg.className = 'language-flag'; // Use language-flag class
            const countryData = findCountryByName(langName); // Find the code for the name using loaded data
            const countryCode = countryData ? countryData.code : null;
            if (countryCode) {
                flagImg.src = `${SVG_PATH_PREFIX}${countryCode.toLowerCase()}.svg`;
                flagImg.alt = `${langName} flag`;
                flagImg.onerror = function() { // Handle missing SVG on render
                    this.src = FALLBACK_SVG_PATH; // Or hide: this.style.display = 'none';
                    this.alt = 'Flag not found'; // Update alt text
                     console.warn(`Missing SVG for code: ${countryCode} (on render)`);
                };
            } else {
                // If country name not found in data, show placeholder
                flagImg.src = FALLBACK_SVG_PATH;
                flagImg.alt = 'Flag not found';
                 console.warn(`Country name "${langName}" not found in loaded data during render.`);
            }


            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.id = `langText_${index}`;
            textInput.value = langName;
            textInput.placeholder = "Enter Country Name"; // Updated placeholder
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

            group.appendChild(radio);
            group.appendChild(label);
            group.appendChild(removeBtn);

            languageSelectionArea.appendChild(group);

            // Set up autocomplete for this specific input field
            setupAutocomplete(textInput);
        });
     }

    // Handles change event on language radio buttons
    function handleLanguageRadioChange(event) {
        const selectedValue = event.target.value; // This value is the country name or NO_TRANSLATION_VALUE
        if (event.target.checked) {
            if (selectedValue === NO_TRANSLATION_VALUE) {
                currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
                console.log("Lang selection: No Translation");
            } else {
                const index = parseInt(event.target.dataset.index, 10);
                const textInput = document.getElementById(`langText_${index}`);
                if (textInput && textInput.value.trim()) {
                     const selectedLangName = textInput.value.trim();
                     // Validate that the selected name corresponds to a country before setting
                     if (findCountryByName(selectedLangName)) {
                        currentSelectedLanguageValue = selectedLangName;
                        console.log("Lang selection:", currentSelectedLanguageValue);
                     } else {
                        // If the input is filled but doesn't match a country, revert to None
                        event.target.checked = false;
                        const noneRadio = document.getElementById('langRadio_none');
                        if(noneRadio) noneRadio.checked = true;
                        currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
                        console.warn("Selected language input did not match a country, reverting to No Translation.");
                     }
                } else {
                     // If the input associated with the checked radio is empty,
                     // uncheck it and revert to 'none' or previous valid selection
                     event.target.checked = false;
                     const noneRadio = document.getElementById('langRadio_none');
                     if(noneRadio) noneRadio.checked = true;
                     currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
                     console.warn("Selected language input was empty, reverting to No Translation.");
                }
            }
            updatePromptPreview(); // Update preview based on new selection
        }
     }

    // Handles input event on language text fields (typing or selection)
    function handleLanguageTextChange(event) {
        const newLangName = event.target.value; // Get raw value (don't trim yet for autocomplete filter)
        const idx = parseInt(event.target.dataset.index, 10);

        // Update the array of available languages (country names) with the raw value
        if (idx >= 0 && idx < currentAvailableLanguages.length) {
            currentAvailableLanguages[idx] = newLangName.trim(); // Store trimmed name in array
        } else {
             console.error("handleLanguageTextChange called with invalid index:", idx);
             return;
        }

        // Find and update the associated flag img
        const flagImg = event.target.parentElement ? event.target.parentElement.querySelector('.language-flag') : null;
        if (flagImg) {
            const countryData = findCountryByName(newLangName); // Find using potentially untrimmed/partial name for flag preview while typing
            const countryCode = countryData ? countryData.code : null;

            if (countryCode) {
                flagImg.src = `${SVG_PATH_PREFIX}${countryCode.toLowerCase()}.svg`;
                flagImg.alt = `${countryData.name} flag`; // Use the found country name for alt
                flagImg.style.display = ''; // Ensure flag is visible
                flagImg.onerror = function() {
                     this.src = FALLBACK_SVG_PATH;
                     this.alt = 'Flag not found';
                     console.warn(`Missing SVG for code: ${countryCode} (on text input change)`);
                };
            } else {
                // If country name not found, show placeholder or hide flag
                flagImg.src = FALLBACK_SVG_PATH; // Show placeholder
                flagImg.alt = 'Flag not found';
                // flagImg.style.display = 'none'; // Alternatively, hide the flag
                 if (newLangName.trim().length > 0) {
                     console.warn(`Country name "${newLangName.trim()}" not found in loaded data on text change.`);
                 }
            }
        }


        // Update the associated radio button value and state
        const associatedRadio = document.getElementById(`langRadio_${idx}`);
        if (associatedRadio) {
            const trimmedLangName = newLangName.trim();
            associatedRadio.value = trimmedLangName; // Radio value is the trimmed name
            const isDisabled = !trimmedLangName || !findCountryByName(trimmedLangName); // Disable if empty or doesn't match a country name
            associatedRadio.disabled = isDisabled;

             // If this input was associated with the *currently selected* language,
             // update the selected value and prompt preview based on the *trimmed* valid name
            if (associatedRadio.checked) {
                if (isDisabled) {
                    // If the current selected language's input became empty or invalid
                    associatedRadio.checked = false; // Uncheck the invalid radio
                    const noneRadio = document.getElementById('langRadio_none');
                    if(noneRadio) noneRadio.checked = true; // Select "None"
                    currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
                     console.log("Selected language input became invalid, switching selection to No Translation.");
                } else {
                    // If the current selected language's input changed and is still valid
                    currentSelectedLanguageValue = trimmedLangName;
                    console.log("Selected language name (country) updated via text:", currentSelectedLanguageValue);
                }
                 updatePromptPreview(); // Update preview only if the selected language changed (or potentially changed to none)
            }
            // If the input is not currently selected, just ensure its radio is disabled/enabled correctly
        }
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

        const removedLangName = currentAvailableLanguages[indexToRemove];
        currentAvailableLanguages.splice(indexToRemove, 1); // Remove from the array

        // If the removed language was the selected one, change the selection to "none"
        if (removedLangName === currentSelectedLanguageValue) {
            currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
        }

        renderLanguageOptions(); // Re-render the whole list
        updatePromptPreview(); // Update preview as selected language might have changed
     }
    // --- End Language Selection & Autocomplete Functions ---

    // --- Prompt Preview Function (mostly unchanged) ---
    function updatePromptPreview() {
        console.log("Updating prompt preview...");
        let bulletCount = DEFAULT_BULLET_COUNT;
        document.querySelectorAll('input[name="bulletCount"]').forEach(radio => { if (radio.checked) bulletCount = radio.value; });
        const bulletWord = NUM_TO_WORD[bulletCount] || "five";

        if (promptPreambleDiv) promptPreambleDiv.textContent = DEFAULT_PREAMBLE_TEMPLATE.replace('${bulletWord}', bulletWord);
        if (promptPostambleDiv) promptPostambleDiv.textContent = DEFAULT_POSTAMBLE_TEXT;

        let translationText = "";
        // Check if a language is selected AND that language is still in the available list
        if (currentSelectedLanguageValue !== NO_TRANSLATION_VALUE && currentAvailableLanguages.includes(currentSelectedLanguageValue)) {
             translationText = DEFAULT_TRANSLATION_TEMPLATE.replace('${langName}', currentSelectedLanguageValue);
        }
        if (promptTranslationPreviewDiv) promptTranslationPreviewDiv.textContent = translationText;

        // Use the current value from the textarea for preview
        if (promptFormatInstructionsTextarea) promptFormatInstructionsTextarea.value = currentCustomFormatInstructions;
    }


    /** Loads settings and populates the form, WITH VALIDATION. */
    async function loadSettings() { // Made async
        console.log("Loading settings...");

         // --- Load Country Data First ---
        // This is now done *before* the storage sync callback can process language data.
        await loadCountryData();

        const keysToFetch = [
            'apiKey', 'model', 'models', 'debug', 'bulletCount',
            'translate', 'translateLanguage', 'availableLanguages',
            PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
            PROMPT_STORAGE_KEY_PREAMBLE,
            PROMPT_STORAGE_KEY_POSTAMBLE,
            PROMPT_STORAGE_KEY_TRANSLATION,
            PROMPT_STORAGE_KEY_DEFAULT_FORMAT
        ];

        chrome.storage.sync.get(keysToFetch, (data) => {
            // --- Start of Async Callback --- (This runs after storage sync is done, but after country data is loaded)
            if (chrome.runtime.lastError) {
                console.error("Error loading settings:", chrome.runtime.lastError);
                statusMessage.textContent = `Error loading settings: ${chrome.runtime.lastError.message}`;
                statusMessage.className = 'status-message error';
                alert(`Critical Error loading settings:\n${chrome.runtime.lastError.message}\n\nPlease try saving the options again.`);
            } else {
                console.log("Loaded data:", data);
            }

            let validationErrors = []; // Keep the validation array

            // --- Populate UI (using loaded data or defaults) ---
            if (apiKeyInput) apiKeyInput.value = data.apiKey || '';
            if (debugCheckbox) debugCheckbox.checked = !!data.debug || DEFAULT_DEBUG_MODE;

            let countValue = data.bulletCount || DEFAULT_BULLET_COUNT;
            let bulletSet = false;
            bulletCountRadios.forEach(radio => { if (radio.value === countValue) { radio.checked = true; bulletSet = true; } else { radio.checked = false; } });
            if (!bulletSet) { const defaultBulletRadio = document.querySelector(`input[name="bulletCount"][value="${DEFAULT_BULLET_COUNT}"]`); if (defaultBulletRadio) defaultBulletRadio.checked = true; }

            currentModels = (Array.isArray(data.models) && data.models.length > 0 && data.models.every(m => typeof m === 'string'))
                            ? data.models.map(m => m.trim()).filter(m => m !== '') // Trim and filter empty models on load
                            : [...DEFAULT_MODELS];
            if (currentModels.length === 0) currentModels = [...DEFAULT_MODELS]; // Ensure it's never empty after loading/filtering

            const storedSelectedModel = data.model ? data.model.trim() : ''; // Trim loaded selected model
            // Ensure loaded model is in the list of models after loading/filtering
            if (storedSelectedModel && currentModels.includes(storedSelectedModel)) {
                currentSelectedModel = storedSelectedModel;
            } else if (currentModels.length > 0) {
                currentSelectedModel = currentModels[0]; // Default to first available model
            } else {
                currentSelectedModel = ''; // No models available
            }
            renderModelOptions();


            // --- Language Loading Logic (Now depends on loaded ALL_COUNTRIES_MAP/ARRAY) ---
            const loadedLanguages = (Array.isArray(data.availableLanguages) && data.availableLanguages.length > 0 && data.availableLanguages.every(l => typeof l === 'string'))
                                    ? data.availableLanguages.map(l => l.trim()).filter(l => l !== '') // Get saved names, trim, filter empty
                                    : [];

            // Filter loaded names to only include names found in the loaded country data
            const validLoadedLanguages = loadedLanguages.filter(name => findCountryByName(name));
            if (loadedLanguages.length > validLoadedLanguages.length) {
                 console.warn(`${loadedLanguages.length - validLoadedLanguages.length} saved languages were not found in the countries list.`);
                 if (loadedLanguages.length > 0) {
                     // Only add validation error if there were saved languages that became invalid
                     const invalidNames = loadedLanguages.filter(name => !findCountryByName(name)).join(', ');
                      if (invalidNames) {
                           validationErrors.push(`Some saved countries/languages (${invalidNames}) were not found in the available list and were removed.`);
                      }
                 }
            }


            // Use valid loaded languages or prepopulate defaults, filtering defaults if not in the loaded country list
            if (validLoadedLanguages.length > 0) {
                 currentAvailableLanguages = validLoadedLanguages;
            } else {
                 console.log("No valid countries/languages found in storage, prepopulating with defaults.");
                 // Filter default prepopulate languages against the loaded country list
                 currentAvailableLanguages = DEFAULT_PREPOPULATE_LANGUAGES.filter(name => findCountryByName(name));
                 if (currentAvailableLanguages.length < DEFAULT_PREPOPULATE_LANGUAGES.length) {
                      console.warn(`Some default languages (${DEFAULT_PREPOPULATE_LANGUAGES.filter(name => !findCountryByName(name)).join(', ')}) were not found in the countries list.`);
                      // Only add validation error if some defaults were filtered out AND the default list wasn't originally empty
                     const filteredDefaults = DEFAULT_PREPOPULATE_LANGUAGES.filter(name => !findCountryByName(name)).join(', ');
                     if (filteredDefaults && DEFAULT_PREPOPULATE_LANGUAGES.length > 0) {
                         validationErrors.push(`Some default countries/languages (${filteredDefaults}) were not found in the available list and were not added.`);
                     }
                 }
            }
            // If after all this, the list is still empty, add an empty one so the user can type.
            // The save function will filter out empty ones.
            if (currentAvailableLanguages.length === 0) {
                 currentAvailableLanguages.push("");
            }


            const storedTranslate = ('translate' in data) ? !!data.translate : false;
            const storedLang = data.translateLanguage ? data.translateLanguage.trim() : ''; // Trim loaded selected language name

            // Determine initial selected language value (name)
            if (!storedTranslate || storedLang === NO_TRANSLATION_VALUE) {
                currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
            }
            // Check if the stored language name is present in the list we just determined (validLoadedLanguages or defaults)
            // And also check if it is a valid country name in the loaded data map
            else if (storedLang && currentAvailableLanguages.includes(storedLang) && findCountryByName(storedLang)) {
                currentSelectedLanguageValue = storedLang;
            }
            // Fallback if stored language wasn't valid or wasn't in the list (either invalid or filtered out)
            else {
                currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
                if (storedTranslate && storedLang && storedLang !== NO_TRANSLATION_VALUE) {
                     console.warn(`Stored selected language "${storedLang}" not found/valid in current available list. Reverting selection to "No translation needed".`);
                     validationErrors.push(`The previously selected country/language "${storedLang}" was not found in the available list and selection reverted to "No translation needed".`);
                }
            }
             // Now render the languages based on the potentially modified currentAvailableLanguages and currentSelectedLanguageValue
            renderLanguageOptions();
            // --- End Language Loading Logic ---


            // Load custom instructions, falling back to the LOADED default, then the HARDCODED default
            const savedDefaultFormat = data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT] || DEFAULT_FORMAT_INSTRUCTIONS;
            currentCustomFormatInstructions = data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] || savedDefaultFormat;
            if (promptFormatInstructionsTextarea) {
                 promptFormatInstructionsTextarea.value = currentCustomFormatInstructions;
                 // Also store the current value back to the state variable on load
                 currentCustomFormatInstructions = promptFormatInstructionsTextarea.value;
            }

            updatePromptPreview();
            console.log("Settings loaded and UI populated.");

            // --- Display Validation Errors if any ---
            if (validationErrors.length > 0) {
                let errorMsg = "Warning: Problems detected with stored settings!\n\n";
                errorMsg += validationErrors.join("\n");
                // alert(errorMsg); // Use alert for critical issues, status message for minor
                // Display the first error in the status message area
                 statusMessage.textContent = `Validation issue: ${validationErrors[0].split('\n')[0]}`;
                 statusMessage.className = 'status-message error';
                console.warn("[Options Load] Validation failed for stored settings:", validationErrors);
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
        console.log("Saving settings...");
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        const debug = debugCheckbox ? debugCheckbox.checked : false;
        let bulletCount = DEFAULT_BULLET_COUNT;
        document.querySelectorAll('input[name="bulletCount"]').forEach(radio => { if (radio.checked) bulletCount = radio.value; });

        // Get the potentially updated custom format instructions from the textarea
        const customFormatInstructionsToSave = promptFormatInstructionsTextarea ? promptFormatInstructionsTextarea.value : currentCustomFormatInstructions;
         // Update the state variable from the textarea value before saving
         currentCustomFormatInstructions = customFormatInstructionsToSave;

        const modelsToSave = currentModels.map(m => m.trim()).filter(m => m !== '');
        let finalSelectedModel = '';
        // Ensure the selected model is actually in the list being saved
        if (currentSelectedModel && modelsToSave.includes(currentSelectedModel)) { finalSelectedModel = currentSelectedModel; }
        else if (modelsToSave.length > 0) { finalSelectedModel = modelsToSave[0]; }
        else { finalSelectedModel = ''; } // No models saved

        // Get language names directly from the input fields for saving, filtering empty and invalid ones
        const languageInputs = languageSelectionArea.querySelectorAll('.language-option:not(.no-translate-option) input[type="text"]');
        const languagesToSave = Array.from(languageInputs)
                                     .map(input => input.value.trim())
                                     .filter(lang => lang !== '' && findCountryByName(lang)); // Only save non-empty names that match a country


        // Determine the final selected language value based on radio button state
        let finalTranslate = false;
        let finalTranslateLanguage = NO_TRANSLATION_VALUE; // This will store the saved name or 'none'
        const selectedLangRadio = document.querySelector('input[name="selectedLanguageOption"]:checked');

        if (selectedLangRadio && selectedLangRadio.value !== NO_TRANSLATION_VALUE) {
             const selectedLangName = selectedLangRadio.value.trim();
             // Double-check the selected name is valid and also in the list of languages being saved
             if (findCountryByName(selectedLangName) && languagesToSave.includes(selectedLangName)) {
                 finalTranslate = true;
                 finalTranslateLanguage = selectedLangName;
             } else {
                 // This case implies a language was selected but its input was then cleared, became invalid, or it was removed.
                 // We must save 'none' and update the UI state accordingly.
                 console.warn(`Selected country/language "${selectedLangName}" became invalid or was removed. Saving "No translation needed" instead.`);
                 finalTranslate = false;
                 finalTranslateLanguage = NO_TRANSLATION_VALUE;
                 // Don't update UI here, the save callback should trigger reload or manual update if needed,
                 // but loadSettings already handles invalid saved state.
             }
        }
        // If selectedLangRadio is 'none' or null, finalTranslate remains false and finalTranslateLanguage remains NO_TRANSLATION_VALUE

         // Ensure the currentAvailableLanguages state variable reflects the *valid* names *being saved*
         currentAvailableLanguages = languagesToSave;
         // Update currentSelectedLanguageValue state variable to match what was determined for saving
         currentSelectedLanguageValue = finalTranslateLanguage;


        const settingsToSave = {
            apiKey, model: finalSelectedModel, models: modelsToSave, debug, bulletCount,
            translate: finalTranslate, translateLanguage: finalTranslateLanguage,
            availableLanguages: languagesToSave, // Save the list of valid names
            [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]: customFormatInstructionsToSave,
            [PROMPT_STORAGE_KEY_PREAMBLE]: DEFAULT_PREAMBLE_TEMPLATE, // Save defaults just in case
            [PROMPT_STORAGE_KEY_POSTAMBLE]: DEFAULT_POSTAMBLE_TEXT,
            [PROMPT_STORAGE_KEY_TRANSLATION]: DEFAULT_TRANSLATION_TEMPLATE,
            [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]: DEFAULT_FORMAT_INSTRUCTIONS
        };
        console.log("Saving data:", settingsToSave);
        chrome.storage.sync.set(settingsToSave, () => {
            if (chrome.runtime.lastError) { statusMessage.textContent = `Error saving: ${chrome.runtime.lastError.message}`; statusMessage.className = 'status-message error'; console.error("Error saving settings:", chrome.runtime.lastError); }
            else {
                 statusMessage.textContent = 'Options saved!'; statusMessage.className = 'status-message success'; console.log("Options saved successfully.");
                 // After saving, re-render to ensure UI reflects the saved state (e.g., selected radio, filtered invalid)
                 renderLanguageOptions(); // Re-render languages specifically
                 updatePromptPreview(); // Ensure prompt preview is correct
            }
            setTimeout(() => { if (statusMessage) { statusMessage.textContent = ''; statusMessage.className = 'status-message'; } }, 2000);
        });
     }

    /** Resets settings to defaults (excluding API key). */
    function resetToDefaults() {
        console.log("Resetting options to defaults (excluding API key)...");
        currentModels = [...DEFAULT_MODELS]; currentSelectedModel = DEFAULT_SELECTED_MODEL;
        // Reset languages to the default pre-populate list, filtering against loaded countries
        // Ensure ALL_COUNTRIES_MAP is available before filtering defaults
        currentAvailableLanguages = DEFAULT_PREPOPULATE_LANGUAGES.filter(name => findCountryByName(name));
         if (ALL_COUNTRIES_ARRAY.length > 0 && currentAvailableLanguages.length < DEFAULT_PREPOPULATE_LANGUAGES.length) {
              console.warn(`Some default languages (${DEFAULT_PREPOPULATE_LANGUAGES.filter(name => !findCountryByName(name)).join(', ')}) were not found in the countries list during reset and were not added.`);
         }
         if (currentAvailableLanguages.length === 0) { // Ensure at least one empty slot if defaults filtered out
              currentAvailableLanguages.push("");
         }

        currentSelectedLanguageValue = NO_TRANSLATION_VALUE; // Default to no translation
        currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;

        renderModelOptions();
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
             console.warn("Collapsible elements not found."); return;
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
    // loadSettings is now async and loads country data before proceeding
    await loadSettings();

    setupCollapsible(); // Setup collapsible after elements are created/loaded

});
