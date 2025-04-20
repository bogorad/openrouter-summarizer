// pageInteraction.js (formerly popup.js)
// == OpenRouter Summarizer Content Script - Main Orchestrator ==
// v2.13 - Refactored with dynamic module loading

console.log('[LLM Content] Script Start (v2.13 - Dynamic Load)');

// --- Global State Variables ---
// These need to be accessible by functions defined before modules are loaded
let DEBUG = false; // Debug logging state
let lastSummary = ''; // Raw LLM response string (used for chat context)
let lastModelUsed = ''; // Model used for the last summary

// --- Language Data (Fetched once during initialization) ---
let ALL_LANGUAGE_NAMES_MAP = {};
let svgPathPrefixUrl = '';
let fallbackSvgPathUrl = '';

// --- Module References (will be populated after dynamic import) ---
let Highlighter = null;
let FloatingIcon = null;
let SummaryPopup = null;
let constants = null;

// --- Placeholder functions or checks ---
// Define core functions that might be called early or need access to global state
// We'll populate the module references inside an async initialization function.

// --- Prompt Assembly Function (Needs constants) ---
const numToWord = { 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };

function getSystemPrompt(
    bulletCount,
    customFormatInstructions,
    preambleTemplate,
    postambleText,
    defaultFormatInstructions,
    targetLanguage
) {
    // Ensure constants are loaded before calling this
    if (!constants) {
        console.error("[LLM Content] getSystemPrompt called before constants loaded!");
        return "Error: Constants not loaded.";
    }
    const {
        DEFAULT_PREAMBLE_TEMPLATE,
        DEFAULT_POSTAMBLE_TEXT,
        DEFAULT_FORMAT_INSTRUCTIONS
    } = constants;

    const bcNum = Number(bulletCount) || 5;
    const word = numToWord[bcNum] || "five";

    const finalPreamble = (preambleTemplate?.trim() ? preambleTemplate : DEFAULT_PREAMBLE_TEMPLATE)
        .replace('${bulletWord}', word)
        .replace('US English', targetLanguage);
    const finalFormatInstructions = customFormatInstructions?.trim() ? customFormatInstructions : (defaultFormatInstructions?.trim() ? defaultFormatInstructions : DEFAULT_FORMAT_INSTRUCTIONS);
    const finalPostamble = postambleText?.trim() ? postambleText : DEFAULT_POSTAMBLE_TEXT;

    return `${finalPreamble}\n${finalFormatInstructions}\n${finalPostamble}`;
}

// --- Helper Functions ---
function findLanguageByName(name) {
    if (!name || typeof name !== 'string' || !ALL_LANGUAGE_NAMES_MAP) return undefined;
    const cleanName = name.trim().toLowerCase();
    const languageData = ALL_LANGUAGE_NAMES_MAP[cleanName];
    return languageData ? languageData : undefined;
}

// --- Callback Functions for Modules ---
// These will be assigned to module initializers later

function handleElementSelected(element, clickX, clickY) {
    if (!FloatingIcon) return; // Check if module is loaded
    if (DEBUG) console.log('[LLM Content] handleElementSelected called for:', element);
    FloatingIcon.createFloatingIcon(clickX, clickY, handleIconClick, handleIconDismiss);
}

function handleElementDeselected() {
    if (!FloatingIcon || !SummaryPopup) return; // Check if modules are loaded
    if (DEBUG) console.log('[LLM Content] handleElementDeselected called.');
    FloatingIcon.removeFloatingIcon();
    SummaryPopup.hidePopup();
    lastSummary = '';
    lastModelUsed = '';
}

function handleIconClick() {
    if (DEBUG) console.log('[LLM Content] handleIconClick called.');
    processSelectedElement(); // Assume modules are loaded if icon exists
}

function handleIconDismiss() {
    if (!Highlighter || !SummaryPopup) return; // Check if modules are loaded
    if (DEBUG) console.log('[LLM Content] handleIconDismiss called (Escape pressed on icon).');
    Highlighter.removeSelectionHighlight(); // This should trigger handleElementDeselected
    SummaryPopup.hidePopup();
    lastSummary = '';
    lastModelUsed = '';
}

