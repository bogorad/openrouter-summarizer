// pageInteraction.js (formerly popup.js)
// == OpenRouter Summarizer Content Script - Main Orchestrator ==
// v2.15 - Restored dynamic module loading

console.log('[LLM Content] Script Start (v2.15 - Dynamic Load)');

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
        DEFAULT_FORMAT_INSTRUCTIONS,
        PROMPT_STORAGE_KEY_CUSTOM_FORMAT, // Needed to reference keys from config
        PROMPT_STORAGE_KEY_PREAMBLE,
        PROMPT_STORAGE_KEY_POSTAMBLE,
        PROMPT_STORAGE_KEY_DEFAULT_FORMAT
    } = constants;

    const bcNum = Number(bulletCount) || 5;
    const word = numToWord[bcNum] || "five";

    // Use provided values or fall back to defaults from constants
    const finalPreamble = (preambleTemplate?.trim() ? preambleTemplate : DEFAULT_PREAMBLE_TEMPLATE)
        .replace('${bulletWord}', word)
        .replace('US English', targetLanguage);
    // Use custom instructions from config, fallback to default instructions from config, fallback to hardcoded default
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
    // When an element is selected by the highlighter, create the floating icon.
    FloatingIcon.createFloatingIcon(clickX, clickY, handleIconClick, handleIconDismiss);
}

function handleElementDeselected() {
    if (!FloatingIcon || !SummaryPopup) return; // Check if modules are loaded
    if (DEBUG) console.log('[LLM Content] handleElementDeselected called.');
    // When deselection occurs (via highlighter), remove the icon and hide the popup.
    FloatingIcon.removeFloatingIcon();
    SummaryPopup.hidePopup();
    // Clear summary state as well
    lastSummary = '';
    lastModelUsed = '';
}

function handleIconClick() {
    if (DEBUG) console.log('[LLM Content] handleIconClick called.');
    // When the floating icon is clicked, start the summarization process.
    processSelectedElement(); // Assume modules are loaded if icon exists
}

function handleIconDismiss() {
    if (!Highlighter || !SummaryPopup) return; // Check if modules are loaded
    if (DEBUG) console.log('[LLM Content] handleIconDismiss called (Escape pressed on icon).');
    // When the icon is dismissed (e.g., Escape key), deselect the element.
    Highlighter.removeSelectionHighlight(); // This will trigger handleElementDeselected via its internal logic if needed
    SummaryPopup.hidePopup();
     // Clear summary state as well
     lastSummary = '';
     lastModelUsed = '';
}

function handlePopupCopy() {
    // The copy logic is now internal to summaryPopup.js's handleCopyClick.
    if (DEBUG) console.log('[LLM Content] handlePopupCopy triggered (logic inside summaryPopup).');
}

function handlePopupChat(targetLang = null) {
    if (DEBUG) console.log(`[LLM Content] handlePopupChat called. Target Language: ${targetLang}`);
    // When the Chat button (or a flag) is clicked in the popup, open the chat context.
    openChatWithContext(targetLang); // Assume modules are loaded if popup exists
}

function handlePopupClose() {
    if (!SummaryPopup || !Highlighter || !FloatingIcon) return; // Check if modules are loaded
    if (DEBUG) console.log('[LLM Content] handlePopupClose called.');
    // When the Close button is clicked, hide the popup.
    SummaryPopup.hidePopup();
    Highlighter.removeSelectionHighlight(); // This will trigger handleElementDeselected
    FloatingIcon.removeFloatingIcon(); // Ensure icon is removed too
     // Clear summary state as well
     lastSummary = '';
     lastModelUsed = '';
}


