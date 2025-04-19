// popup.js
// == OpenRouter Summarizer Content Script ==
// v2.9 - Initial summary language based on first configured language

console.log('[LLM Content] Script Start');

// Use an async IIFE (Immediately Invoked Function Expression)
// This helps manage scope and allows using await at the top level for language data loading.
(async () => {

    // --- Constants ---
    // Paths for language data and flags relative to the content script's location
    const LANGUAGES_JSON_PATH = chrome.runtime.getURL('country-flags/languages.json'); // Updated path
    const SVG_PATH_PREFIX = chrome.runtime.getURL('country-flags/svg/');
    const FALLBACK_SVG_PATH = chrome.runtime.getURL('country-flags/svg/un.svg'); // Generic placeholder flag

    const MAX_FLAGS_DISPLAY = 5; // Limit the number of flags shown in the header
    // const NO_TRANSLATION_VALUE = "none"; // Removed as explicit translation option is gone

    // CSS Class Names
    const HIGHLIGHT_PREVIEW_CLASS = 'llm-highlight-preview';
    const HIGHLIGHT_SELECTED_CLASS = 'llm-highlight';
    const FLOATING_ICON_CLASS = 'llm-floating-icon';
    const POPUP_CLASS = 'summarizer-popup';
    const POPUP_HEADER_CONTAINER_CLASS = 'summarizer-header-container';
    const POPUP_HEADER_CLASS = 'summarizer-header';
    const POPUP_FLAGS_CLASS = 'summarizer-flags';
    const POPUP_BODY_CLASS = 'summarizer-body';
    const POPUP_ACTIONS_CLASS = 'summarizer-actions';
    const POPUP_BTN_CLASS = 'copy-btn'; // Corrected class name
    const POPUP_COPY_BTN_CLASS = 'copy-btn';
    const POPUP_CHAT_BTN_CLASS = 'chat-btn';
    const POPUP_CLOSE_BTN_CLASS = 'close-btn';
    const LANGUAGE_FLAG_CLASS = 'language-flag'; // Class for flag img elements

    // --- Storage Keys ---
    const PROMPT_STORAGE_KEY_CUSTOM_FORMAT = 'prompt_custom_format_instructions';
    const PROMPT_STORAGE_KEY_PREAMBLE = 'prompt_preamble_template';
    const PROMPT_STORAGE_KEY_POSTAMBLE = 'prompt_postamble_text';
    // Removed: const PROMPT_STORAGE_KEY_TRANSLATION = 'prompt_translation_template';
    const PROMPT_STORAGE_KEY_DEFAULT_FORMAT = 'prompt_default_format_instructions';


    // --- Data Storage for Languages ---
    // Will store { LanguageName: CountryCode, ... }
    let ALL_LANGUAGES_MAP = {};
    // Map for quick lookup from lowercase name to {code, original name}
    let ALL_LANGUAGE_NAMES_MAP = {};


    // --- State Variables ---
    let selectedElement = null; // Element selected by Alt+Click
    let lastHighlighted = null; // Element last highlighted by mousemove (Alt+Hover) - Used in old code's click logic
    let altKeyDown = false; // Is Alt key currently held down?
    let previewHighlighted = null; // Element currently showing the preview highlight
    let floatingIcon = null; // The floating icon element
    let DEBUG = false; // Debug logging state

    let lastSummary = ''; // Raw LLM response string
    let lastSummaryHtml = ''; // Generated <ul><li>...</li></ul> HTML (String format from old code)
    let lastModelUsed = ''; // Model used for the last summary
    // Store the language the summary was generated IN (based on options)
    // Simplified: Always English now based on preamble
    let lastSummaryLanguageUsed = 'English'; // This will now be the first configured language


    let popup = null; // Reference to the current popup element


    // --- Prompt Assembly Function (Modified to accept language) ---
    const numToWord = { 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };

    function getSystemPrompt(
        bulletCount,
        customFormatInstructions, // User's custom text
        preambleTemplate,         // Template string from storage
        postambleText,            // Fixed string from storage
        defaultFormatInstructions, // Default format string from storage
        targetLanguage // ADDED: The language to request the summary in
    ) {
        const bcNum = Number(bulletCount) || 5;
        const word = numToWord[bcNum] || "five";

        // Use loaded templates/defaults
        // MODIFIED: Use targetLanguage in the preamble template
        const finalPreamble = preambleTemplate ? preambleTemplate.replace('${bulletWord}', word).replace('US English', targetLanguage) : `[Error: Preamble template missing] Prepare summary with ${word} points in ${targetLanguage}.`;
        const finalFormatInstructions = (customFormatInstructions && customFormatInstructions.trim() !== '') ? customFormatInstructions : defaultFormatInstructions || "[Error: Default format instructions missing]";
        const finalPostamble = postambleText || "[Error: Postamble text missing]";

        // Prompt is now just preamble + format instructions + postamble
        let prompt = finalPreamble + "\n" + finalFormatInstructions + "\n" + finalPostamble;

        return prompt;
    }


    // --- Helper Functions: Language Data & Flags ---

    // Function to load language data from JSON
    async function loadLanguageData() {
        try {
            const response = await fetch(LANGUAGES_JSON_PATH);
            if (!response.ok) {
                throw new Error(`Failed to fetch languages.json: ${response.statusText} (${response.status})`);
            }
            const data = await response.json();
            ALL_LANGUAGES_MAP = data;
             // Create name-to-code map for quick lookup from lowercase name to {code, original name}
            ALL_LANGUAGE_NAMES_MAP = Object.keys(data).reduce((map, name) => {
                map[name.toLowerCase()] = { code: data[name], name: name };
                return map;
            }, {});
            if (DEBUG) console.log(`[LLM Content] Successfully loaded ${Object.keys(ALL_LANGUAGES_MAP).length} languages.`);
        } catch (error) {
            console.error("[LLM Content] Error loading language data:", error);
            // Keep using empty maps if loading fails - flag rendering will gracefully fail
            ALL_LANGUAGES_MAP = {};
            ALL_LANGUAGE_NAMES_MAP = {};
        }
    }

     // Finds a language object ({code, name}) by its name (case-insensitive, trims whitespace)
    // Returns undefined if not found. Uses the loaded data.
    function findLanguageByName(name) {
        if (!name || typeof name !== 'string') return undefined;
        const cleanName = name.trim().toLowerCase();
        const languageData = ALL_LANGUAGE_NAMES_MAP[cleanName];
        if (languageData) {
            return languageData; // Returns { code: CountryCode, name: OriginalLanguageName }
        }
         return undefined;
    }

    // Function to render flags in the header based on configured languages
    function renderHeaderFlags(availableLanguageNames) {
        // Ensure popup element exists before trying to find flags container
        if (!popup) {
             if (DEBUG) console.warn("[LLM Content] renderHeaderFlags called but popup element not found.");
             return;
        }

        const flagsContainer = popup.querySelector(`.${POPUP_FLAGS_CLASS}`);
        if (!flagsContainer) {
            console.warn("[LLM Content] Flags container not found in popup DOM.");
            return;
        }
        flagsContainer.innerHTML = ''; // Clear existing flags

        if (!Array.isArray(availableLanguageNames) || availableLanguageNames.length === 0) {
            flagsContainer.style.display = 'none'; // Hide if no languages configured
            return;
        }

        // Filter configured names to only include valid language names found in our loaded data
        const validLanguageNames = availableLanguageNames
            .map(name => name.trim())
            .filter(name => name !== '') // Remove empty
            .map(name => findLanguageByName(name)) // Get language object for each name
            .filter(lang => lang !== undefined); // Keep only found languages

        if (validLanguageNames.length === 0) {
             // Hide the flags container if no *valid* languages derived from the list
             flagsContainer.style.display = 'none';
             return;
        } else {
             flagsContainer.style.display = 'flex'; // Ensure container is visible
        }

        // Limit the number of flags displayed. The first one is the default so no point showing its flag.
        const flagsToDisplay = validLanguageNames.slice(1, MAX_FLAGS_DISPLAY);


        flagsToDisplay.forEach(lang => { // lang is {code, name}
            const flagImg = document.createElement('img');
            flagImg.className = LANGUAGE_FLAG_CLASS; // Use the class defined in CSS
            // Use chrome.runtime.getURL for the SVG path, using the language code
            flagImg.src = `${SVG_PATH_PREFIX}${lang.code.toLowerCase()}.svg`;
            flagImg.alt = `${lang.name} flag`;
            flagImg.title = `Translate summary and chat in ${lang.name}`; // Tooltip on hover

            // Handle missing SVG file
            flagImg.onerror = function() {
                 this.src = FALLBACK_SVG_PATH; // Use fallback URL
                 this.alt = 'Flag not found';
                 this.title = 'Flag not found';
                 if (DEBUG) console.warn(`[LLM Content] Missing SVG for code: ${lang.code}, using fallback.`);
             };

            // Add click listener to the flag for chat context
            flagImg.addEventListener('click', (e) => {
                 e.stopPropagation(); // Prevent click from bubbling up
                 e.preventDefault(); // Prevent default action
                 if (DEBUG) console.log(`[LLM Content] Flag clicked for language: ${lang.name}`);
                 // Call openChatWithContext, passing the target language name
                 openChatWithContext(lang.name);
            });

            flagsContainer.appendChild(flagImg);
        });
    }


    // --- Helper Function to Remove Selection Highlight ---
    function removeSelectionHighlight() {
        if (selectedElement && document.body.contains(selectedElement)) {
            selectedElement.classList.remove(HIGHLIGHT_SELECTED_CLASS);
        }
        // Note: Do NOT set selectedElement = null here. That happens on deselect clicks or icon click.
    }


    // --- Popup Display ---
    // Added availableLanguages as a parameter. REMOVED calls to removeSelectionHighlight/removeFloatingIcon.
    function showPopup(content, availableLanguages = []) {
        // Remove any existing popup first
        const existing = document.querySelector(`.${POPUP_CLASS}`);
        if (existing) { if (DEBUG) console.log('[LLM Content] Removing existing popup.'); existing.remove(); }

        // Create the main popup container
        popup = document.createElement('div'); // Assign to the state variable
        popup.className = POPUP_CLASS;

        // Header area (Container for title and flags)
        const headerContainer = document.createElement('div');
        headerContainer.className = POPUP_HEADER_CONTAINER_CLASS;

        const header = document.createElement('div');
        header.className = POPUP_HEADER_CLASS;
        header.textContent = 'Summary'; // Summary title
        headerContainer.appendChild(header);

        // Flags Area (Empty container initially)
        const flagsArea = document.createElement('div');
        flagsArea.className = POPUP_FLAGS_CLASS;
        headerContainer.appendChild(flagsArea); // Add flags container to header container

        popup.appendChild(headerContainer); // Add header container to the main popup

        // Body area (for summary content)
        const contentDiv = document.createElement('div');
        contentDiv.className = POPUP_BODY_CLASS;
        let copyTimeoutId = null; // Keep copy timeout scoped to this popup instance

        // Populate content based on type (string for loading/error, HTML string for summary)
        if (typeof content === 'string') {
             if (content === 'Thinking...' || content.startsWith('Error:')) {
                 contentDiv.textContent = content;
                 if (DEBUG) console.log('[LLM Content] Showing popup with text:', content);
             } else {
                 // Assumed to be HTML string for successful summary
                 contentDiv.innerHTML = content; // Insert the HTML string
                 if (DEBUG) console.log('[LLM Content] Showing popup with generated HTML string.');
             }
         }
         else {
             contentDiv.textContent = "Error: Invalid content type for popup.";
             if (DEBUG) console.error('[LLM Content] Invalid content type passed to showPopup:', content);
         }
        popup.appendChild(contentDiv);

        // Actions area (buttons)
        const actions = document.createElement('div');
        actions.className = POPUP_ACTIONS_CLASS;

        // Copy Button
        const copyBtn = document.createElement('button');
        copyBtn.className = `${POPUP_BTN_CLASS} ${POPUP_COPY_BTN_CLASS}`;
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => {
            if (copyTimeoutId) clearTimeout(copyTimeoutId);
            let val = '';
            const listItems = contentDiv.querySelectorAll('li');
            if (listItems.length > 0) {
                // Extract clean text from list items, preserving structure
                 val = Array.from(listItems).map(li => {
                    // Create a temporary element to get clean text without HTML tags
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = li.innerHTML;
                    // Get text content which strips most tags like <b>, <i>
                    return tempDiv.textContent.trim(); // Use tempDiv to get clean text
                 }).filter(text => text !== '').map((text, idx) => `${idx + 1}. ${text}`).join('\n');

            } else {
                // Fallback to plain text if not a list (e.g., error message)
                val = contentDiv.textContent || '';
            }
            navigator.clipboard.writeText(val.trim()).then(() => {
                copyBtn.textContent = 'Copied!';
                copyTimeoutId = setTimeout(() => { copyBtn.textContent = 'Copy'; copyTimeoutId = null; }, 1500);
            }).catch(err => {
                console.error('[LLM Content] Failed to copy text: ', err);
                copyBtn.textContent = 'Error';
                copyTimeoutId = setTimeout(() => { copyBtn.textContent = 'Copy'; copyTimeoutId = null; }, 1500);
            });
        };
        actions.appendChild(copyBtn);

        // Chat Button (calls openChatWithContext)
        const chatBtn = document.createElement('button');
        chatBtn.className = `${POPUP_BTN_CLASS} ${POPUP_CHAT_BTN_CLASS}`;
        chatBtn.textContent = 'Chat';
        // Disable Chat button if no valid summary HTML is available
        chatBtn.disabled = !lastSummaryHtml; // lastSummaryHtml is set by sendToLLM on success
        chatBtn.onclick = () => openChatWithContext(); // Call without targetLang initially
        actions.appendChild(chatBtn);

        // Close Button (calls hidePopup)
        const closeBtn = document.createElement('button');
        closeBtn.className = `${POPUP_BTN_CLASS} ${POPUP_CLOSE_BTN_CLASS}`;
        closeBtn.textContent = 'Close';
        closeBtn.onclick = () => {
             hidePopup(); // Use hidePopup for transition effect
        };
        actions.appendChild(closeBtn);

        popup.appendChild(actions);
        document.body.appendChild(popup);
        if (DEBUG) console.log('[LLM Content] New popup added to page.');

        // --- Flag Rendering ---
        // Only render flags if language data was loaded successfully
         if (Object.keys(ALL_LANGUAGES_MAP).length > 0) {
             // availableLanguages is passed as a parameter to showPopup now
             renderHeaderFlags(availableLanguages);
         } else {
             if (DEBUG) console.warn("[LLM Content] Language data not loaded, skipping flag rendering in popup.");
             // Hide the flags container if data wasn't loaded
             const flagsContainer = popup.querySelector(`.${POPUP_FLAGS_CLASS}`);
              if (flagsContainer) flagsContainer.style.display = 'none';
         }
        // --- End Flag Rendering ---

        // Show the popup with transition
        popup.style.display = 'flex'; // Set display first
        // Use requestAnimationFrame to allow the browser to register the display change
        // before adding the 'visible' class for the transition.
        requestAnimationFrame(() => {
             popup.classList.add('visible');
        });

        // IMPORTANT: Highlight and icon removal moved *out* of here.
        // They are removed in processSelectedElement AFTER the storage fetch validation passes.
    }

    // Function to hide the popup
    function hidePopup() {
        const popupElement = document.querySelector(`.${POPUP_CLASS}`); // Find existing popup
        if (popupElement) {
            // Trigger the transition by removing the 'visible' class
            popupElement.classList.remove('visible');
            // Wait for the transition to finish before setting display: none
            const computedStyle = window.getComputedStyle(popupElement);
            const transitionDuration = parseFloat(computedStyle.transitionDuration) * 1000; // in ms

            setTimeout(() => {
                 popupElement.style.display = 'none';
                 // Clear flags when hidden (optional, keeps DOM clean)
                 const flagsContainer = popupElement.querySelector(`.${POPUP_FLAGS_CLASS}`);
                 if (flagsContainer) flagsContainer.innerHTML = '';
                 if (DEBUG) console.log("[LLM Content] Popup hidden and flags cleared.");
                 popup = null; // Clear the global reference
            }, transitionDuration > 0 ? transitionDuration + 50 : 10); // Add slight buffer
        } else {
            popup = null; // Ensure reference is null if popup wasn't found
        }
    }


    // --- Chat Context Handling ---
    function openChatWithContext(targetLang = null) { // Added optional targetLang parameter
        if (!selectedElement) { alert("Cannot open chat: Original element selection lost."); if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: selectedElement is null.'); return; }
        if (!lastSummary || lastSummary === 'Thinking...' || lastSummary.startsWith('Error:')) { alert("Cannot open chat: No valid summary available."); if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: No valid summary found in lastSummary.'); return; return; } // Added return here
        if (!lastSummaryHtml) { alert("Cannot open chat: Summary parsing failed."); if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: lastSummaryHtml is empty.'); return; }

        const domSnippet = selectedElement.outerHTML || selectedElement.innerHTML || selectedElement.textContent || "";
        const summaryForChat = lastSummary; // Pass the RAW LLM response string

        const contextPayload = {
            domSnippet: domSnippet,
            summary: summaryForChat, // The raw JSON string from the LLM
            // Removed summaryModel: lastModelUsed, // Not needed in chat context payload
            // Removed summaryLanguage: lastSummaryLanguageUsed, // Not needed in chat context payload
            chatTargetLanguage: targetLang // The language requested for the chat (if a flag was clicked)
        };

        if (DEBUG) { console.log('[LLM Chat Context] Preparing context payload for background:', contextPayload); }

        // Send the context to the background script
        chrome.runtime.sendMessage({ action: "setChatContext", ...contextPayload }, function(response) {
            if (chrome.runtime.lastError) { console.error('[LLM Chat Context] Error sending context:', chrome.runtime.lastError); alert(`Error preparing chat: ${chrome.runtime.lastError.message}`); return; }
            if (response && response.status === 'ok') { // <--- This is where it's waiting
                if (DEBUG) console.log('[LLM Chat Context] Background confirmed context storage. Requesting tab open.');
                chrome.runtime.sendMessage({ action: "openChatTab" }, (openResponse) => {
                    if (chrome.runtime.lastError) { console.error('[LLM Chat Context] Error requesting tab open:', chrome.runtime.lastError); alert(`Error opening chat tab: ${chrome.runtime.lastError.message}.`); }
                    else {
                        if (DEBUG) console.log('[LLM Chat Context] Background ack openChatTab:', openResponse);
                        hidePopup(); // Use hidePopup for transition effect
                        // After opening chat, also clear the selection and icon
                        removeSelectionHighlight();
                        selectedElement = null;
                        lastHighlighted = null;
                        removeFloatingIcon();
                    }
                });
            } else {
                console.error('[LLM Chat Context] Background did not confirm context storage:', response);
                alert('Failed to prepare chat context.');
            }
        });
    }


    // --- LLM Interaction ---
    function sendToLLM(selectedHtml, apiKey, model, systemPrompt) {
        if (DEBUG) console.log(`[LLM Request] Sending to model: ${model}`);
        // Note: "Thinking..." popup is already shown by processSelectedElement
        // Highlight and icon are removed *before* this call in processSelectedElement

        const payload = { model, messages: [ { role: "system", content: systemPrompt }, { role: "user", content: selectedHtml } ] };

        fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`, // Use apiKey here
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://github.com/bogorad/openrouter-summarizer', // Replace with your repo if different
              'X-Title': 'OR-Summ' // Custom header
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
            if (DEBUG) {
                // Create a copy of the data object before logging to remove sensitive info if any
                const dataToLog = { ...data };
                // Although OpenRouter API response shouldn't contain the key,
                // it's good practice to be cautious if logging response objects.
                // No API key expected in this response, but keeping this pattern in mind.
                console.log('[LLM Response] Received data:', dataToLog);
            }
            const modelOutput = data.choices?.[0]?.message?.content?.trim();

            if (!modelOutput) { throw new Error('No response content received from LLM.'); }

            lastSummary = modelOutput; // Store the raw LLM response first

            let jsonStringToParse = modelOutput;
            // Attempt to strip markdown code fences if present
            const jsonFenceMatch = modelOutput.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
            if (jsonFenceMatch && jsonFenceMatch[1]) {
                jsonStringToParse = jsonFenceMatch[1].trim();
                if (DEBUG) console.log('[LLM Content] Stripped JSON code fences. Content to parse:', jsonStringToParse);
            } else {
                 if (DEBUG) console.log('[LLM Content] No JSON code fences detected.');
            }

            let summaryHtml = ''; // Store as HTML string
            let parseError = null;
            try {
                const summaryArray = JSON.parse(jsonStringToParse);
                if (!Array.isArray(summaryArray)) {
                    parseError = new Error('LLM response (after potential fence stripping) is not a valid JSON array.');
                } else {
                    // Build the HTML string directly
                    summaryHtml = '<ul>' + summaryArray.map(item => `<li>${item}</li>`).join('') + '</ul>';
                    // Check if the generated HTML is empty (e.g., empty array received)
                     if (summaryHtml === '<ul></ul>') {
                         parseError = new Error('LLM response parsed to an empty array.');
                         summaryHtml = ''; // Ensure empty string on empty result
                     }
                }
            } catch (e) {
                 parseError = e;
            }

            if (parseError || summaryHtml === '') { // Check for empty html string as well
                 lastSummaryHtml = ''; // Ensure HTML is empty on parse error
                 // Update popup with the parse error message + truncated raw output
                 const errorContent = `Error: Could not parse LLM response as JSON.\n\nDetails: ${parseError ? parseError.message : 'Unknown parsing issue.'}\n\nRaw Output (truncated):\n"${modelOutput.substring(0, 200)}${modelOutput.length > 200 ? '...' : ''}"`;
                 // --- FIX: Move highlight and icon removal here ---
                 removeSelectionHighlight();
                 removeFloatingIcon();
                 // --- END FIX ---
                 showPopup(errorContent, []); // Show error text, no flags initially
                 console.error('[LLM Error] Failed to process LLM JSON response:', parseError || new Error("Parsed JSON array was empty or did not result in HTML"));
                 if (DEBUG) {
                      console.log('[LLM Error] Raw output received:', modelOutput);
                      if (jsonStringToParse !== modelOutput) {
                          console.log('[LLM Error] Content after stripping fences:', jsonStringToParse);
                      }
                 }
                 // Keep lastSummary (raw output) for potential debugging or different parsing in chat
            } else {
                 lastModelUsed = model;
                 lastSummaryHtml = summaryHtml; // Store the successfully parsed HTML string
                 // Re-fetch settings to get availableLanguages for the popup
                 // Note: availableLanguages is needed *after* the response for popup flags
                 chrome.storage.sync.get(['availableLanguages'], (cfg) => { // Only fetch availableLanguages
                      // lastSummaryLanguageUsed is now always 'English' based on preamble
                      // --- FIX: Move highlight and icon removal here ---
                      removeSelectionHighlight();
                      removeFloatingIcon();
                      // --- END FIX ---
                      showPopup(lastSummaryHtml, cfg.availableLanguages || []); // Show popup with HTML string and languages
                      // Enable the Chat button after successful parse
                       const chatBtn = document.querySelector(`.${POPUP_BTN_CLASS}.${POPUP_CHAT_BTN_CLASS}`);
                       if(chatBtn) chatBtn.disabled = false;
                 });
            }
        })
        .catch(err => {
            console.error('[LLM Fetch Error]', err);
            lastSummary = `Error: ${err.message}`; // Update lastSummary with fetch error
            lastSummaryHtml = ''; // Clear HTML on fetch error
            // --- FIX: Move highlight and icon removal here ---
            removeSelectionHighlight();
            removeFloatingIcon();
            // --- END FIX ---
            showPopup(`Error: ${err.message}`, []); // Update popup with fetch error message, no flags
        });
    }


    // --- processSelectedElement (Modified to get first language) ---
    function processSelectedElement() {
        // The selectedElement global variable should already be set by the Alt+Click mousedown handler
        if (!selectedElement) {
            console.error('[LLM Content] processSelectedElement called but selectedElement is null!');
            showPopup('Error: No element selected.', []); // Pass empty array for languages
            // --- FIX: Remove icon if processSelectedElement is called without a selected element ---
            removeFloatingIcon();
            // --- END FIX ---
            return;
        }
        // Store a reference to the element that triggered THIS process call
        const currentSelectedElement = selectedElement;
        if (DEBUG) console.log('[LLM Content] processSelectedElement called for element:', currentSelectedElement);

        // Show thinking immediately
        lastSummary = 'Thinking...';
        lastSummaryHtml = '';
        // Disable chat button immediately (if popup exists)
        const chatBtn = document.querySelector(`.${POPUP_BTN_CLASS}.${POPUP_CHAT_BTN_CLASS}`);
        if(chatBtn) chatBtn.disabled = true;
        // Show popup WITHOUT removing highlight or icon yet
        showPopup('Thinking...', []); // Call showPopup with loading message and empty language list

        const keysToFetch = [
            'apiKey', 'model', 'bulletCount', 'debug', 'availableLanguages', // ADDED availableLanguages here
            PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
            PROMPT_STORAGE_KEY_PREAMBLE,
            PROMPT_STORAGE_KEY_POSTAMBLE,
            // Removed: PROMPT_STORAGE_KEY_TRANSLATION,
            PROMPT_STORAGE_KEY_DEFAULT_FORMAT
        ];

        if (DEBUG) console.log('[LLM Content] Requesting settings from storage:', keysToFetch);

        chrome.storage.sync.get(keysToFetch, (config) => {
            // --- Start of Async Callback ---
            if (chrome.runtime.lastError) {
                console.error('[LLM Content] Error fetching from storage:', chrome.runtime.lastError);
                showPopup(`Error: Could not load extension settings: ${chrome.runtime.lastError.message}`, []);
                // Keep selection/icon if settings failed? Probably better to clear them.
                 removeSelectionHighlight();
                 selectedElement = null;
                 lastHighlighted = null;
                 removeFloatingIcon();
                return;
            }

            // --- Sanitize config object before logging ---
            const configToLog = { ...config };
            if (configToLog.apiKey) {
                configToLog.apiKey = '[API Key Hidden]'; // Mask the API key for logging
            }
            if (DEBUG) console.log('[LLM Content] Settings received from storage:', configToLog);
            // --- End Sanitize ---


            // --- Options Validation ---
            let validationErrors = [];
            if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
                validationErrors.push("API Key is missing or invalid.");
            }
            if (!config.model || typeof config.model !== 'string' || config.model.trim() === '') {
                validationErrors.push("Default Model is not selected or invalid.");
            }
            if (!config.prompt_preamble_template || typeof config.prompt_preamble_template !== 'string' || config.prompt_preamble_template.trim() === '') {
                validationErrors.push("Core Prompt Preamble Template is missing.");
            }
            if (!config.prompt_postamble_text || typeof config.prompt_postamble_text !== 'string' || config.prompt_postamble_text.trim() === '') {
                validationErrors.push("Core Prompt Postamble Text is missing.");
            }
            if (!config.prompt_default_format_instructions || typeof config.prompt_default_format_instructions !== 'string' || config.prompt_default_format_instructions.trim() === '') {
                validationErrors.push("Core Default Prompt Format Instructions are missing.");
            }
             // Removed validation for translation template


            if (validationErrors.length > 0) {
                console.error("[LLM Content] Options validation failed:", validationErrors);
                let errorMsg = "Errors in options!\n\nRequired settings are missing or invalid. Please check:\n- " + validationErrors.join("\n- ");
                errorMsg += "\n\nClick OK to open the options configuration screen.";

                // Remove "Thinking..." popup if it's still there and matches the initial state
                const existingPopup = document.querySelector(`.${POPUP_CLASS}`);
                 if (existingPopup && existingPopup.textContent.includes('Thinking...')) {
                     existingPopup.remove();
                 }

                alert(errorMsg); // Show alert

                chrome.runtime.sendMessage({ action: "openOptionsPage" }, (response) => {
                     if (chrome.runtime.lastError) {
                         console.error("[LLM Content] Error sending openOptionsPage message:", chrome.runtime.lastError.message);
                         try { window.open(chrome.runtime.getURL('options.html')); } catch (e) {} // Fallback attempt
                     } else {
                         if (DEBUG) console.log("[LLM Content] Options page open request sent.");
                     }
                });
                 // Clear selection and icon on validation failure
                 removeSelectionHighlight();
                 selectedElement = null;
                 lastHighlighted = null;
                 removeFloatingIcon(); // --- FIX: Remove icon on validation failure ---
                return; // Stop processing
            }
            // --- END: Options Validation ---

            DEBUG = !!config.debug; // Update debug status

            // --- Selection Validation ---
            // Check if the currently selected global element is STILL the one we started processing
            // AND if the element is still in the DOM for robustness.
            if (selectedElement !== currentSelectedElement || !document.body.contains(currentSelectedElement)) {
                 if (DEBUG) {
                      if (selectedElement !== currentSelectedElement) console.warn('[LLM Content] Element selection changed during async settings load. Aborting.');
                      else if (!document.body.contains(currentSelectedElement)) console.warn('[LLM Content] Original selected element removed from DOM during async settings load. Aborting.');
                 }
                 // Remove "Thinking..." popup if it's still there and matches the initial state
                 const existingPopup = document.querySelector(`.${POPUP_CLASS}`);
                 if (existingPopup && existingPopup.textContent.includes('Thinking...')) {
                     existingPopup.remove();
                 }
                 // Don't necessarily remove highlight/icon here; another process might own them now.
                 // The new selection/deselect logic will handle clearing them if needed.
                 // --- FIX: Remove icon on selection validation failure ---
                 removeFloatingIcon();
                 // --- END FIX ---
                 return; // Abort processing
            }
            // --- END: Selection Validation ---


            // --- If we reach here, settings are valid and selection is stable. ---
            // DO NOT remove highlight and icon here. They should remain until the final popup is shown.
            // removeSelectionHighlight();
            // removeFloatingIcon();

            try {
                const apiKey = config.apiKey; // Use apiKey here
                const model = config.model;
                const bulletCount = config.bulletCount || 5;
                // Removed: const translate = config.translate;
                // Removed: const translateLanguage = config.translateLanguage;

                // --- DETERMINE TARGET LANGUAGE FOR SUMMARY ---
                const availableLanguages = Array.isArray(config.availableLanguages) ? config.availableLanguages : [];
                // Find the first valid language name from the configured list
                const firstConfiguredLanguage = availableLanguages
                    .map(name => name.trim())
                    .filter(name => name !== '')
                    .find(name => findLanguageByName(name)); // Find the first name that exists in our language data

                // Use the first configured language, or fallback to "US English"
                const targetLanguageForSummary = firstConfiguredLanguage || 'US English';
                if (DEBUG) console.log('[LLM Content] Target language for summary:', targetLanguageForSummary);
                lastSummaryLanguageUsed = targetLanguageForSummary; // Store the language used for the summary

                // --- END DETERMINE TARGET LANGUAGE ---


                const customFormatInstructions = config[PROMPT_STORAGE_KEY_CUSTOM_FORMAT];
                const preambleTemplate = config[PROMPT_STORAGE_KEY_PREAMBLE];
                const postambleText = config[PROMPT_STORAGE_KEY_POSTAMBLE];
                // Removed: const translationTemplate = config[PROMPT_STORAGE_KEY_TRANSLATION];
                const defaultFormatInstructions = config[PROMPT_STORAGE_KEY_DEFAULT_FORMAT];

                if (!currentSelectedElement) { // Redundant check, but safe
                    console.error('[LLM Content] selectedElement somehow became null after validation!');
                    showPopup('Error: Element selection lost unexpectedly.', []);
                    // --- FIX: Remove icon on unexpected null selectedElement ---
                    removeFloatingIcon();
                    // --- END FIX ---
                    return;
                }
                // Use outerHTML if available, fallback to innerHTML, then textContent
                const htmlContent = currentSelectedElement.outerHTML || currentSelectedElement.innerHTML || currentSelectedElement.textContent || '';
                if (!htmlContent.trim()) {
                    console.warn('[LLM Content] Selected element has no content.');
                    // --- FIX: Move highlight and icon removal here for no-content error ---
                    removeSelectionHighlight();
                    selectedElement = null;
                    lastHighlighted = null;
                    removeFloatingIcon();
                    // --- END FIX ---
                    showPopup('Error: Selected element has no content.', []);
                    return;
                }

                if (DEBUG) console.log('[LLM Content] Calling getSystemPrompt...');
                const systemPrompt = getSystemPrompt(
                    bulletCount, customFormatInstructions,
                    preambleTemplate, postambleText, defaultFormatInstructions,
                    targetLanguageForSummary // PASS the determined language
                );
                if (DEBUG) console.log('[LLM Content] System prompt assembled successfully.');
                if (DEBUG) console.log("Using System Prompt:", systemPrompt);

                if (DEBUG) console.log('[LLM Content] Calling sendToLLM...');
                 // sendToLLM will handle showing the final popup with results/errors
                 // Pass the availableLanguages array to sendToLLM so it can pass it to showPopup
                sendToLLM(htmlContent, apiKey, model, systemPrompt); // Pass apiKey here
                if (DEBUG) console.log('[LLM Content] sendToLLM called. Waiting for response...');

            } catch (error) {
                console.error('[LLM Content] Error processing settings or generating prompt:', error);
                // --- FIX: Move highlight and icon removal here for processing error ---
                removeSelectionHighlight();
                selectedElement = null;
                lastHighlighted = null;
                removeFloatingIcon();
                // --- END FIX ---
                showPopup(`Error processing selection: ${error.message || 'Unknown error'}`, []);
            }
            // --- End of Async Callback ---
        });
        if (DEBUG) console.log('[LLM Content] storage.sync.get request initiated. Waiting for callback...');
    }


    // --- Floating Icon ---
    function removeFloatingIcon() {
        if (floatingIcon && floatingIcon.parentNode) {
            // Remove event listeners added in createFloatingIcon
            if (floatingIcon.__clickListener) {
                 floatingIcon.removeEventListener('click', floatingIcon.__clickListener);
                 delete floatingIcon.__clickListener;
            }
             if (floatingIcon.__keydownListener) {
                 floatingIcon.removeEventListener('keydown', floatingIcon.__keydownListener);
                 delete floatingIcon.__keydownListener;
            }

            floatingIcon.parentNode.removeChild(floatingIcon);
            floatingIcon = null;
            if (DEBUG) console.log('[LLM Content] Floating icon removed.');
        }
    }

    // Create and position the floating icon at specific coordinates
    function createFloatingIcon(clickX, clickY) {
        removeFloatingIcon(); // Remove any existing icon first

        floatingIcon = document.createElement('div');
        floatingIcon.className = FLOATING_ICON_CLASS;
        floatingIcon.setAttribute('aria-label', 'Summarize this element');
        floatingIcon.setAttribute('role', 'button');
        floatingIcon.setAttribute('tabindex', '0'); // Make it focusable
        floatingIcon.title = 'Summarize this element (Click or press Enter)';

        // Load the extension icon using chrome.runtime.getURL
        let iconUrl = '';
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
                iconUrl = chrome.runtime.getURL('icons/icon32.png'); // Path to your extension icon
            } else {
                 throw new Error("chrome.runtime API not available");
            }
        } catch (e) {
            console.warn("[LLM Content] Could not get icon URL", e);
            iconUrl = ''; // Ensure iconUrl is empty on error
        }

        const iconImg = document.createElement('img');
        iconImg.src = iconUrl;
        iconImg.alt = 'Summarize';
        iconImg.style.pointerEvents = 'none'; // Prevent icon img from interfering with mouse events on the div

        // Handle icon loading errors (e.g., file not found)
        iconImg.onerror = function() {
            iconImg.style.display = 'none'; // Hide the broken image icon
            // Add a fallback text/emoji icon if the image fails
            if (!floatingIcon.querySelector('.llm-fallback-icon')) {
                const fallback = document.createElement('span');
                fallback.className = 'llm-fallback-icon'; // Style this in CSS
                fallback.textContent = '💡'; // Or some other character
                fallback.style.pointerEvents = 'none'; // Prevent fallback from interfering
                floatingIcon.appendChild(fallback);
            }
             if (DEBUG) console.warn('[LLM Content] Failed to load icon image, using fallback.');
        };

        // If iconUrl is empty (e.g., chrome.runtime is not available), trigger onerror manually
        if (!iconUrl) iconImg.onerror();

        floatingIcon.appendChild(iconImg);

        // Position the icon using the click coordinates passed in
        const iconSize = 32; // Match the icon div size in CSS
        const margin = 5; // Margin from window edges

        let iconX = clickX - iconSize / 2; // Center icon horizontally on click point
        // REMOVED: let iconY = clickY - iconY / 2; // This line caused the ReferenceError

        // Corrected positioning calculation
        // The diagnostic correctly identified that the line above was the issue
        // and the calculation below is the correct one.
        let iconY = clickY - iconSize / 2;


        // Clamp icon position to stay within the viewport (considering scroll)
        iconX = Math.max(window.scrollX + margin, Math.min(iconX, window.scrollX + window.innerWidth - iconSize - margin));
        iconY = Math.max(window.scrollY + margin, Math.min(iconY, window.scrollY + window.innerHeight - iconSize - margin));

        floatingIcon.style.left = `${iconX}px`;
        floatingIcon.style.top = `${iconY}px`;

        floatingIcon.style.pointerEvents = 'auto'; // Ensure the div is clickable

        // Add click listener to the floating icon
        // Store listener reference to remove it later
        floatingIcon.__clickListener = (e) => {
             e.stopPropagation(); // Prevent click from bubbling up
             e.preventDefault(); // Prevent default action
             if (DEBUG) console.log('[LLM Content] Floating icon clicked.');
             // Highlight and icon will be removed *inside* processSelectedElement
             processSelectedElement(); // Trigger the summarization process
        };
        floatingIcon.addEventListener('click', floatingIcon.__clickListener);

        // Add keydown listener for accessibility (Enter/Space to activate, Escape to dismiss)
        floatingIcon.__keydownListener = (e) => {
             if (e.key === 'Enter' || e.key === ' ') {
                 e.preventDefault(); e.stopPropagation();
                 if (DEBUG) console.log('[LLM Content] Floating icon activated via keyboard.');
                 // Highlight and icon will be removed *inside* processSelectedElement
                 processSelectedElement(); // Trigger the summarization process
             }
             if (e.key === 'Escape') {
                 e.preventDefault(); e.stopPropagation();
                 if (DEBUG) console.log('[LLM Content] Floating icon dismissed via Escape.');
                 // Dismiss popup and icon, deselect element
                 hidePopup(); // Hide popup if it's open
                 removeFloatingIcon(); // Remove the icon
                 removeSelectionHighlight(); // Remove highlight
                 selectedElement = null; // Deselect element
                 lastHighlighted = null; // Clear lastHighlighted state
             }
        };
        floatingIcon.addEventListener('keydown', floatingIcon.__keydownListener);


        document.body.appendChild(floatingIcon);
        if (DEBUG) console.log('[LLM Content] Floating icon created at', iconX, iconY);

        // Give focus to the icon for keyboard accessibility
        floatingIcon.focus();
    }


    // --- Alt Key, Mouse, and Click Event Listeners ---

    function resetAltState() {
        if (altKeyDown || previewHighlighted) {
            if (DEBUG) console.log('[LLM Content Alt State] Resetting Alt state.');
            altKeyDown = false;
            if (previewHighlighted) {
                if (document.body.contains(previewHighlighted)) {
                    previewHighlighted.classList.remove(HIGHLIGHT_PREVIEW_CLASS);
                }
                previewHighlighted = null;
            }
        }
    }

    const handleKeyDown = (e) => {
        // Check if Alt is pressed and it's not already tracked as down
        if (e.key === 'Alt' && !altKeyDown) {
            // Check if the active element is an input field or content editable
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                if (DEBUG) console.log('[LLM Content Alt State] Ignoring Alt down in input/editable element.');
                return; // Do not activate Alt mode if typing
            }
            altKeyDown = true;
            if (DEBUG) console.log('[LLM Content Alt State] Alt key down.');
        }
    };

    const handleKeyUp = (e) => {
        if (e.key === 'Alt') {
            if (DEBUG) console.log('[LLM Content Alt State] Alt key up.');
             // We rely on blur/click/etc. to reset the state, not just keyup
        }
    };

    // Using named functions for clarity when adding listeners later
    const handleMouseOver = (e) => {
        // If Alt is not down, ensure no preview highlight is active
        if (!altKeyDown) {
            if (previewHighlighted) {
                if (document.body.contains(previewHighlighted)) {
                    previewHighlighted.classList.remove(HIGHLIGHT_PREVIEW_CLASS);
                }
                previewHighlighted = null;
            }
            return; // Exit if Alt is not pressed
        }

        // Find the element under the cursor
        let target = document.elementFromPoint(e.clientX, e.clientY);

        // Ignore highlighting our UI elements
        if (!target || target.closest(`.${POPUP_CLASS}`) || target.closest(`.${FLOATING_ICON_CLASS}`)) {
            if (previewHighlighted) {
                if (document.body.contains(previewHighlighted)) {
                    previewHighlighted.classList.remove(HIGHLIGHT_PREVIEW_CLASS);
                }
                previewHighlighted = null;
            }
            return; // Exit if hovering over ignored elements
        }

        // Sometimes elementFromPoint returns body/html when hovering over content.
        // Check if there's a deeper element at the point.
         if ((target === document.body || target === document.documentElement) && document.elementsFromPoint(e.clientX, e.clientY).length > 1) {
            const deeperTarget = document.elementsFromPoint(e.clientX, e.clientY)[1];
             // Ensure the deeper target is also not one of the ignored elements
            if (deeperTarget && !deeperTarget.closest(`.${POPUP_CLASS}`) && !deeperTarget.closest(`.${FLOATING_ICON_CLASS}`)) {
                target = deeperTarget;
            } else {
                 // If deeper target is ignored, remove highlight and exit
                 if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove(HIGHLIGHT_PREVIEW_CLASS); } previewHighlighted = null; } return;
            }
        }

        // If the target is the currently selected element, don't preview highlight it
        if (target === selectedElement) {
             // Also remove preview highlight from any *other* element if we just moused over the selected one
             if (previewHighlighted && previewHighlighted !== selectedElement) {
                 if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove(HIGHLIGHT_PREVIEW_CLASS); }
                 previewHighlighted = null;
             }
             return; // Exit if hovering over the selected element
        }

        // If the target is different from the currently preview highlighted element
        if (previewHighlighted !== target) {
            // Remove highlight from the old element if it exists and is still in the DOM
            if (previewHighlighted && document.body.contains(previewHighlighted)) {
                previewHighlighted.classList.remove(HIGHLIGHT_PREVIEW_CLASS);
            }
            // Set the new element as preview highlighted and apply the class
            previewHighlighted = target;
            if (previewHighlighted) { // Ensure target is not null
                previewHighlighted.classList.add(HIGHLIGHT_PREVIEW_CLASS);
            }
        }
    }; // No 'true' needed here for capture phase, just for addEventListener later


    const handleMouseOut = (e) => {
         // If mouse leaves the window entirely and an element is highlighted
        if (!e.relatedTarget && previewHighlighted) {
            if (DEBUG) console.log('[LLM Content] Mouse left window.');
            if (document.body.contains(previewHighlighted)) {
                previewHighlighted.classList.remove(HIGHLIGHT_PREVIEW_CLASS);
            }
            previewHighlighted = null;
        }
    };


    const handleClick = (e) => {
        // Ignore clicks inside the floating icon, popup, or flags area
        if (e.target.closest(`.${FLOATING_ICON_CLASS}`) || e.target.closest(`.${POPUP_CLASS}`) || e.target.closest(`.${POPUP_FLAGS_CLASS}`)) {
             if (DEBUG) console.log('[LLM Content] Mousedown ignored on icon, popup, or flags.');
             return; // Exit if clicking any of our extension's UI elements
        }

        // Handle Alt+Left Click for selection
        if (e.altKey && e.button === 0) {
            e.preventDefault(); // Prevent default click action (like following links)
            e.stopPropagation(); // Stop event from bubbling up

            const clickedTarget = e.target;

            // Remove any previous preview highlight
            if (previewHighlighted) {
                if (document.body.contains(previewHighlighted)) {
                    previewHighlighted.classList.remove(HIGHLIGHT_PREVIEW_CLASS);
                }
                previewHighlighted = null;
            }

            // Check if the clicked target is the same as the previously selected element
            // If so, this is a deselect action
            if (selectedElement === clickedTarget) {
                removeSelectionHighlight(); // Use the new dedicated function to remove class
                selectedElement = null; // Clear the state variable
                lastHighlighted = null; // Also clear lastHighlighted state
                removeFloatingIcon(); // Remove icon on deselect
                if (DEBUG) console.log('[LLM Content] Deselected element.');
            } else {
                // If a different element was clicked with Alt, select it
                // Ensure the new target is not null (should be covered by initial checks)
                if (clickedTarget) {
                     // Remove highlight from previous selection if it exists
                    removeSelectionHighlight(); // Use the new dedicated function

                     selectedElement = clickedTarget; // Set the new element as selected
                     lastHighlighted = clickedTarget; // Keep track of the last selected element
                     selectedElement.classList.add(HIGHLIGHT_SELECTED_CLASS); // Add highlight to the new element

                     // Create and show the floating icon at the click coordinates
                     createFloatingIcon(e.pageX, e.pageY);

                     if (DEBUG) console.log('[LLM Content] Selected element:', selectedElement);
                } else {
                    // Should not happen with the initial checks, but for safety
                    if (DEBUG) console.warn('[LLM Content] Alt+Click target invalid (null).');
                    // Ensure state is clean if target is invalid
                    removeSelectionHighlight();
                    selectedElement = null;
                    lastHighlighted = null;
                    removeFloatingIcon();
                }
            }
            // Preview highlight should be gone already by mousemove/mouseout or the explicit removal above
            // previewHighlighted = null; // Redundant, but harmless

            return; // Stop further processing for Alt+Click
        }

        // Handle regular Left Click (without Alt) for deselecting
        if (!e.altKey && e.button === 0) {
             // Check if there is a selected element AND the click was outside of it
             // AND the click was outside the popup AND outside the floating icon
             if (selectedElement && !selectedElement.contains(e.target) && !e.target.closest(`.${POPUP_CLASS}`) && !e.target.closest(`.${FLOATING_ICON_CLASS}`)) {
                 if (DEBUG) console.log('[LLM Content] Click outside detected. Deselecting.');
                 removeSelectionHighlight(); // Use the new dedicated function
                 selectedElement = null;
                 lastHighlighted = null; // Also clear lastHighlighted state
                 removeFloatingIcon(); // Remove icon on deselect
             } else {
                 if (DEBUG && selectedElement) console.log('[LLM Content] Regular click inside selected area or popup/icon detected. Not deselecting.');
             }
        }
    }; // Use capturing phase for addEventListener later


    // --- Message Listener from Background ---
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
        if (DEBUG) console.log('[LLM Content] Received message:', req.action);

        // Handle the command to process the currently selected element
        if (req.action === 'processSelection') {
            if (DEBUG) console.log('[LLM Content] Received processSelection command.');
            // This command is typically sent by the background script
            // when the user clicks the browser action button or a context menu item.
            // It should only proceed if an element is already selected.
            if (selectedElement) {
                 // Highlight and icon will be removed *inside* processSelectedElement after validation
                 processSelectedElement(); // This starts the async process
                 sendResponse({status: "processing started"}); // Acknowledge start
                 return true; // Indicate potential async work (important!)
            } else {
                 console.warn('[LLM Content] Received processSelection but no element is selected.');
                 showPopup('Error: No element selected. Use Alt+Click to select an element first.', []);
                 // --- FIX: Remove icon if processSelection command is received without a selected element ---
                 removeFloatingIcon();
                 // --- END FIX ---
                 sendResponse({status: "no element selected"});
                 return false;
            }
        }
         // Redundant messages from background script based on current flow, but keeping for safety
        else if (req.action === "showSummaryPopup") {
             if (DEBUG) console.log("Popup (Content Script): Received showSummaryPopup message from background.");
             console.warn('[LLM Content] Received potentially unused showSummaryPopup message.'); // Indicate this path might not be the main one
             if (req.summaryHtml) {
                  chrome.storage.sync.get(['availableLanguages'], (cfg) => {
                      showPopup(req.summaryHtml, cfg.availableLanguages || []); // Show popup with HTML string and languages
                 });
             } else if (req.error) {
                  showPopup(`Error: ${req.error}`, []);
             } else {
                   showPopup("An unknown error occurred while attempting to show summary from background message.", []);
             }
             sendResponse({ status: "popup show request received (might be redundant)" });
             return true;
         } else if (req.action === "hideSummaryPopup") {
              if (DEBUG) console.log("Popup (Content Script): Received hideSummaryPopup message from background.");
              console.warn('[LLM Content] Received potentially unused hideSummaryPopup message.'); // Indicate this path might not be the main one
              hidePopup();
              sendResponse({ status: "popup hide request received (might be redundant)" });
              return true;
         }


         // For other messages, return false or nothing
         return false;
    });


    // --- Initial Setup ---
    // Get initial debug state
     chrome.storage.sync.get(['debug'], (result) => {
      if (chrome.runtime.lastError) { console.error('[LLM Content] Error getting initial debug setting:', chrome.runtime.lastError); }
      else { DEBUG = !!result.debug; if (DEBUG) console.log('[LLM Content] Initial Debug mode:', DEBUG); }
    });

    // Load language data immediately when the script runs.
    // This ensures the data is available before any messages to show the popup are received
    // or before flags are rendered if the popup is shown.
    await loadLanguageData();

    // Add global event listeners for Alt key and mouse interactions
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp); // Note: No resetAltState on keyup anymore, relies on blur/click
    window.addEventListener('blur', resetAltState); // Reset state if window loses focus
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { resetAltState(); } }); // Reset state if tab is hidden
    document.addEventListener('mousemove', handleMouseOver, true); // Use capturing phase
    window.addEventListener('mouseout', handleMouseOut); // Added mouseout handler
    // Use capturing phase for click to ensure it runs before most other click handlers
    document.addEventListener('mousedown', handleClick, true);

    console.log('[LLM Content] Script Initialized. Listening for Alt key, mouse events, and messages.');

})(); // End of async IIFE