function handlePopupCopy() {
    if (DEBUG) console.log('[LLM Content] handlePopupCopy triggered (logic inside summaryPopup).');
}

function handlePopupChat(targetLang = null) {
    if (DEBUG) console.log(`[LLM Content] handlePopupChat called. Target Language: ${targetLang}`);
    openChatWithContext(targetLang); // Assume modules are loaded if popup exists
}

function handlePopupClose() {
    if (!SummaryPopup || !Highlighter || !FloatingIcon) return; // Check if modules are loaded
    if (DEBUG) console.log('[LLM Content] handlePopupClose called.');
    SummaryPopup.hidePopup();
    Highlighter.removeSelectionHighlight(); // This should trigger handleElementDeselected
    FloatingIcon.removeFloatingIcon();
    lastSummary = '';
    lastModelUsed = '';
}


// --- Chat Context Handling ---
function openChatWithContext(targetLang = null) {
    if (!Highlighter) return; // Check module loaded
    const selectedElement = Highlighter.getSelectedElement();
    if (!selectedElement) { alert("Cannot open chat: Original element selection lost."); if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: selectedElement is null.'); return; }
    if (!lastSummary || lastSummary === 'Thinking...' || lastSummary.startsWith('Error:')) { alert("Cannot open chat: No valid summary available."); if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: No valid summary found in lastSummary.'); return; }

    const domSnippet = selectedElement.outerHTML || selectedElement.innerHTML || selectedElement.textContent || "";
    const summaryForChat = lastSummary;

    const contextPayload = {
        domSnippet: domSnippet,
        summary: summaryForChat,
        chatTargetLanguage: targetLang
    };

    if (DEBUG) console.log('[LLM Chat Context] Preparing context payload for background:', contextPayload);

    chrome.runtime.sendMessage({ action: "setChatContext", ...contextPayload }, function(response) {
        if (chrome.runtime.lastError) { console.error('[LLM Chat Context] Error sending context:', chrome.runtime.lastError); alert(`Error preparing chat: ${chrome.runtime.lastError.message}`); return; }
        if (response && response.status === 'ok') {
            if (DEBUG) console.log('[LLM Chat Context] Background confirmed context storage. Requesting tab open.');
            chrome.runtime.sendMessage({ action: "openChatTab" }, (openResponse) => {
                if (chrome.runtime.lastError) { console.error('[LLM Chat Context] Error requesting tab open:', chrome.runtime.lastError); alert(`Error opening chat tab: ${chrome.runtime.lastError.message}.`); }
                else {
                    if (DEBUG) console.log('[LLM Chat Context] Background ack openChatTab:', openResponse);
                    if (SummaryPopup) SummaryPopup.hidePopup();
                    if (FloatingIcon) FloatingIcon.removeFloatingIcon();
                    if (Highlighter) Highlighter.removeSelectionHighlight();
                    lastSummary = '';
                    lastModelUsed = '';
                }
            });
        } else {
            console.error('[LLM Chat Context] Background did not confirm context storage:', response);
            alert('Failed to prepare chat context.');
        }
    });
}


// --- LLM Interaction ---
function sendToLLM(selectedHtml, apiKey, model, systemPrompt, availableLanguages) {
    if (!SummaryPopup) return; // Check module loaded
    if (DEBUG) console.log(`[LLM Request] Sending to model: ${model}`);

    const payload = { model, messages: [ { role: "system", content: systemPrompt }, { role: "user", content: selectedHtml } ] };

    fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/bogorad/openrouter-summarizer',
          'X-Title': 'OR-Summ'
        },
        body: JSON.stringify(payload)
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => { throw new Error(`API Error: ${response.status} ${response.statusText} - ${text}`); });
        }
        return response.json();
    })
    .then(data => {
        if (DEBUG) console.log('[LLM Response] Received data:', data);
        const modelOutput = data.choices?.[0]?.message?.content?.trim();

        if (!modelOutput) { throw new Error('No response content received from LLM.'); }

        lastSummary = modelOutput; // Store raw response

        let jsonStringToParse = modelOutput;
        const jsonFenceMatch = modelOutput.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
        if (jsonFenceMatch && jsonFenceMatch[1]) {
            jsonStringToParse = jsonFenceMatch[1].trim();
            if (DEBUG) console.log('[LLM Content] Stripped JSON code fences.');
        }

        let summaryHtml = '';
        let parseError = null;
        try {
            const summaryArray = JSON.parse(jsonStringToParse);
            if (!Array.isArray(summaryArray)) {
                parseError = new Error('LLM response is not a valid JSON array.');
            } else {
                summaryHtml = '<ul>' + summaryArray.map(item => `<li>${item}</li>`).join('') + '</ul>';
                if (summaryHtml === '<ul></ul>') {
                    parseError = new Error('LLM response parsed to an empty array.');
                    summaryHtml = '';
                }
            }
        } catch (e) { parseError = e; }

        if (parseError || summaryHtml === '') {
            const errorContent = `Error: Could not parse LLM response as JSON.\n\nDetails: ${parseError ? parseError.message : 'Unknown parsing issue.'}\n\nRaw Output (truncated):\n"${modelOutput.substring(0, 200)}${modelOutput.length > 200 ? '...' : ''}"`;
            console.error('[LLM Error] Failed to process LLM JSON response:', parseError || new Error("Parsed JSON array was empty"));
            if (DEBUG) console.log('[LLM Error] Raw output received:', modelOutput);
            SummaryPopup.updatePopupContent(errorContent);
            SummaryPopup.enableChatButton(false);
        } else {
            lastModelUsed = model;
            SummaryPopup.updatePopupContent(summaryHtml);
            SummaryPopup.enableChatButton(true);
        }
    })
    .catch(err => {
        console.error('[LLM Fetch Error]', err);
        lastSummary = `Error: ${err.message}`;
        SummaryPopup.updatePopupContent(`Error: ${err.message}`);
        SummaryPopup.enableChatButton(false);
    });
}