// --- Chat Context Handling ---
function openChatWithContext(targetLang = null) {
    if (!Highlighter) return; // Check module loaded
    const selectedElement = Highlighter.getSelectedElement();
    if (!selectedElement) { alert("Cannot open chat: Original element selection lost."); if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: selectedElement is null.'); return; }
    // Use the raw lastSummary stored in this main script's state
    if (!lastSummary || lastSummary === 'Thinking...' || lastSummary.startsWith('Error:')) { alert("Cannot open chat: No valid summary available."); if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: No valid summary found in lastSummary.'); return; }

    const domSnippet = selectedElement.outerHTML || selectedElement.innerHTML || selectedElement.textContent || "";
    const summaryForChat = lastSummary; // Pass the RAW LLM response string

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
                    // Successfully opened chat, now clean up the page interaction state
                    if (SummaryPopup) SummaryPopup.hidePopup();
                    if (FloatingIcon) FloatingIcon.removeFloatingIcon();
                    if (Highlighter) Highlighter.removeSelectionHighlight(); // This also clears selectedElement state in highlighter
                    lastSummary = ''; // Clear summary state
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
    // Ensure SummaryPopup is loaded before proceeding
    if (!SummaryPopup) {
        console.error("[LLM Content] sendToLLM called before SummaryPopup module loaded!");
        return;
    }
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
    // Ensure modules are loaded before proceeding
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

    // --- Get settings from background ---
    if (DEBUG) console.log('[LLM Content] Requesting settings from background...');
    chrome.runtime.sendMessage({ action: "getSettings" }, (config) => {
        // --- Start of Async Callback ---
        if (chrome.runtime.lastError || config?.error) {
            const errorMsg = chrome.runtime.lastError?.message || config?.error || "Unknown error";
            console.error('[LLM Content] Error fetching settings from background:', errorMsg);
            SummaryPopup.updatePopupContent(`Error: Could not load settings: ${errorMsg}`);
            FloatingIcon.removeFloatingIcon();
            Highlighter.removeSelectionHighlight();
            return;
        }

        if (DEBUG) {
            const configToLog = { ...config };
            if (configToLog.apiKey) configToLog.apiKey = '[API Key Hidden]';
            console.log('[LLM Content] Settings received from background:', configToLog);
        }

        // --- Options Validation ---
        let validationErrors = [];
        if (!config.apiKey) validationErrors.push("API Key is missing.");
        if (!config.model) validationErrors.push("Default Model is not selected.");

        if (validationErrors.length > 0) {
            console.error("[LLM Content] Options validation failed:", validationErrors);
            let errorMsg = "Errors in options! Required settings are missing or invalid:\n- " + validationErrors.join("\n- ");
            SummaryPopup.updatePopupContent(errorMsg + "\n\nPlease configure the extension options.");
            FloatingIcon.removeFloatingIcon();
            Highlighter.removeSelectionHighlight();
            return;
        }
        // --- END: Options Validation ---

        DEBUG = !!config.debug; // Update debug status from fetched config

        // --- Selection Validation ---
        const stillSelectedElement = Highlighter.getSelectedElement();
        if (stillSelectedElement !== currentSelectedElement || !document.body.contains(currentSelectedElement)) {
            if (DEBUG) console.warn('[LLM Content] Element selection changed or removed during settings load. Aborting.');
            SummaryPopup.hidePopup();
            return;
        }
        // --- END: Selection Validation ---

        // --- Proceed with API call ---
        try {
            const {
                PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
                PROMPT_STORAGE_KEY_PREAMBLE,
                PROMPT_STORAGE_KEY_POSTAMBLE,
                PROMPT_STORAGE_KEY_DEFAULT_FORMAT
            } = constants; // Destructure keys here

            const apiKey = config.apiKey;
            const model = config.model;
            const bulletCount = config.bulletCount;
            const availableLanguages = config.availableLanguages;

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
        // --- End of Async Callback ---
    });
    if (DEBUG) console.log('[LLM Content] getSettings message sent. Waiting for callback...');
}


// --- Message Listener from Background ---
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    // Ensure modules are loaded before handling messages that depend on them
    if (!Highlighter || !SummaryPopup) {
        console.warn("[LLM Content] Message received before modules loaded, ignoring:", req.action);
        sendResponse({ status: "error", message: "Content script not fully initialized." });
        return false;
    }

    if (DEBUG) console.log('[LLM Content] Received message:', req.action);

    if (req.action === 'processSelection') {
        if (DEBUG) console.log('[LLM Content] Received processSelection command.');
        const currentSelectedElement = Highlighter.getSelectedElement();
        if (currentSelectedElement) {
            processSelectedElement(); // Start the process
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
    return false; // Indicate synchronous handling for other messages
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
        // Use chrome.runtime.getURL to ensure correct path resolution
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
            // Proceed without language data, flags won't work
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

        console.log('[LLM Content] Script Initialized (v2.15). Modules ready.');

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
