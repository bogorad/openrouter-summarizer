/* options.js */
// v2.3.2 - Added options validation on load.

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
    const DEFAULT_LANGUAGES = [
        "English", "Spanish", "French", "Mandarin", "Arabic", "Hebrew", "Russian", "German"
    ];
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
    const DEFAULT_TRANSLATION_TEMPLATE = `Translate the JSON array of HTML strings you created into \${langName}. Drop the original summary, only return the translated JSON array. Ensure the translated strings retain the same HTML formatting (only <b> and <i> tags allowed). Ensure the output is valid JSON.`;
    const DEFAULT_FORMAT_INSTRUCTIONS = `Each point should be a concise HTML string, starting with a bold tag-like marker and a colon, followed by the description.
You may use ONLY the following HTML tags for emphasis: <b> for bold and <i> for italics. Do not use any other HTML tags (like <p>, <ul>, <li>, <br>, etc.).
For example: "<b>Key Finding:</b> The market showed <i>significant</i> growth in Q3."
After providing bullet points for article summary, add a bonus one - your insights, assessment and comments, and what should a mindful reader notice about this. Call it <b>Summarizer Insight</b>.`;
    // --- End Centralized Prompt Definitions ---


    // --- State Variables ---
    let currentModels = [];
    let currentSelectedModel = '';
    let currentAvailableLanguages = [];
    let currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
    let currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS; // Tracks the value in the textarea


    // --- Functions ---

    // --- Model Selection Functions ---
    function renderModelOptions() {
        if (!modelSelectionArea) return;
        modelSelectionArea.innerHTML = '';
        if (!currentModels || currentModels.length === 0) {
            modelSelectionArea.innerHTML = '<p>No models configured. Add one below or save to use defaults.</p>'; return;
        }
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
                event.target.checked = false;
                const previousValidRadio = modelSelectionArea.querySelector(`input[type="radio"][value="${currentSelectedModel}"]:not(:disabled)`);
                if (previousValidRadio) { previousValidRadio.checked = true; }
                else { const firstValidRadio = modelSelectionArea.querySelector('input[type="radio"]:not(:disabled)'); if (firstValidRadio) { firstValidRadio.checked = true; currentSelectedModel = firstValidRadio.value; } else { currentSelectedModel = ''; } }
            }
        }
     }
    function handleModelTextChange(event) {
        const newModelId = event.target.value.trim(); const idx = parseInt(event.target.dataset.index, 10);
        if (idx >= 0 && idx < currentModels.length) { currentModels[idx] = newModelId; }
        const associatedRadio = document.getElementById(`modelRadio_${idx}`);
        if (associatedRadio) {
            associatedRadio.value = newModelId; associatedRadio.disabled = !newModelId;
            if (associatedRadio.checked) {
                currentSelectedModel = newModelId; console.log("Selected model ID updated via text input to:", currentSelectedModel);
                if (!newModelId) {
                    associatedRadio.checked = false; currentSelectedModel = ''; const firstValidRadio = modelSelectionArea.querySelector('input[type="radio"]:not(:disabled)');
                    if (firstValidRadio) { firstValidRadio.checked = true; currentSelectedModel = firstValidRadio.value; }
                }
            }
        }
     }
    function handleModelRemoveClick(event) { removeModel(parseInt(event.target.dataset.index, 10)); }
    function addModel() { currentModels.push(""); renderModelOptions(); const newIndex = currentModels.length - 1; const newInput = document.getElementById(`modelText_${newIndex}`); if (newInput) { newInput.focus(); } }
    function removeModel(indexToRemove) {
        if (indexToRemove < 0 || indexToRemove >= currentModels.length) return;
        const removedModelId = currentModels[indexToRemove]; currentModels.splice(indexToRemove, 1);
        if (removedModelId === currentSelectedModel) { const firstValidModel = currentModels.find(m => m.trim() !== ''); currentSelectedModel = firstValidModel || ''; }
        renderModelOptions();
     }
    // --- End Model Selection Functions ---


    // --- Language Selection Functions ---
    function renderLanguageOptions() {
        if (!languageSelectionArea) return;
        languageSelectionArea.innerHTML = '';
        if (currentSelectedLanguageValue !== NO_TRANSLATION_VALUE && !currentAvailableLanguages.includes(currentSelectedLanguageValue)) { console.warn(`Selected language "${currentSelectedLanguageValue}" not in list, defaulting to "${NO_TRANSLATION_VALUE}" for render.`); currentSelectedLanguageValue = NO_TRANSLATION_VALUE; }
        const noTransGroup = document.createElement('div'); noTransGroup.className = 'option-group language-option no-translate-option'; const noTransRadio = document.createElement('input'); noTransRadio.type = 'radio'; noTransRadio.name = 'selectedLanguageOption'; noTransRadio.id = 'langRadio_none'; noTransRadio.value = NO_TRANSLATION_VALUE; noTransRadio.checked = (currentSelectedLanguageValue === NO_TRANSLATION_VALUE); noTransRadio.addEventListener('change', handleLanguageRadioChange); const noTransLabel = document.createElement('span'); noTransLabel.textContent = 'No translation needed'; noTransLabel.className = 'language-label-static'; noTransGroup.appendChild(noTransRadio); noTransGroup.appendChild(noTransLabel); languageSelectionArea.appendChild(noTransGroup);
        currentAvailableLanguages.forEach((langName, index) => {
            const isChecked = (langName === currentSelectedLanguageValue && langName.trim() !== ''); const group = document.createElement('div'); group.className = 'option-group language-option'; const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'selectedLanguageOption'; radio.id = `langRadio_${index}`; radio.value = langName; radio.checked = isChecked; radio.dataset.index = index; radio.disabled = !langName.trim(); radio.addEventListener('change', handleLanguageRadioChange); const textInput = document.createElement('input'); textInput.type = 'text'; textInput.id = `langText_${index}`; textInput.value = langName; textInput.placeholder = "Enter Language Name"; textInput.dataset.index = index; textInput.addEventListener('input', handleLanguageTextChange); const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.textContent = '✕'; removeBtn.className = 'button remove-button'; removeBtn.title = 'Remove this language'; removeBtn.dataset.index = index; removeBtn.addEventListener('click', handleLanguageRemoveClick); group.appendChild(radio); group.appendChild(textInput); group.appendChild(removeBtn); languageSelectionArea.appendChild(group);
        });
     }
    function handleLanguageRadioChange(event) {
        const selectedValue = event.target.value;
        if (event.target.checked) {
            if (selectedValue === NO_TRANSLATION_VALUE) { currentSelectedLanguageValue = NO_TRANSLATION_VALUE; console.log("Lang selection: No Translation"); }
            else { const index = parseInt(event.target.dataset.index, 10); const textInput = document.getElementById(`langText_${index}`); if (textInput && textInput.value.trim()) { currentSelectedLanguageValue = textInput.value.trim(); console.log("Lang selection:", currentSelectedLanguageValue); } else { event.target.checked = false; const previousRadio = languageSelectionArea.querySelector(`input[type="radio"][value="${currentSelectedLanguageValue}"]`) || document.getElementById('langRadio_none'); if (previousRadio) previousRadio.checked = true; return; } }
            updatePromptPreview();
        }
     }
    function handleLanguageTextChange(event) {
        const newLangName = event.target.value.trim(); const idx = parseInt(event.target.dataset.index, 10);
        if (idx >= 0 && idx < currentAvailableLanguages.length) { currentAvailableLanguages[idx] = newLangName; }
        const associatedRadio = document.getElementById(`langRadio_${idx}`);
        if (associatedRadio) {
            associatedRadio.value = newLangName; associatedRadio.disabled = !newLangName;
            if (associatedRadio.checked) { currentSelectedLanguageValue = newLangName; console.log("Selected lang updated via text:", currentSelectedLanguageValue); if (!newLangName) { associatedRadio.checked = false; document.getElementById('langRadio_none').checked = true; currentSelectedLanguageValue = NO_TRANSLATION_VALUE; } updatePromptPreview(); }
        }
     }
    function handleLanguageRemoveClick(event) { removeLanguage(parseInt(event.target.dataset.index, 10)); }
    function addLanguage() { currentAvailableLanguages.push(""); renderLanguageOptions(); const newIndex = currentAvailableLanguages.length - 1; const newInput = document.getElementById(`langText_${newIndex}`); if (newInput) { newInput.focus(); } }
    function removeLanguage(indexToRemove) {
        if (indexToRemove < 0 || indexToRemove >= currentAvailableLanguages.length) return;
        const removedLang = currentAvailableLanguages[indexToRemove]; currentAvailableLanguages.splice(indexToRemove, 1);
        if (removedLang === currentSelectedLanguageValue) { currentSelectedLanguageValue = NO_TRANSLATION_VALUE; }
        renderLanguageOptions(); updatePromptPreview();
     }
    // --- End Language Selection Functions ---

    // --- Prompt Preview Function ---
    function updatePromptPreview() {
        console.log("Updating prompt preview...");
        let bulletCount = DEFAULT_BULLET_COUNT;
        document.querySelectorAll('input[name="bulletCount"]').forEach(radio => { if (radio.checked) bulletCount = radio.value; });
        const bulletWord = NUM_TO_WORD[bulletCount] || "five";

        if (promptPreambleDiv) promptPreambleDiv.textContent = DEFAULT_PREAMBLE_TEMPLATE.replace('${bulletWord}', bulletWord);
        if (promptPostambleDiv) promptPostambleDiv.textContent = DEFAULT_POSTAMBLE_TEXT;

        let translationText = "";
        if (currentSelectedLanguageValue !== NO_TRANSLATION_VALUE) {
            const selectedLangIsValid = currentAvailableLanguages.includes(currentSelectedLanguageValue);
            if (selectedLangIsValid) {
                translationText = DEFAULT_TRANSLATION_TEMPLATE.replace('${langName}', currentSelectedLanguageValue);
            } else {
                console.warn("Selected language for preview not found.");
            }
        }
        if (promptTranslationPreviewDiv) promptTranslationPreviewDiv.textContent = translationText;

        if (promptFormatInstructionsTextarea) promptFormatInstructionsTextarea.value = currentCustomFormatInstructions;
    }


    /** Loads settings and populates the form, WITH VALIDATION. */
    function loadSettings() {
        console.log("Loading settings...");
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
            // --- Start of Async Callback ---
            if (chrome.runtime.lastError) {
                console.error("Error loading settings:", chrome.runtime.lastError);
                statusMessage.textContent = `Error loading settings: ${chrome.runtime.lastError.message}`;
                statusMessage.className = 'status-message error';
                alert(`Critical Error loading settings:\n${chrome.runtime.lastError.message}\n\nPlease try saving the options again.`);
            } else {
                console.log("Loaded data:", data);
            }

            // --- Validate loaded settings ---
            let validationErrors = [];
            const loadedApiKey = data.apiKey;
            const loadedModel = data.model;
            const loadedModels = data.models;
            const loadedPreamble = data[PROMPT_STORAGE_KEY_PREAMBLE];
            const loadedPostamble = data[PROMPT_STORAGE_KEY_POSTAMBLE];
            const loadedDefaultFormat = data[PROMPT_STORAGE_KEY_DEFAULT_FORMAT];
            const loadedTranslate = data.translate;
            const loadedTranslationTemplate = data[PROMPT_STORAGE_KEY_TRANSLATION];

            if (!loadedApiKey || typeof loadedApiKey !== 'string' || loadedApiKey.trim() === '') {
                validationErrors.push("API Key is missing.");
            }
            if (!loadedModel || typeof loadedModel !== 'string' || loadedModel.trim() === '') {
                validationErrors.push("Default Model selection is missing.");
            }
            // Ensure models is an array of non-empty strings
            if (!Array.isArray(loadedModels) || loadedModels.length === 0 || !loadedModels.every(m => typeof m === 'string' && m.trim() !== '')) {
                validationErrors.push("Models list is missing, empty, or invalid (should be array of strings).");
            }
            if (!loadedPreamble || typeof loadedPreamble !== 'string' || loadedPreamble.trim() === '') {
                validationErrors.push("Core Prompt Preamble is missing from storage.");
            }
            if (!loadedPostamble || typeof loadedPostamble !== 'string' || loadedPostamble.trim() === '') {
                validationErrors.push("Core Prompt Postamble is missing from storage.");
            }
            if (!loadedDefaultFormat || typeof loadedDefaultFormat !== 'string' || loadedDefaultFormat.trim() === '') {
                validationErrors.push("Core Default Format Instructions are missing from storage.");
            }
            if (loadedTranslate === true && (!loadedTranslationTemplate || typeof loadedTranslationTemplate !== 'string' || loadedTranslationTemplate.trim() === '')) {
                validationErrors.push("Translation Template is missing from storage (required when translation is enabled).");
            }

            if (validationErrors.length > 0) {
                console.warn("[Options Load] Validation failed for stored settings:", validationErrors);
                let errorMsg = "Warning: Problems detected with stored settings!\n\n";
                errorMsg += validationErrors.join("\n");
                errorMsg += "\n\nPlease review the options below and click 'Save Options' to store potentially corrected or default values.";
                alert(errorMsg);
                statusMessage.textContent = `Validation issues found! Review and Save.`;
                statusMessage.className = 'status-message error';
            }
            // --- END: Validation ---


            // --- Populate UI (using loaded data or defaults) ---
            if (apiKeyInput) apiKeyInput.value = loadedApiKey || '';
            if (debugCheckbox) debugCheckbox.checked = !!data.debug || DEFAULT_DEBUG_MODE;

            let countValue = data.bulletCount || DEFAULT_BULLET_COUNT;
            let bulletSet = false;
            bulletCountRadios.forEach(radio => { if (radio.value === countValue) { radio.checked = true; bulletSet = true; } else { radio.checked = false; } });
            if (!bulletSet) { const defaultBulletRadio = document.querySelector(`input[name="bulletCount"][value="${DEFAULT_BULLET_COUNT}"]`); if (defaultBulletRadio) defaultBulletRadio.checked = true; }

            // Use loaded models if valid, otherwise defaults
            currentModels = (Array.isArray(loadedModels) && loadedModels.length > 0 && loadedModels.every(m => typeof m === 'string'))
                            ? loadedModels.filter(m => m.trim() !== '')
                            : [...DEFAULT_MODELS];
            if (currentModels.length === 0) currentModels = [...DEFAULT_MODELS];

            const storedSelectedModel = loadedModel;
            if (storedSelectedModel && currentModels.includes(storedSelectedModel)) {
                currentSelectedModel = storedSelectedModel;
            } else if (currentModels.length > 0) {
                currentSelectedModel = currentModels[0];
            } else {
                currentSelectedModel = '';
            }
            renderModelOptions();

            // Use loaded languages if valid, otherwise defaults
            currentAvailableLanguages = (Array.isArray(data.availableLanguages) && data.availableLanguages.length > 0 && data.availableLanguages.every(l => typeof l === 'string'))
                                        ? data.availableLanguages
                                        : [...DEFAULT_LANGUAGES];
            if (currentAvailableLanguages.length === 0) currentAvailableLanguages = [...DEFAULT_LANGUAGES];

            const storedTranslate = ('translate' in data) ? !!data.translate : false;
            const storedLang = data.translateLanguage;
            if (!storedTranslate || storedLang === NO_TRANSLATION_VALUE) {
                currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
            } else if (storedLang && currentAvailableLanguages.includes(storedLang)) {
                currentSelectedLanguageValue = storedLang;
            } else {
                currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
                if (storedTranslate && storedLang) { console.warn(`Stored language "${storedLang}" not found in available list.`); }
            }
            renderLanguageOptions();

            // Load custom instructions, falling back to the LOADED default, then the HARDCODED default
            const savedDefaultFormat = loadedDefaultFormat || DEFAULT_FORMAT_INSTRUCTIONS;
            currentCustomFormatInstructions = data[PROMPT_STORAGE_KEY_CUSTOM_FORMAT] || savedDefaultFormat;
            if (promptFormatInstructionsTextarea) { promptFormatInstructionsTextarea.value = currentCustomFormatInstructions; }

            updatePromptPreview();
            console.log("Settings loaded and UI populated.");
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
        const customFormatInstructionsToSave = promptFormatInstructionsTextarea ? promptFormatInstructionsTextarea.value : currentCustomFormatInstructions;

        const modelsToSave = currentModels.map(m => m.trim()).filter(m => m !== '');
        let finalSelectedModel = '';
        if (currentSelectedModel && modelsToSave.includes(currentSelectedModel)) { finalSelectedModel = currentSelectedModel; }
        else if (modelsToSave.length > 0) { finalSelectedModel = modelsToSave[0]; }

        const languagesToSave = currentAvailableLanguages.map(l => l.trim()).filter(l => l !== '');
        let finalTranslate = false; let finalTranslateLanguage = NO_TRANSLATION_VALUE;
        if (currentSelectedLanguageValue !== NO_TRANSLATION_VALUE && languagesToSave.includes(currentSelectedLanguageValue)) { finalTranslate = true; finalTranslateLanguage = currentSelectedLanguageValue; }
        else { finalTranslate = false; finalTranslateLanguage = NO_TRANSLATION_VALUE; }

        const settingsToSave = {
            apiKey, model: finalSelectedModel, models: modelsToSave, debug, bulletCount,
            translate: finalTranslate, translateLanguage: finalTranslateLanguage,
            availableLanguages: languagesToSave,
            [PROMPT_STORAGE_KEY_CUSTOM_FORMAT]: customFormatInstructionsToSave,
            [PROMPT_STORAGE_KEY_PREAMBLE]: DEFAULT_PREAMBLE_TEMPLATE,
            [PROMPT_STORAGE_KEY_POSTAMBLE]: DEFAULT_POSTAMBLE_TEXT,
            [PROMPT_STORAGE_KEY_TRANSLATION]: DEFAULT_TRANSLATION_TEMPLATE,
            [PROMPT_STORAGE_KEY_DEFAULT_FORMAT]: DEFAULT_FORMAT_INSTRUCTIONS
        };
        console.log("Saving data:", settingsToSave);
        chrome.storage.sync.set(settingsToSave, () => {
            if (chrome.runtime.lastError) { statusMessage.textContent = `Error saving: ${chrome.runtime.lastError.message}`; statusMessage.className = 'status-message error'; console.error("Error saving settings:", chrome.runtime.lastError); }
            else { statusMessage.textContent = 'Options saved!'; statusMessage.className = 'status-message success'; console.log("Options saved successfully."); }
            setTimeout(() => { if (statusMessage) { statusMessage.textContent = ''; statusMessage.className = 'status-message'; } }, 2000);
        });
     }

    /** Resets settings to defaults (excluding API key). */
    function resetToDefaults() {
        console.log("Resetting options to defaults (excluding API key)...");
        currentModels = [...DEFAULT_MODELS]; currentSelectedModel = DEFAULT_SELECTED_MODEL;
        currentAvailableLanguages = [...DEFAULT_LANGUAGES]; currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
        currentCustomFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
        renderModelOptions(); renderLanguageOptions();
        bulletCountRadios.forEach(radio => { radio.checked = (radio.value === DEFAULT_BULLET_COUNT); });
        if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
        updatePromptPreview();
        saveSettings();
        if (statusMessage) {
            statusMessage.textContent = 'Defaults Reset & Saved!'; statusMessage.className = 'status-message success';
            setTimeout(() => { statusMessage.textContent = ''; statusMessage.className = 'status-message'; }, 2500);
        }
    }

    // --- Collapsible Section Logic ---
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
        };
        advancedOptionsToggle.addEventListener('click', toggleSection);
        advancedOptionsToggle.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSection(); } });
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


    // --- Initial Load & Setup ---
    loadSettings(); // Load settings first (now includes validation)
    setupCollapsible(); // Then setup the collapsible section interaction

});