// --- Core Process Trigger ---
function processSelectedElement() {
    if (!Highlighter || !SummaryPopup || !FloatingIcon || !constants) {
        console.error("[LLM Content] processSelectedElement called before modules loaded!");
        return;
    }
    const currentSelectedElement = Highlighter.getSelectedElement();
    if (!currentSelectedElement) {
        console.error('[LLM Content] processSelectedElement called but no element is selected!');
        return;
    }
    if (DEBUG) console.log('[LLM Content] processSelectedElement called for element:', currentSelectedElement);

    lastSummary = 'Thinking...';
    SummaryPopup.showPopup('Thinking...', [], {
        onCopy: handlePopupCopy,
        onChat: handlePopupChat,
        onClose: handlePopupClose
    });
    SummaryPopup.enableChatButton(false);

    const {
        PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
        PROMPT_STORAGE_KEY_PREAMBLE,
        PROMPT_STORAGE_KEY_POSTAMBLE,
        PROMPT_STORAGE_KEY_DEFAULT_FORMAT
    } = constants;

    const keysToFetch = [
        'apiKey', 'model', 'bulletCount', 'debug', 'availableLanguages',
        PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
        PROMPT_STORAGE_KEY_PREAMBLE,
        PROMPT_STORAGE_KEY_POSTAMBLE,
        PROMPT_STORAGE_KEY_DEFAULT_FORMAT
    ];

    if (DEBUG) console.log('[LLM Content] Requesting settings from storage:', keysToFetch);

    chrome.storage.sync.get(keysToFetch, (config) => {
        if (chrome.runtime.lastError) {
            console.error('[LLM Content] Error fetching from storage:', chrome.runtime.lastError);
            SummaryPopup.updatePopupContent(`Error: Could not load extension settings: ${chrome.runtime.lastError.message}`);
            FloatingIcon.removeFloatingIcon();
            Highlighter.removeSelectionHighlight();
            return;
        }

        const configToLog = { ...config };
        if (configToLog.apiKey) configToLog.apiKey = '[API Key Hidden]';
        if (DEBUG) console.log('[LLM Content] Settings received from storage:', configToLog);

        let validationErrors = [];
        if (!config.apiKey?.trim()) validationErrors.push("API Key is missing.");
        if (!config.model?.trim()) validationErrors.push("Default Model is not selected.");
        // Add more validation if needed

        if (validationErrors.length > 0) {
            console.error("[LLM Content] Options validation failed:", validationErrors);
            let errorMsg = "Errors in options! Required settings are missing or invalid:\n- " + validationErrors.join("\n- ");
            SummaryPopup.updatePopupContent(errorMsg + "\n\nPlease configure the extension options.");
            FloatingIcon.removeFloatingIcon();
            Highlighter.removeSelectionHighlight();
            return;
        }

        DEBUG = !!config.debug; // Update debug status

        const stillSelectedElement = Highlighter.getSelectedElement();
        if (stillSelectedElement !== currentSelectedElement || !document.body.contains(currentSelectedElement)) {
            if (DEBUG) console.warn('[LLM Content] Element selection changed or removed during settings load. Aborting.');
            SummaryPopup.hidePopup();
            return;
        }

        try {
            const apiKey = config.apiKey;
            const model = config.model;
            const bulletCount = config.bulletCount || 5;
            const availableLanguages = Array.isArray(config.availableLanguages) ? config.availableLanguages : [];

            const firstConfiguredLanguage = availableLanguages
                .map(name => name.trim()).filter(name => name !== '')
                .find(name => findLanguageByName(name));
            const targetLanguageForSummary = firstConfiguredLanguage || 'US English';
            if (DEBUG) console.log('[LLM Content] Target language for summary:', targetLanguageForSummary);

            const customFormatInstructions = config[PROMPT_STORAGE_KEY_CUSTOM_FORMAT];
            const preambleTemplate = config[PROMPT_STORAGE_KEY_PREAMBLE];
            const postambleText = config[PROMPT_STORAGE_KEY_POSTAMBLE];
            const defaultFormatInstructions = config[PROMPT_STORAGE_KEY_DEFAULT_FORMAT];

            const htmlContent = currentSelectedElement.outerHTML || currentSelectedElement.innerHTML || currentSelectedElement.textContent || '';
            if (!htmlContent.trim()) {
                console.warn('[LLM Content] Selected element has no content.');
                SummaryPopup.updatePopupContent('Error: Selected element has no content.');
                FloatingIcon.removeFloatingIcon();
                Highlighter.removeSelectionHighlight();
                return;
            }

            if (DEBUG) console.log('[LLM Content] Calling getSystemPrompt...');
            const systemPrompt = getSystemPrompt(
                bulletCount, customFormatInstructions,
                preambleTemplate, postambleText, defaultFormatInstructions,
                targetLanguageForSummary
            );
            if (DEBUG) console.log("Using System Prompt:", systemPrompt);

            if (DEBUG) console.log('[LLM Content] Calling sendToLLM...');
            sendToLLM(htmlContent, apiKey, model, systemPrompt, availableLanguages);
            if (DEBUG) console.log('[LLM Content] sendToLLM called. Waiting for response...');

        } catch (error) {
            console.error('[LLM Content] Error processing settings or generating prompt:', error);
            SummaryPopup.updatePopupContent(`Error processing selection: ${error.message || 'Unknown error'}`);
            FloatingIcon.removeFloatingIcon();
            Highlighter.removeSelectionHighlight();
        }
    });
    if (DEBUG) console.log('[LLM Content] storage.sync.get request initiated. Waiting for callback...');
}


