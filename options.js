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
    const PROMPT_STORAGE_KEY = 'prompt_custom_format_instructions';
    const DEFAULT_FORMAT_INSTRUCTIONS = `Each bullet point should start with a bold tag-like marker and a colon, followed by the description. Use Markdown for the bold tag.
For example: **Other countries too**: It's not just Canadian situation, same was observed all over Asia.`;
    const PROMPT_PREAMBLE_TEXT = (bulletWord) => `Input is raw HTML. Treat it as article_text.
Using US English, prepare a summary of article_text in ${bulletWord} bullet points.`;
    const PROMPT_TRANSLATION_TEXT = (langName) => `Translate the Markdown summary you created into ${langName}. Drop the original summary, only return the translated Markdown summary. Ensure the translated summary retains the same Markdown formatting (bold tags, newlines).`;
    const PROMPT_POSTAMBLE_TEXT = `Separate each bullet point with a newline character.
Format the entire summary as a single Markdown string.
Do not add any comments before or after the Markdown summary. Do not output your deliberations.
Just provide the requested Markdown summary string as the result.`;
    const NUM_TO_WORD = { 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };


    // --- State Variables ---
    let currentModels = [];
    let currentSelectedModel = '';
    let currentAvailableLanguages = [];
    let currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
    let currentFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;


    // --- Functions ---

    // --- Model Selection Functions ---
    function renderModelOptions() {
        if (!modelSelectionArea) return; // Safety check
        modelSelectionArea.innerHTML = '';
        if (!currentModels || currentModels.length === 0) {
            modelSelectionArea.innerHTML = '<p>No models configured. Add one below or save to use defaults.</p>'; return;
        }
        // Ensure currentSelectedModel is valid before rendering
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
        if (!languageSelectionArea) return; // Safety check
        languageSelectionArea.innerHTML = '';
        if (currentSelectedLanguageValue !== NO_TRANSLATION_VALUE && !currentAvailableLanguages.includes(currentSelectedLanguageValue)) { console.warn(`Selected language "${currentSelectedLanguageValue}" not in list, defaulting to "${NO_TRANSLATION_VALUE}" for render.`); currentSelectedLanguageValue = NO_TRANSLATION_VALUE; }

        // 1. Render "No translation needed" option
        const noTransGroup = document.createElement('div'); noTransGroup.className = 'option-group language-option no-translate-option'; const noTransRadio = document.createElement('input'); noTransRadio.type = 'radio'; noTransRadio.name = 'selectedLanguageOption'; noTransRadio.id = 'langRadio_none'; noTransRadio.value = NO_TRANSLATION_VALUE; noTransRadio.checked = (currentSelectedLanguageValue === NO_TRANSLATION_VALUE); noTransRadio.addEventListener('change', handleLanguageRadioChange); const noTransLabel = document.createElement('span'); noTransLabel.textContent = 'No translation needed'; noTransLabel.className = 'language-label-static'; noTransGroup.appendChild(noTransRadio); noTransGroup.appendChild(noTransLabel); languageSelectionArea.appendChild(noTransGroup);
        // 2. Render editable languages
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
        if (promptPreambleDiv) promptPreambleDiv.textContent = PROMPT_PREAMBLE_TEXT(bulletWord);

        let translationText = "";
        if (currentSelectedLanguageValue !== NO_TRANSLATION_VALUE) {
            const selectedLangIsValid = currentAvailableLanguages.includes(currentSelectedLanguageValue);
            if (selectedLangIsValid) { translationText = PROMPT_TRANSLATION_TEXT(currentSelectedLanguageValue); }
            else { console.warn("Selected language for preview not found."); }
        }
        if (promptTranslationPreviewDiv) promptTranslationPreviewDiv.textContent = translationText;
        if (promptPostambleDiv) promptPostambleDiv.textContent = PROMPT_POSTAMBLE_TEXT;
        // Update textarea value from state (in case of reset)
        if (promptFormatInstructionsTextarea) promptFormatInstructionsTextarea.value = currentFormatInstructions;
    }


    /** Loads settings and populates the form. */
    function loadSettings() {
        console.log("Loading settings...");
        chrome.storage.sync.get([
            'apiKey', 'model', 'models', 'debug', 'bulletCount',
            'translate', 'translateLanguage', 'availableLanguages',
            PROMPT_STORAGE_KEY
        ], (data) => {
            console.log("Loaded data:", data);
            // Ensure elements exist before setting values
            if (apiKeyInput) apiKeyInput.value = data.apiKey || '';
            if (debugCheckbox) debugCheckbox.checked = !!data.debug || DEFAULT_DEBUG_MODE;

            // Bullet count
            let countValue = data.bulletCount || DEFAULT_BULLET_COUNT;
            let bulletSet = false;
            bulletCountRadios.forEach(radio => { if (radio.value === countValue) { radio.checked = true; bulletSet = true; } else { radio.checked = false; } });
            if (!bulletSet) { const defaultBulletRadio = document.querySelector(`input[name="bulletCount"][value="${DEFAULT_BULLET_COUNT}"]`); if (defaultBulletRadio) defaultBulletRadio.checked = true; }

            // --- Model Loading ---
            currentModels = (Array.isArray(data.models) && data.models.length > 0) ? data.models.filter(m => typeof m === 'string' && m.trim() !== '') : [...DEFAULT_MODELS];
            if (currentModels.length === 0) { currentModels = [...DEFAULT_MODELS]; }
            const storedSelectedModel = data.model;
            if (storedSelectedModel && currentModels.includes(storedSelectedModel)) { currentSelectedModel = storedSelectedModel; }
            else if (currentModels.length > 0) { currentSelectedModel = currentModels[0]; }
            else { currentSelectedModel = ''; }
            renderModelOptions(); // Render models

            // --- Language Loading ---
            currentAvailableLanguages = (Array.isArray(data.availableLanguages) && data.availableLanguages.length > 0) ? data.availableLanguages.filter(l => typeof l === 'string') : [...DEFAULT_LANGUAGES];
             if (currentAvailableLanguages.length === 0 && (!Array.isArray(data.availableLanguages) || data.availableLanguages.length === 0)) { currentAvailableLanguages = [...DEFAULT_LANGUAGES]; }
            const storedTranslate = ('translate' in data) ? !!data.translate : false;
            const storedLang = data.translateLanguage;
            if (!storedTranslate || storedLang === NO_TRANSLATION_VALUE) { currentSelectedLanguageValue = NO_TRANSLATION_VALUE; }
            else if (storedLang && currentAvailableLanguages.includes(storedLang)) { currentSelectedLanguageValue = storedLang; }
            else { currentSelectedLanguageValue = NO_TRANSLATION_VALUE; if (storedTranslate && storedLang) { console.warn(`Stored language "${storedLang}" not found.`); } }
            renderLanguageOptions(); // Render languages

            // --- Prompt Instructions Loading ---
            currentFormatInstructions = data[PROMPT_STORAGE_KEY] || DEFAULT_FORMAT_INSTRUCTIONS;
            if (promptFormatInstructionsTextarea) { promptFormatInstructionsTextarea.value = currentFormatInstructions; }

            // --- Initial Prompt Preview ---
            updatePromptPreview(); // Update preview after all settings loaded

            console.log("Settings loaded.");
        });
     }

    /** Saves the current settings. */
    function saveSettings() {
        console.log("Saving settings...");
        // Read current values from UI elements
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        const debug = debugCheckbox ? debugCheckbox.checked : false;
        let bulletCount = DEFAULT_BULLET_COUNT;
        document.querySelectorAll('input[name="bulletCount"]').forEach(radio => { if (radio.checked) bulletCount = radio.value; });
        const formatInstructionsToSave = promptFormatInstructionsTextarea ? promptFormatInstructionsTextarea.value : currentFormatInstructions;

        // --- Model Saving ---
        const modelsToSave = currentModels.map(m => m.trim()).filter(m => m !== '');
        let finalSelectedModel = '';
        if (currentSelectedModel && modelsToSave.includes(currentSelectedModel)) { finalSelectedModel = currentSelectedModel; }
        else if (modelsToSave.length > 0) { finalSelectedModel = modelsToSave[0]; }

        // --- Language Saving ---
        const languagesToSave = currentAvailableLanguages.map(l => l.trim()).filter(l => l !== '');
        let finalTranslate = false; let finalTranslateLanguage = NO_TRANSLATION_VALUE;
        if (currentSelectedLanguageValue !== NO_TRANSLATION_VALUE && languagesToSave.includes(currentSelectedLanguageValue)) { finalTranslate = true; finalTranslateLanguage = currentSelectedLanguageValue; }
        else { finalTranslate = false; finalTranslateLanguage = NO_TRANSLATION_VALUE; }

        const settingsToSave = {
            apiKey, model: finalSelectedModel, models: modelsToSave, debug, bulletCount,
            translate: finalTranslate, translateLanguage: finalTranslateLanguage,
            availableLanguages: languagesToSave, [PROMPT_STORAGE_KEY]: formatInstructionsToSave
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
        // 1. Reset State Variables
        currentModels = [...DEFAULT_MODELS]; currentSelectedModel = DEFAULT_SELECTED_MODEL;
        currentAvailableLanguages = [...DEFAULT_LANGUAGES]; currentSelectedLanguageValue = NO_TRANSLATION_VALUE;
        currentFormatInstructions = DEFAULT_FORMAT_INSTRUCTIONS;
        // 2. Update UI Elements
        renderModelOptions(); renderLanguageOptions();
        bulletCountRadios.forEach(radio => { radio.checked = (radio.value === DEFAULT_BULLET_COUNT); });
        if (debugCheckbox) debugCheckbox.checked = DEFAULT_DEBUG_MODE;
        updatePromptPreview(); // Update prompt display including textarea
        // 3. Save the Reset State (preserves API key from input field)
        saveSettings();
        // 4. Update Status Message
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
    if (resetButton) resetButton.addEventListener('click', () => { if (confirm("Are you sure you want to reset all options (except API key) to their defaults?")) { resetToDefaults(); } });
    bulletCountRadios.forEach(radio => { radio.addEventListener('change', updatePromptPreview); });
    // Add language radio change listeners (done within renderLanguageOptions)


    // --- Initial Load & Setup ---
    loadSettings(); // Load settings first
    setupCollapsible(); // Then setup the collapsible section interaction

});
