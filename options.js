document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelectionArea = document.getElementById('modelSelectionArea');
    const addModelBtn = document.getElementById('addModelBtn');
    const languageSelectionArea = document.getElementById('languageSelectionArea');
    const addLangBtn = document.getElementById('addLangBtn');
    const debugCheckbox = document.getElementById('debug');
    const bulletCountRadios = document.querySelectorAll('input[name="bulletCount"]');
    const saveButton = document.getElementById('save');
    const resetButton = document.getElementById('resetDefaultsBtn'); // New Button
    const statusMessage = document.getElementById('status');

    // --- Constants ---
    const DEFAULT_BULLET_COUNT = "5";
    const DEFAULT_MODELS = [
        "google/gemini-2.0-flash-lite-001", "x-ai/grok-3-mini-beta",
        "deepseek/deepseek-chat-v3-0324:nitro", "deepseek/deepseek-r1",
        "openai/gpt-4.1-nano", "anthropic/claude-3.7-sonnet"
    ];
    const DEFAULT_SELECTED_MODEL = DEFAULT_MODELS[0];
    const NO_TRANSLATION_VALUE = "none";
    const DEFAULT_LANGUAGES = [
        "English", "Spanish", "French", "Mandarin", "Arabic", "Hebrew", "Russian", "German"
    ];
    const DEFAULT_DEBUG_MODE = false; // Explicit default for debug

    // --- State Variables ---
    let currentModels = [];
    let currentSelectedModel = '';
    let currentAvailableLanguages = [];
    let currentSelectedLanguageValue = NO_TRANSLATION_VALUE;

    // --- Functions ---

    // --- Model Selection Functions (Keep existing) ---
    function renderModelOptions() { /* ... no changes needed ... */
        modelSelectionArea.innerHTML = '';
        if (!currentModels || currentModels.length === 0) {
            modelSelectionArea.innerHTML = '<p>No models configured. Add one below or save to use defaults.</p>'; return;
        }
        currentModels.forEach((modelId, index) => {
            const isChecked = (modelId === currentSelectedModel);
            const group = document.createElement('div'); group.className = 'option-group model-option';
            const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'selectedModelOption';
            radio.id = `modelRadio_${index}`; radio.value = modelId; radio.checked = isChecked; radio.dataset.index = index;
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
    function handleModelRadioChange(event) { /* ... no changes needed ... */
        if (event.target.checked) {
            const index = parseInt(event.target.dataset.index, 10);
            const textInput = document.getElementById(`modelText_${index}`);
            if (textInput && textInput.value.trim()) {
                currentSelectedModel = textInput.value.trim(); console.log("Selected model changed to:", currentSelectedModel);
            } else { event.target.checked = false; const previousRadio = modelSelectionArea.querySelector(`input[type="radio"][value="${currentSelectedModel}"]`); if (previousRadio) previousRadio.checked = true; }
        }
     }
    function handleModelTextChange(event) { /* ... no changes needed ... */
        const newModelId = event.target.value.trim(); const idx = parseInt(event.target.dataset.index, 10);
        if (idx >= 0 && idx < currentModels.length) { currentModels[idx] = newModelId; }
        const associatedRadio = document.getElementById(`modelRadio_${idx}`);
        if (associatedRadio) {
            associatedRadio.value = newModelId; if (associatedRadio.checked) { currentSelectedModel = newModelId; console.log("Selected model ID updated via text input to:", currentSelectedModel); }
            associatedRadio.disabled = !newModelId;
            if (!newModelId && associatedRadio.checked) {
                associatedRadio.checked = false; currentSelectedModel = ''; const firstValidRadio = modelSelectionArea.querySelector('input[type="radio"]:not(:disabled)');
                if (firstValidRadio) { firstValidRadio.checked = true; currentSelectedModel = firstValidRadio.value; }
            }
        }
    }
    function handleModelRemoveClick(event) { removeModel(parseInt(event.target.dataset.index, 10)); }
    function addModel() { /* ... no changes needed ... */
        currentModels.push(""); renderModelOptions(); const newIndex = currentModels.length - 1; const newInput = document.getElementById(`modelText_${newIndex}`); if (newInput) { newInput.focus(); }
     }
    function removeModel(indexToRemove) { /* ... no changes needed ... */
        if (indexToRemove < 0 || indexToRemove >= currentModels.length) return;
        const removedModelId = currentModels[indexToRemove]; currentModels.splice(indexToRemove, 1);
        if (removedModelId === currentSelectedModel) { currentSelectedModel = (currentModels.length > 0) ? currentModels[0] : ''; }
        renderModelOptions();
     }
    // --- End Model Selection Functions ---


    // --- Language Selection Functions (Keep existing) ---
    function renderLanguageOptions() { /* ... no changes needed ... */
        languageSelectionArea.innerHTML = ''; // Clear previous

        // 1. Render "No translation needed" option (always first)
        const noTransGroup = document.createElement('div');
        noTransGroup.className = 'option-group language-option no-translate-option'; // Add specific class

        const noTransRadio = document.createElement('input');
        noTransRadio.type = 'radio';
        noTransRadio.name = 'selectedLanguageOption'; // Shared name
        noTransRadio.id = 'langRadio_none';
        noTransRadio.value = NO_TRANSLATION_VALUE; // Special value
        noTransRadio.checked = (currentSelectedLanguageValue === NO_TRANSLATION_VALUE);
        noTransRadio.addEventListener('change', handleLanguageRadioChange); // Add listener

        const noTransLabel = document.createElement('span'); // Use span for non-editable text
        noTransLabel.textContent = 'No translation needed';
        noTransLabel.className = 'language-label-static'; // Class for styling

        noTransGroup.appendChild(noTransRadio);
        noTransGroup.appendChild(noTransLabel);
        languageSelectionArea.appendChild(noTransGroup);

        // 2. Render editable languages from currentAvailableLanguages
        currentAvailableLanguages.forEach((langName, index) => {
            const isChecked = (langName === currentSelectedLanguageValue && langName.trim() !== ''); // Check if this language is selected

            const group = document.createElement('div');
            group.className = 'option-group language-option';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'selectedLanguageOption';
            radio.id = `langRadio_${index}`;
            radio.value = langName; // Value is the language name
            radio.checked = isChecked;
            radio.dataset.index = index;
            radio.disabled = !langName.trim(); // Disable if text is empty
            radio.addEventListener('change', handleLanguageRadioChange);

            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.id = `langText_${index}`;
            textInput.value = langName;
            textInput.placeholder = "Enter Language Name";
            textInput.dataset.index = index;
            textInput.addEventListener('input', handleLanguageTextChange);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = '✕';
            removeBtn.className = 'button remove-button';
            removeBtn.title = 'Remove this language';
            removeBtn.dataset.index = index;
            removeBtn.addEventListener('click', handleLanguageRemoveClick);

            group.appendChild(radio);
            group.appendChild(textInput);
            group.appendChild(removeBtn);
            languageSelectionArea.appendChild(group);
        });
     }
    function handleLanguageRadioChange(event) { /* ... no changes needed ... */
        const selectedValue = event.target.value;
        if (event.target.checked) {
            if (selectedValue === NO_TRANSLATION_VALUE) {
                currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
                console.log("Language selection changed to: No Translation");
            } else {
                // Check if corresponding text input is valid
                const index = parseInt(event.target.dataset.index, 10);
                const textInput = document.getElementById(`langText_${index}`);
                if (textInput && textInput.value.trim()) {
                    currentSelectedLanguageValue = textInput.value.trim();
                    console.log("Language selection changed to:", currentSelectedLanguageValue);
                } else {
                    // Prevent selecting radio with empty text
                    event.target.checked = false;
                    // Re-check previously selected valid option
                    const previousRadio = languageSelectionArea.querySelector(`input[type="radio"][value="${currentSelectedLanguageValue}"]`) || document.getElementById('langRadio_none');
                    if (previousRadio) previousRadio.checked = true;
                }
            }
        }
     }
    function handleLanguageTextChange(event) { /* ... no changes needed ... */
        const newLangName = event.target.value.trim();
        const idx = parseInt(event.target.dataset.index, 10);

        if (idx >= 0 && idx < currentAvailableLanguages.length) {
            currentAvailableLanguages[idx] = newLangName; // Update state array
        }

        const associatedRadio = document.getElementById(`langRadio_${idx}`);
        if (associatedRadio) {
            associatedRadio.value = newLangName; // Update radio value
            associatedRadio.disabled = !newLangName; // Disable if empty

            if (associatedRadio.checked) {
                // If the currently selected item's text changed
                currentSelectedLanguageValue = newLangName; // Update global state
                console.log("Selected language updated via text input to:", currentSelectedLanguageValue);
                if (!newLangName) { // If cleared, default back to "No translation"
                    associatedRadio.checked = false;
                    document.getElementById('langRadio_none').checked = true;
                    currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
                }
            }
        }
     }
    function handleLanguageRemoveClick(event) { removeLanguage(parseInt(event.target.dataset.index, 10)); }
    function addLanguage() { /* ... no changes needed ... */
        currentAvailableLanguages.push(""); // Add empty entry
        renderLanguageOptions(); // Re-render
        const newIndex = currentAvailableLanguages.length - 1;
        const newInput = document.getElementById(`langText_${newIndex}`);
        if (newInput) { newInput.focus(); } // Focus new input
     }
    function removeLanguage(indexToRemove) { /* ... no changes needed ... */
        if (indexToRemove < 0 || indexToRemove >= currentAvailableLanguages.length) return;

        const removedLang = currentAvailableLanguages[indexToRemove];
        currentAvailableLanguages.splice(indexToRemove, 1); // Remove from state

        // If the removed language was the selected one, default to "No translation"
        if (removedLang === currentSelectedLanguageValue) {
            currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
        }
        renderLanguageOptions(); // Re-render
     }
    // --- End Language Selection Functions ---


    /**
     * Loads settings from chrome.storage.sync and populates the form.
     */
    function loadSettings() { /* ... no changes needed ... */
        console.log("Loading settings...");
        chrome.storage.sync.get([
            'apiKey', 'model', 'models', 'debug', 'bulletCount',
            'translate', 'translateLanguage', 'availableLanguages' // Load new key
        ], (data) => {
            console.log("Loaded data:", data);
            apiKeyInput.value = data.apiKey || '';
            debugCheckbox.checked = !!data.debug;

            // Bullet count
            let countValue = data.bulletCount || DEFAULT_BULLET_COUNT;
            let bulletSet = false;
            bulletCountRadios.forEach(radio => { if (radio.value === countValue) { radio.checked = true; bulletSet = true; } else { radio.checked = false; } });
            if (!bulletSet) { document.querySelector(`input[name="bulletCount"][value="${DEFAULT_BULLET_COUNT}"]`).checked = true; }

            // --- Model Loading ---
            currentModels = (Array.isArray(data.models) && data.models.length > 0) ? data.models.filter(m => typeof m === 'string' && m.trim() !== '') : [...DEFAULT_MODELS];
            if (currentModels.length === 0) { currentModels = [...DEFAULT_MODELS]; } // Reset if filter resulted in empty
            const storedSelectedModel = data.model;
            if (storedSelectedModel && currentModels.includes(storedSelectedModel)) { currentSelectedModel = storedSelectedModel; }
            else if (currentModels.length > 0) { currentSelectedModel = currentModels[0]; }
            else { currentSelectedModel = ''; }
            console.log("Loaded models:", currentModels, "Selected:", currentSelectedModel);
            renderModelOptions();

            // --- Language Loading ---
            currentAvailableLanguages = (Array.isArray(data.availableLanguages) && data.availableLanguages.length > 0) ? data.availableLanguages.filter(l => typeof l === 'string') : [...DEFAULT_LANGUAGES]; // Use defaults if not found/invalid
             if (currentAvailableLanguages.length === 0 && (!Array.isArray(data.availableLanguages) || data.availableLanguages.length === 0)) {
                 // If stored was explicitly empty or invalid, still start with defaults
                 currentAvailableLanguages = [...DEFAULT_LANGUAGES];
             }

            // Determine selected language value based on stored 'translate' and 'translateLanguage'
            const storedTranslate = ('translate' in data) ? !!data.translate : false; // Default translate to false
            const storedLang = data.translateLanguage;

            if (!storedTranslate || storedLang === NO_TRANSLATION_VALUE) {
                currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
            } else if (storedLang && currentAvailableLanguages.includes(storedLang)) {
                // Select stored language only if it exists in the available list
                currentSelectedLanguageValue = storedLang;
            } else {
                 // If stored language isn't in the list (or was invalid), default to no translation
                 currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
                 if (storedTranslate && storedLang) {
                     console.warn(`Stored language "${storedLang}" not found in available languages. Defaulting to no translation.`);
                 }
            }
            console.log("Loaded available languages:", currentAvailableLanguages, "Selected value:", currentSelectedLanguageValue);
            renderLanguageOptions(); // Render the dynamic language list

            console.log("Settings loaded.");
        });
     }

    /**
     * Saves the current settings to chrome.storage.sync.
     */
    function saveSettings() { /* ... no changes needed ... */
        console.log("Saving settings...");
        const apiKey = apiKeyInput.value.trim(); // Read API key from input
        const debug = debugCheckbox.checked;
        let bulletCount = DEFAULT_BULLET_COUNT;
        document.querySelectorAll('input[name="bulletCount"]').forEach(radio => { if (radio.checked) bulletCount = radio.value; });

        // --- Model Saving ---
        const modelsToSave = currentModels.map(m => m.trim()).filter(m => m !== '');
        let finalSelectedModel = '';
        if (currentSelectedModel && modelsToSave.includes(currentSelectedModel)) { finalSelectedModel = currentSelectedModel; }
        else if (modelsToSave.length > 0) { finalSelectedModel = modelsToSave[0]; }
        console.log("Saving models:", modelsToSave, "Selected:", finalSelectedModel);

        // --- Language Saving ---
        const languagesToSave = currentAvailableLanguages.map(l => l.trim()).filter(l => l !== ''); // Filter empty
        let finalTranslate = false;
        let finalTranslateLanguage = NO_TRANSLATION_VALUE;

        if (currentSelectedLanguageValue !== NO_TRANSLATION_VALUE && languagesToSave.includes(currentSelectedLanguageValue)) {
            // If a specific language is selected AND it's valid (not empty/removed)
            finalTranslate = true;
            finalTranslateLanguage = currentSelectedLanguageValue;
        } else {
            // Otherwise, translation is off
            finalTranslate = false;
            finalTranslateLanguage = NO_TRANSLATION_VALUE; // Save 'none' for clarity
        }
        console.log("Saving available languages:", languagesToSave, "Translate:", finalTranslate, "Target:", finalTranslateLanguage);


        chrome.storage.sync.set({
            apiKey, // Save the currently entered API key
            model: finalSelectedModel,
            models: modelsToSave,
            debug,
            bulletCount,
            translate: finalTranslate,
            translateLanguage: finalTranslateLanguage,
            availableLanguages: languagesToSave
        }, () => {
            if (chrome.runtime.lastError) {
                statusMessage.textContent = `Error saving: ${chrome.runtime.lastError.message}`;
                statusMessage.className = 'status-message error';
                console.error("Error saving settings:", chrome.runtime.lastError);
            } else {
                statusMessage.textContent = 'Options saved!';
                statusMessage.className = 'status-message success';
                console.log("Options saved successfully.");
                // Reload settings locally AFTER save to reflect any cleanup/validation
                // loadSettings(); // Re-loading might be slightly confusing here, maybe only on explicit load?
            }
            setTimeout(() => {
                statusMessage.textContent = '';
                statusMessage.className = 'status-message';
            }, 2000);
        });
     }

    // --- Reset Function (NEW) ---
    function resetToDefaults() {
        console.log("Resetting options to defaults (excluding API key)...");

        // 1. Reset State Variables (excluding API key input value)
        currentModels = [...DEFAULT_MODELS];
        currentSelectedModel = DEFAULT_SELECTED_MODEL;
        currentAvailableLanguages = [...DEFAULT_LANGUAGES];
        currentSelectedLanguageValue = NO_TRANSLATION_VALUE;

        // 2. Update UI Elements to Reflect Defaults
        // Models & Languages
        renderModelOptions();
        renderLanguageOptions();

        // Bullet Points
        bulletCountRadios.forEach(radio => {
            radio.checked = (radio.value === DEFAULT_BULLET_COUNT);
        });

        // Debug Checkbox
        debugCheckbox.checked = DEFAULT_DEBUG_MODE;

        // 3. Save the Reset State (this will preserve the API key from the input field)
        saveSettings(); // Call save to persist the reset defaults

        // 4. Update Status Message (optional, saveSettings already does this)
        statusMessage.textContent = 'Defaults Reset & Saved!';
        statusMessage.className = 'status-message success';
         setTimeout(() => {
             statusMessage.textContent = '';
             statusMessage.className = 'status-message';
         }, 2500); // Slightly longer timeout for reset message
    }


    // --- Event Listeners ---
    saveButton.addEventListener('click', saveSettings);
    addModelBtn.addEventListener('click', addModel);
    addLangBtn.addEventListener('click', addLanguage);

    // New listener for Reset button
    resetButton.addEventListener('click', () => {
        // Ask for confirmation
        if (confirm("Are you sure you want to reset all options (except API key) to their defaults?")) {
            resetToDefaults();
        }
    });

    // --- Initial Load ---
    loadSettings();
});