// --- Message Listener from Background ---
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    // Ensure modules are loaded before handling messages that depend on them
    if (!Highlighter || !SummaryPopup) {
        console.warn("[LLM Content] Message received before modules loaded, ignoring:", req.action);
        sendResponse({ status: "error", message: "Content script not fully initialized." });
        return false; // Or true if you might handle it later, but likely false
    }

    if (DEBUG) console.log('[LLM Content] Received message:', req.action);

    if (req.action === 'processSelection') {
        if (DEBUG) console.log('[LLM Content] Received processSelection command.');
        const currentSelectedElement = Highlighter.getSelectedElement();
        if (currentSelectedElement) {
            processSelectedElement();
            sendResponse({ status: "processing started" });
            return true; // Indicate potential async work
        } else {
            console.warn('[LLM Content] Received processSelection but no element is selected.');
            SummaryPopup.showPopup('Error: No element selected. Use Alt+Click first.', [], {
                onCopy: () => {}, onChat: () => {}, onClose: SummaryPopup.hidePopup
            });
            SummaryPopup.enableChatButton(false);
            setTimeout(SummaryPopup.hidePopup, 3000);
            sendResponse({ status: "no element selected" });
            return false;
        }
    }
    return false;
});


// --- Initialization Function ---
async function initialize() {
    try {
        // Get initial debug state first
        const result = await chrome.storage.sync.get(['debug']);
        DEBUG = !!result.debug;
        if (DEBUG) console.log('[LLM Content] Initial Debug mode:', DEBUG);
    } catch (e) {
        console.error('[LLM Content] Error getting initial debug setting:', e);
        DEBUG = false; // Default to false on error
    }

    try {
        // Dynamically import all modules
        [Highlighter, FloatingIcon, SummaryPopup, constants] = await Promise.all([
            import(chrome.runtime.getURL('./highlighter.js')),
            import(chrome.runtime.getURL('./floatingIcon.js')),
            import(chrome.runtime.getURL('./summaryPopup.js')),
            import(chrome.runtime.getURL('./constants.js'))
        ]);
        if (DEBUG) console.log('[LLM Content] All modules loaded dynamically.');

        // Load language data
        try {
            const languageDataResponse = await chrome.runtime.sendMessage({ action: "getLanguageData" });
            if (chrome.runtime.lastError) throw chrome.runtime.lastError;
            if (languageDataResponse && languageDataResponse.ALL_LANGUAGE_NAMES_MAP) {
                ALL_LANGUAGE_NAMES_MAP = languageDataResponse.ALL_LANGUAGE_NAMES_MAP;
                svgPathPrefixUrl = languageDataResponse.SVG_PATH_PREFIX || '';
                fallbackSvgPathUrl = languageDataResponse.FALLBACK_SVG_PATH || '';
                if (DEBUG) console.log(`[LLM Content] Fetched ${Object.keys(ALL_LANGUAGE_NAMES_MAP).length} languages and SVG paths.`);
            } else {
                throw new Error("Invalid language data response from background.");
            }
        } catch (error) {
            console.error("[LLM Content] Error fetching language data:", error);
            ALL_LANGUAGE_NAMES_MAP = {};
            svgPathPrefixUrl = '';
            fallbackSvgPathUrl = '';
        }

        // Initialize modules with necessary data and callbacks
        Highlighter.initializeHighlighter({
            onElementSelected: handleElementSelected,
            onElementDeselected: handleElementDeselected,
            initialDebugState: DEBUG
        });
        FloatingIcon.initializeFloatingIcon({ initialDebugState: DEBUG });
        SummaryPopup.initializePopupManager({
            languageData: { ALL_LANGUAGE_NAMES_MAP, svgPathPrefixUrl, fallbackSvgPathUrl },
            initialDebugState: DEBUG
        });

        console.log('[LLM Content] Script Initialized (v2.13). Modules ready.');

    } catch (err) {
        console.error("[LLM Content] CRITICAL: Failed to load modules dynamically or initialize.", err);
        // Display error on page
        const errorDiv = document.createElement('div');
        errorDiv.textContent = `Error: OpenRouter Summarizer failed to load components (${err.message}). Please try reloading the page or reinstalling the extension.`;
        errorDiv.style.cssText = 'position:fixed; top:10px; left:10px; background:red; color:white; padding:10px; z-index:999999; border-radius:5px; font-family:sans-serif;';
        document.body.appendChild(errorDiv);
    }
}

// Start the initialization process
initialize();
