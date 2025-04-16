/* content.js */
// == OpenRouter Summarizer Content Script ==
// v2.3.1 - Added options validation on execution.

console.log('[LLM Content] Script Start');

try { // Keep top-level try-catch

    // --- Constants (Non-Prompt Related) ---
    const LANGUAGE_DISPLAY = {
      english: "English", spanish: "Spanish", french: "French", mandarin: "Mandarin",
      arabic: "Arabic", hebrew: "Hebrew", russian: "Russian"
      // Note: This mapping is now only used locally if needed,
      // the actual language name for the prompt comes from storage.
    };
    const numToWord = { 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };

    // --- Storage Keys ---
    const PROMPT_STORAGE_KEY_CUSTOM_FORMAT = 'prompt_custom_format_instructions';
    const PROMPT_STORAGE_KEY_PREAMBLE = 'prompt_preamble_template';
    const PROMPT_STORAGE_KEY_POSTAMBLE = 'prompt_postamble_text';
    const PROMPT_STORAGE_KEY_TRANSLATION = 'prompt_translation_template';
    const PROMPT_STORAGE_KEY_DEFAULT_FORMAT = 'prompt_default_format_instructions';


    // --- Prompt Assembly Function ---
    function getSystemPrompt(
        bulletCount,
        translate,
        translateLanguage, // The actual language name string
        customFormatInstructions, // User's custom text
        preambleTemplate,         // Template string from storage
        postambleText,            // Fixed string from storage
        translationTemplate,      // Template string from storage
        defaultFormatInstructions // Default format string from storage
    ) {
        const bcNum = Number(bulletCount) || 5;
        const word = numToWord[bcNum] || "five";

        // Use loaded templates/defaults
        const finalPreamble = preambleTemplate ? preambleTemplate.replace('${bulletWord}', word) : `[Error: Preamble template missing] Prepare summary with ${word} points.`;
        const finalFormatInstructions = (customFormatInstructions && customFormatInstructions.trim() !== '') ? customFormatInstructions : defaultFormatInstructions || "[Error: Default format instructions missing]";
        const finalPostamble = postambleText || "[Error: Postamble text missing]";

        let prompt = finalPreamble + "\n" + finalFormatInstructions;

        if (translate && translateLanguage && translateLanguage !== 'none' && translationTemplate) {
            // Use the already resolved language name directly
            const finalTranslationInstruction = translationTemplate.replace('${langName}', translateLanguage);
            prompt += "\n" + finalTranslationInstruction;
        } else if (translate && (!translationTemplate || !translateLanguage || translateLanguage === 'none')) {
             console.warn("[LLM Content] Translation requested but template or language name missing from storage.");
             // Optionally add a fallback message or just omit
        }

        prompt += "\n" + finalPostamble;
        return prompt;
    }

    // --- State Variables ---
    let selectedElement = null; let lastHighlighted = null; let altKeyDown = false;
    let previewHighlighted = null; let floatingIcon = null; let DEBUG = false;
    let lastSummary = ''; // Raw LLM response string
    let lastSummaryHtml = ''; // Generated <ul><li>...</li></ul> HTML
    let lastModelUsed = '';

    // --- Initialization (Get initial debug state only) ---
    chrome.storage.sync.get(['debug'], (result) => {
      if (chrome.runtime.lastError) { console.error('[LLM Content] Error getting initial debug setting:', chrome.runtime.lastError); }
      else { DEBUG = !!result.debug; }
      if (DEBUG) console.log('[LLM Content] Initial Debug mode:', DEBUG);
    });

    // --- Helper Function to Reset Alt State ---
    function resetAltState() { if (altKeyDown || previewHighlighted) { if (DEBUG) console.log('[LLM Content Alt State] Resetting Alt state.'); altKeyDown = false; if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } } }

    // --- Event Listeners for ALT Key, Focus, Visibility ---
    window.addEventListener('keydown', (e) => { if (e.key === 'Alt' && !altKeyDown) { const activeEl = document.activeElement; if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) { if (DEBUG) console.log('[LLM Content Alt State] Ignoring Alt down in input.'); return; } altKeyDown = true; if (DEBUG) console.log('[LLM Content Alt State] Alt key down.'); } });
    window.addEventListener('keyup', (e) => { if (e.key === 'Alt') { if (DEBUG) console.log('[LLM Content Alt State] Alt key up.'); resetAltState(); } });
    window.addEventListener('blur', () => { if (DEBUG) console.log('[LLM Content Alt State] Window blurred.'); resetAltState(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { if (DEBUG) console.log('[LLM Content Alt State] Document hidden.'); resetAltState(); } });

    // --- Mouse Listeners (Highlighting & Selection) ---
    window.addEventListener('mouseout', (e) => { if (!e.relatedTarget && previewHighlighted) { if (DEBUG) console.log('[LLM Content] Mouse left window.'); if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } });
    document.addEventListener('mousemove', (e) => { if (!altKeyDown) { if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } return; } let target = document.elementFromPoint(e.clientX, e.clientY); if (!target || target.closest('.summarizer-popup') || target.closest('.summarizer-btn') || target.classList.contains('llm-floating-icon')) { if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } return; } if ((target === document.body || target === document.documentElement) && document.elementsFromPoint(e.clientX, e.clientY).length > 1) { const deeperTarget = document.elementsFromPoint(e.clientX, e.clientY)[1]; if (deeperTarget && !deeperTarget.closest('.summarizer-popup') && !deeperTarget.closest('.summarizer-btn') && !deeperTarget.classList.contains('llm-floating-icon')) { target = deeperTarget; } else { if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } return; } } if (target === selectedElement) { if (previewHighlighted && previewHighlighted !== selectedElement) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } return; } if (previewHighlighted !== target) { if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } } previewHighlighted = target; if (previewHighlighted) { previewHighlighted.classList.add('llm-highlight-preview'); } } }, true);
    document.addEventListener('mousedown', e => { if (e.target.closest('.llm-floating-icon')) return; if (e.altKey && e.button === 0) { e.preventDefault(); e.stopPropagation(); const clickedTarget = e.target; if (previewHighlighted) { if (document.body.contains(previewHighlighted)) { previewHighlighted.classList.remove('llm-highlight-preview'); } previewHighlighted = null; } removeFloatingIcon(); if (selectedElement === clickedTarget) { if (document.body.contains(selectedElement)) { selectedElement.classList.remove('llm-highlight'); } selectedElement = null; lastHighlighted = null; removeFloatingIcon(); if (DEBUG) console.log('[LLM Content] Deselected element.'); } else { if (lastHighlighted && document.body.contains(lastHighlighted)) { lastHighlighted.classList.remove('llm-highlight'); } if (clickedTarget && !clickedTarget.closest('.summarizer-popup')) { selectedElement = clickedTarget; lastHighlighted = clickedTarget; selectedElement.classList.add('llm-highlight'); createFloatingIcon(e.pageX, e.pageY); if (DEBUG) console.log('[LLM Content] Selected element:', selectedElement); } else { if (DEBUG) console.warn('[LLM Content] Alt+Click target invalid.'); selectedElement = null; lastHighlighted = null; } } previewHighlighted = null; return; } if (!e.altKey && e.button === 0) { if (selectedElement && !selectedElement.contains(e.target) && !e.target.closest('.llm-floating-icon') && !e.target.closest('.summarizer-popup')) { if (DEBUG) console.log('[LLM Content] Click outside detected. Deselecting.'); if (document.body.contains(selectedElement)) { selectedElement.classList.remove('llm-highlight'); } selectedElement = null; lastHighlighted = null; removeFloatingIcon(); } else { if (DEBUG && selectedElement) console.log('[LLM Content] Regular click inside detected.'); } } }, true);

    // --- Floating Icon ---
    function removeFloatingIcon() { if (floatingIcon && floatingIcon.parentNode) { floatingIcon.parentNode.removeChild(floatingIcon); floatingIcon = null; } }
    function createFloatingIcon(clickX, clickY) { removeFloatingIcon(); floatingIcon = document.createElement('div'); floatingIcon.className = 'llm-floating-icon'; floatingIcon.setAttribute('aria-label', 'Summarize this element'); floatingIcon.setAttribute('role', 'button'); floatingIcon.setAttribute('tabindex', '0'); floatingIcon.title = 'Summarize this element (Click or press Enter)'; let iconUrl = ''; try { if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') { iconUrl = chrome.runtime.getURL('icons/icon32.png'); } } catch (e) { console.warn("[LLM Content] Could not get icon URL", e); } const iconImg = document.createElement('img'); iconImg.src = iconUrl; iconImg.alt = 'Summarize'; iconImg.style.pointerEvents = 'none'; iconImg.onerror = function() { iconImg.style.display = 'none'; if (!floatingIcon.querySelector('.llm-fallback-icon')) { const fallback = document.createElement('span'); fallback.className = 'llm-fallback-icon'; fallback.textContent = '💡'; fallback.style.pointerEvents = 'none'; floatingIcon.appendChild(fallback); } }; if (!iconUrl) iconImg.onerror(); floatingIcon.appendChild(iconImg); const iconSize = 32; const margin = 5; let iconX = clickX - iconSize / 2; let iconY = clickY - iconSize / 2; iconX = Math.max(window.scrollX + margin, Math.min(iconX, window.scrollX + window.innerWidth - iconSize - margin)); iconY = Math.max(window.scrollY + margin, Math.min(iconY, window.scrollY + window.innerHeight - iconSize - margin)); floatingIcon.style.left = `${iconX}px`; floatingIcon.style.top = `${iconY}px`; floatingIcon.style.pointerEvents = 'auto'; floatingIcon.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); if (DEBUG) console.log('[LLM Content] Floating icon clicked.'); removeFloatingIcon(); processSelectedElement(); }); floatingIcon.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (DEBUG) console.log('[LLM Content] Floating icon activated via keyboard.'); removeFloatingIcon(); processSelectedElement(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (DEBUG) console.log('[LLM Content] Floating icon dismissed via Escape.'); removeFloatingIcon(); if (selectedElement && document.body.contains(selectedElement)) { selectedElement.classList.remove('llm-highlight'); selectedElement = null; lastHighlighted = null; } } }); document.body.appendChild(floatingIcon); }

    // --- Popup Display ---
    function showPopup(content) {
        const existing = document.querySelector('.summarizer-popup');
        if (existing) { if (DEBUG) console.log('[LLM Content] Removing existing popup.'); existing.remove(); }
        const popup = document.createElement('div'); popup.className = 'summarizer-popup';
        const header = document.createElement('div'); header.className = 'summarizer-header';
        header.textContent = 'Summary'; popup.appendChild(header);
        const contentDiv = document.createElement('div'); contentDiv.className = 'summarizer-body';
        let copyTimeoutId = null;
        if (typeof content === 'string') {
             if (content === 'Thinking...' || content.startsWith('Error:')) {
                 contentDiv.textContent = content;
                 if (DEBUG) console.log('[LLM Content] Showing popup with text:', content);
             } else {
                 contentDiv.innerHTML = content;
                 if (DEBUG) console.log('[LLM Content] Showing popup with generated HTML:', content);
                 if (DEBUG) console.log('[LLM Content] Raw LLM response state (lastSummary):', lastSummary);
             }
         } else {
             contentDiv.textContent = "Error: Invalid content type for popup.";
             lastSummary = contentDiv.textContent;
             lastSummaryHtml = '';
             if (DEBUG) console.error('[LLM Content] Invalid content type passed to showPopup:', content);
         }
        popup.appendChild(contentDiv);
        const actions = document.createElement('div'); actions.className = 'summarizer-actions';
        const copyBtn = document.createElement('button'); copyBtn.className = 'summarizer-btn copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => {
            if (copyTimeoutId) clearTimeout(copyTimeoutId);
            let val = '';
            const listItems = contentDiv.querySelectorAll('li');
            if (listItems.length > 0) {
                val = Array.from(listItems).map((li, idx) => `${idx + 1}. ${li.innerText.trim()}`).join('\n');
            } else {
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
        const chatBtn = document.createElement('button');
        chatBtn.className = 'summarizer-btn chat-btn';
        chatBtn.textContent = 'Chat';
        chatBtn.disabled = !lastSummaryHtml;
        chatBtn.onclick = openChatWithContext;
        actions.appendChild(chatBtn);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'summarizer-btn close-btn';
        closeBtn.textContent = 'Close';
        closeBtn.onclick = () => popup.remove();
        actions.appendChild(closeBtn);
        popup.appendChild(actions);
        document.body.appendChild(popup);
        if (DEBUG) console.log('[LLM Content] New popup added to page.');
    }


    // --- Chat Context Handling ---
    function openChatWithContext() {
        if (!selectedElement) { alert("Cannot open chat: Original element selection lost."); if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: selectedElement is null.'); return; }
        if (!lastSummary || lastSummary === 'Thinking...' || lastSummary.startsWith('Error:')) { alert("Cannot open chat: No valid summary available."); if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: No valid summary found in lastSummary.'); return; }
        if (!lastSummaryHtml) { alert("Cannot open chat: Summary parsing failed."); if (DEBUG) console.warn('[LLM Chat Context] Chat attempt failed: lastSummaryHtml is empty.'); return; }
        const domSnippet = selectedElement.outerHTML || selectedElement.innerHTML || selectedElement.textContent || "";
        const summaryForChat = lastSummary; // Pass the RAW LLM response string
        if (DEBUG) { console.log('[LLM Chat Context] Preparing context:', { snippetLen: domSnippet.length, summaryRawString: summaryForChat, model: lastModelUsed }); }
        chrome.runtime.sendMessage({ action: "setChatContext", domSnippet: domSnippet, summary: summaryForChat, summaryModel: lastModelUsed }, function(response) {
            if (chrome.runtime.lastError) { console.error('[LLM Chat Context] Error sending context:', chrome.runtime.lastError); alert(`Error preparing chat: ${chrome.runtime.lastError.message}`); return; }
            if (response && response.status === 'ok') {
                if (DEBUG) console.log('[LLM Chat Context] Background confirmed context. Requesting tab open.');
                chrome.runtime.sendMessage({ action: "openChatTab" }, (openResponse) => {
                    if (chrome.runtime.lastError) { console.error('[LLM Chat Context] Error requesting tab open:', chrome.runtime.lastError); alert(`Error opening chat tab: ${chrome.runtime.lastError.message}.`); }
                    else {
                        if (DEBUG) console.log('[LLM Chat Context] Background ack openChatTab:', openResponse);
                        const existingPopup = document.querySelector('.summarizer-popup');
                        if (existingPopup) existingPopup.remove();
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

            lastSummary = modelOutput; // Store the raw LLM response first

            let jsonStringToParse = modelOutput;
            const jsonFenceMatch = modelOutput.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
            if (jsonFenceMatch && jsonFenceMatch[1]) {
                jsonStringToParse = jsonFenceMatch[1].trim();
                if (DEBUG) console.log('[LLM Content] Stripped JSON code fences. Content to parse:', jsonStringToParse);
            } else {
                 if (DEBUG) console.log('[LLM Content] No JSON code fences detected.');
            }

            try {
                const summaryArray = JSON.parse(jsonStringToParse);
                if (!Array.isArray(summaryArray)) {
                    throw new Error('LLM response (after potential fence stripping) is not a valid JSON array.');
                }
                const summaryHtml = '<ul>' + summaryArray.map(item => `<li>${item}</li>`).join('') + '</ul>';
                lastModelUsed = model;
                lastSummaryHtml = summaryHtml;
                showPopup(summaryHtml); // Update popup with result

            } catch (e) {
                lastSummaryHtml = '';
                showPopup(`Error: Could not parse LLM response as JSON. Raw Output (truncated):\n"${modelOutput.substring(0, 200)}${modelOutput.length > 200 ? '...' : ''}"`);
                console.error('[LLM Error] Failed to process LLM JSON response:', e);
                if (DEBUG) console.log('[LLM Error] Raw output received:', modelOutput);
                if (jsonStringToParse !== modelOutput) {
                     if (DEBUG) console.log('[LLM Error] Content after stripping fences:', jsonStringToParse);
                }
            }
        })
        .catch(err => {
            console.error('[LLM Fetch Error]', err);
            lastSummary = `Error: ${err.message}`;
            lastSummaryHtml = '';
            showPopup(`Error: ${err.message}`); // Update popup with fetch error
        });
    }


    // --- processSelectedElement (MODIFIED for validation) ---
    function processSelectedElement() {
        if (!selectedElement) {
            console.error('[LLM Content] processSelectedElement called but selectedElement is null!');
            showPopup('Error: No element selected.');
            return;
        }
        const currentSelectedElement = selectedElement;
        if (DEBUG) console.log('[LLM Content] processSelectedElement called for element:', currentSelectedElement);

        // Show thinking immediately
        lastSummary = 'Thinking...';
        lastSummaryHtml = '';
        showPopup('Thinking...');

        const keysToFetch = [
            'apiKey', 'model', 'bulletCount', 'translate', 'translateLanguage', 'debug',
            PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
            PROMPT_STORAGE_KEY_PREAMBLE,
            PROMPT_STORAGE_KEY_POSTAMBLE,
            PROMPT_STORAGE_KEY_TRANSLATION,
            PROMPT_STORAGE_KEY_DEFAULT_FORMAT
        ];

        if (DEBUG) console.log('[LLM Content] Requesting settings from storage:', keysToFetch);

        chrome.storage.sync.get(keysToFetch, (config) => {
            // --- Start of Async Callback ---
            if (chrome.runtime.lastError) {
                console.error('[LLM Content] Error fetching from storage:', chrome.runtime.lastError);
                showPopup(`Error: Could not load extension settings: ${chrome.runtime.lastError.message}`);
                return;
            }
            if (DEBUG) console.log('[LLM Content] Settings received from storage:', config);

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
            if (config.translate === true && (!config.prompt_translation_template || typeof config.prompt_translation_template !== 'string' || config.prompt_translation_template.trim() === '')) {
                validationErrors.push("Translation Template is missing (required when translation is enabled).");
            }

            if (validationErrors.length > 0) {
                console.error("[LLM Content] Options validation failed:", validationErrors);
                let errorMsg = "Errors in options!\n\nRequired settings are missing or invalid. Please check:\n- " + validationErrors.join("\n- ");
                errorMsg += "\n\nClick OK to open the options configuration screen.";

                const existingPopup = document.querySelector('.summarizer-popup');
                if (existingPopup) existingPopup.remove(); // Remove "Thinking..." popup

                alert(errorMsg); // Show alert

                chrome.runtime.sendMessage({ action: "openOptionsPage" }, (response) => {
                     if (chrome.runtime.lastError) {
                         console.error("[LLM Content] Error sending openOptionsPage message:", chrome.runtime.lastError.message);
                         try { window.open(chrome.runtime.getURL('options.html')); } catch (e) {} // Fallback attempt
                     } else {
                         if (DEBUG) console.log("[LLM Content] Options page open request sent.");
                     }
                });
                return; // Stop processing
            }
            // --- END: Options Validation ---


            DEBUG = !!config.debug; // Update debug status

            if (selectedElement !== currentSelectedElement) {
                 console.warn('[LLM Content] Element selection changed during async settings load. Aborting.');
                 // Remove "Thinking..." popup if it's still there
                 const existingPopup = document.querySelector('.summarizer-popup');
                 if (existingPopup && existingPopup.textContent.includes('Thinking...')) {
                     existingPopup.remove();
                 }
                 return;
            }

            try {
                const apiKey = config.apiKey;
                const model = config.model;
                const bulletCount = config.bulletCount || 5;
                const translate = config.translate;
                const translateLanguage = config.translateLanguage || 'none';

                const customFormatInstructions = config[PROMPT_STORAGE_KEY_CUSTOM_FORMAT];
                const preambleTemplate = config[PROMPT_STORAGE_KEY_PREAMBLE];
                const postambleText = config[PROMPT_STORAGE_KEY_POSTAMBLE];
                const translationTemplate = config[PROMPT_STORAGE_KEY_TRANSLATION];
                const defaultFormatInstructions = config[PROMPT_STORAGE_KEY_DEFAULT_FORMAT];

                if (!currentSelectedElement) {
                    console.error('[LLM Content] selectedElement became null before getting HTML!');
                    showPopup('Error: Element selection lost.');
                    return;
                }
                const htmlContent = currentSelectedElement.outerHTML || currentSelectedElement.innerHTML || currentSelectedElement.textContent || '';
                if (!htmlContent.trim()) {
                    console.warn('[LLM Content] Selected element has no content.');
                    showPopup('Error: Selected element has no content.');
                    return;
                }

                if (DEBUG) console.log('[LLM Content] Calling getSystemPrompt...');
                const systemPrompt = getSystemPrompt(
                    bulletCount, translate, translateLanguage, customFormatInstructions,
                    preambleTemplate, postambleText, translationTemplate, defaultFormatInstructions
                );
                if (DEBUG) console.log('[LLM Content] System prompt assembled successfully.');
                if (DEBUG) console.log("Using System Prompt:", systemPrompt);

                if (DEBUG) console.log('[LLM Content] Calling sendToLLM...');
                sendToLLM(htmlContent, apiKey, model, systemPrompt);
                if (DEBUG) console.log('[LLM Content] sendToLLM called.');

            } catch (error) {
                console.error('[LLM Content] Error processing settings or generating prompt:', error);
                showPopup(`Error processing selection: ${error.message || 'Unknown error'}`);
            }
            // --- End of Async Callback ---
        });
        if (DEBUG) console.log('[LLM Content] storage.sync.get request initiated. Waiting for callback...');
    }

    // --- Message Listener from Background ---
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
        if (req.action === 'processSelection') {
            if (DEBUG) console.log('[LLM Content] Received processSelection command.');
            processSelectedElement(); // This now starts the async process
            sendResponse({status: "processing started"}); // Acknowledge start
            return true; // Indicate potential async work (important!)
        }
    });

    console.log('[LLM Content] Script End');

} catch (error) {
    console.error('[LLM Content] CRITICAL ERROR during script initialization:', error);
}
