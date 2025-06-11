// joplinManager.js

import { showError } from "./utils.js"; // For displaying errors

console.log(`[LLM JoplinManager] Script Loaded`);

// --- Constants (internal, CSS classes etc.) ---
const JOPLIN_POPUP_CLASS = "joplin-popup";
const JOPLIN_POPUP_HEADER_CONTAINER_CLASS = "joplin-popup-header-container"; // New: Header container class
const JOPLIN_POPUP_HEADER_CLASS = "joplin-popup-header";
const JOPLIN_POPUP_BODY_CLASS = "joplin-popup-body";
const JOPLIN_POPUP_ACTIONS_CLASS = "joplin-popup-actions";
const JOPLIN_BTN_CLASS = "joplin-btn";
const JOPLIN_SAVE_BTN_CLASS = "joplin-save-btn";
const JOPLIN_CANCEL_BTN_CLASS = "joplin-cancel-btn";

// --- Module State ---
let joplinPopupElement = null; // Refers to the created popup DOM element
let DEBUG = false;
let currentJoplinContent = null; // Stored content to be sent to Joplin
let currentJoplinSourceUrl = null; // Stored source URL to be sent to Joplin
let lastUsedNotebookId = null; // To store the ID of the last used notebook
let lastUsedNotebookName = null; // To store the name of the last used notebook

// Storage keys for last used notebook
const STORAGE_KEY_LAST_NOTEBOOK_ID = "lastUsedJoplinNotebookId";
const STORAGE_KEY_LAST_NOTEBOOK_NAME = "lastUsedJoplinNotebookName";

// Autocomplete Specific state
let autocompleteDropdownElement = null;
let highlightedAutocompleteIndex = -1;
let activeAutocompleteInput = null;
let selectedNotebookId = null; // To store the ID of the selected notebook from autocomplete (global to the module)

// --- HTML Template for the Joplin Notebook Selection Popup ---
const JOPLIN_POPUP_TEMPLATE_HTML = `
<div class="${JOPLIN_POPUP_CLASS}" style="display: none;">
    <div class="${JOPLIN_POPUP_HEADER_CONTAINER_CLASS}"> <!-- New: Header container -->
        <div class="${JOPLIN_POPUP_HEADER_CLASS}">Select Joplin Notebook</div>
    </div>
    <div class="${JOPLIN_POPUP_BODY_CLASS}">
        <!-- Content will be dynamically inserted here -->
    </div>
    <div class="${JOPLIN_POPUP_ACTIONS_CLASS}">
        <button class="${JOPLIN_BTN_CLASS} ${JOPLIN_SAVE_BTN_CLASS}" disabled>Save Note</button>
        <button class="${JOPLIN_BTN_CLASS} ${JOPLIN_CANCEL_BTN_CLASS}">Cancel</button>
    </div>
</div>
`;

// --- Internal Helper Functions ---

/**
 * Creates and appends the main Joplin popup element to the DOM.
 * @returns {HTMLElement} The created popup element.
 */
function createJoplinPopupBase() {
    if (joplinPopupElement) {
        hideJoplinPopup(); // Ensure only one popup exists
    }
    const template = document.createElement("template");
    template.innerHTML = JOPLIN_POPUP_TEMPLATE_HTML.trim();
    joplinPopupElement = template.content.firstChild.cloneNode(true);
    document.body.appendChild(joplinPopupElement);
    if (DEBUG) console.log("[LLM JoplinManager] Joplin popup base created and added to DOM.");
    return joplinPopupElement;
}

/**
 * Updates the content of the Joplin popup body.
 * @param {string} htmlContent - The HTML content to set for the body.
 * @param {boolean} [isPlaceholder=false] - True if the content is a placeholder (e.g., loading message).
 */
function updateJoplinPopupBodyContent(htmlContent, isPlaceholder = false) {
    if (!joplinPopupElement) return;
    const bodyDiv = joplinPopupElement.querySelector(`.${JOPLIN_POPUP_BODY_CLASS}`);
    if (bodyDiv) {
        bodyDiv.innerHTML = htmlContent;
        bodyDiv.classList.toggle('placeholder-content', isPlaceholder); // Add/remove class for placeholder styling
        if (DEBUG) console.log("[LLM JoplinManager] Joplin popup body content updated.");
    }
}

/**
 * Enables or disables buttons in the Joplin popup.
 * @param {boolean} enableSave - Whether to enable the save button.
 */
function enableJoplinButtons(enableSave) {
    if (!joplinPopupElement) return;
    const saveBtn = joplinPopupElement.querySelector(`.${JOPLIN_SAVE_BTN_CLASS}`);
    const cancelBtn = joplinPopupElement.querySelector(`.${JOPLIN_CANCEL_BTN_CLASS}`);

    if (saveBtn) saveBtn.disabled = !enableSave;
    if (cancelBtn) cancelBtn.disabled = false; // Cancel is always enabled unless explicitly disabled
    if (DEBUG) console.log(`[LLM JoplinManager] Joplin buttons enabled: save=${enableSave}`);
}

// --- Autocomplete Helper Functions (similar to options.js) ---

/**
 * Filters notebooks based on the query.
 * @param {string} query - The search query.
 * @param {Array} folders - The array of notebook folders.
 * @returns {Array} Filtered list of folders.
 */
function filterNotebooks(query, folders) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery || folders.length === 0) return [];
    return folders
        .filter(folder => folder.title.toLowerCase().includes(lowerQuery))
        .slice(0, 10); // Limit to top 10 suggestions
}

/**
 * Displays autocomplete suggestions in a dropdown.
 * @param {HTMLElement} inputElement - The input field.
 * @param {Array} suggestions - Array of filtered suggestions.
 */
function showAutocompleteSuggestions(inputElement, suggestions) {
    if (!autocompleteDropdownElement) {
        autocompleteDropdownElement = document.createElement("div");
        // Ensure autocomplete dropdown is always on top (higher z-index than Joplin popup if needed,
        // but typically document.body append handles this well for modals)
        autocompleteDropdownElement.className = "joplin-autocomplete-dropdown";
        document.body.appendChild(autocompleteDropdownElement); // Append to body to float above everything else
        document.addEventListener("click", handleGlobalClick);
    }
    autocompleteDropdownElement.innerHTML = "";
    highlightedAutocompleteIndex = -1;
    // Do NOT clear selectedNotebookId here, only when a new search makes previous explicit selection invalid
    // If the input is cleared by user or no match, it will be cleared.

    if (suggestions.length === 0) {
        autocompleteDropdownElement.style.display = "none";
        return;
    }

    suggestions.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "joplin-autocomplete-item";
        div.dataset.index = index;
        div.dataset.notebookId = item.id;
        div.textContent = item.title;
        div.addEventListener("click", () => selectAutocompleteSuggestion(div, inputElement));
        autocompleteDropdownElement.appendChild(div);
    });

    // Position the dropdown directly below the input field within the Joplin popup
    const rect = inputElement.getBoundingClientRect();
    autocompleteDropdownElement.style.position = "absolute";
    autocompleteDropdownElement.style.top = `${rect.bottom + window.scrollY + 4}px`;
    autocompleteDropdownElement.style.left = `${rect.left + window.scrollX}px`;
    autocompleteDropdownElement.style.width = `${rect.width}px`;
    autocompleteDropdownElement.style.display = "block";
    activeAutocompleteInput = inputElement;
}

/**
 * Hides the autocomplete suggestion dropdown.
 */
function hideAutocompleteSuggestions() {
    if (autocompleteDropdownElement) {
        autocompleteDropdownElement.style.display = "none";
        highlightedAutocompleteIndex = -1;
    }
    activeAutocompleteInput = null;
}

/**
 * Selects a suggestion from the autocomplete dropdown.
 * @param {HTMLElement} itemElement - The selected suggestion item.
 * @param {HTMLElement} inputElement - The input field.
 */
function selectAutocompleteSuggestion(itemElement, inputElement) {
    inputElement.value = itemElement.textContent;
    selectedNotebookId = itemElement.dataset.notebookId;
    enableJoplinButtons(true); // Enable save button once an item is explicitly selected
    hideAutocompleteSuggestions();
    if (DEBUG) console.log("[LLM JoplinManager] Notebook selected:", itemElement.textContent, "ID:", selectedNotebookId);
}

/**
 * Handles keydown events for autocomplete (ArrowUp, ArrowDown, Enter, Escape).
 * @param {KeyboardEvent} event - The keyboard event.
 * @param {HTMLElement} inputElement - The input element. This will be updated to display the selected notebook.
 * @param {Array} folders - The full list of folders needed for re-filtering.
 * @param {string} joplinToken - The Joplin API token for sending note.
 */
function handleAutocompleteKeydown(event, inputElement, folders, joplinToken) {
    const items = autocompleteDropdownElement?.querySelectorAll(".joplin-autocomplete-item") || []; // Ensure items is always a NodeList or empty array

    // If suggestions are currently hidden OR there are no suggestions found:
    if (!autocompleteDropdownElement || autocompleteDropdownElement.style.display === "none" || items.length === 0) {
        if (event.key === "Enter") {
             // If Enter is pressed and a notebook is already selected (e.g., from initial pre-population)
             // trigger save action directly.
             if (selectedNotebookId) {
                event.preventDefault(); // Prevent accidental form submission
                sendNoteToJoplin(joplinToken, selectedNotebookId, inputElement.value.trim());
             } else {
                // If Enter is pressed without a selection and no suggestions, try exact match on current input
                const currentText = inputElement.value.trim();
                const exactMatch = folders.find(f => f.title.toLowerCase() === currentText.toLowerCase());
                if (exactMatch) {
                    selectedNotebookId = exactMatch.id;
                    enableJoplinButtons(true);
                    event.preventDefault(); // Prevent accidental form submission
                    sendNoteToJoplin(joplinToken, selectedNotebookId, exactMatch.title);
                } else {
                    // No match and no selection, just prevent default newline in input
                    event.preventDefault();
                    showError("No matching notebook found. Please select from the list.", false, 2000);
                    selectedNotebookId = null;
                    enableJoplinButtons(false);
                }
             }
        } else if (event.key === "Escape") {
            event.preventDefault();
            hideJoplinPopup(); // Close popup on Escape if no suggestions visible
        }
        return;
    }

    // --- Logic when suggestions are visible ---
    if (event.key === "ArrowDown") {
        event.preventDefault();
        highlightedAutocompleteIndex = (highlightedAutocompleteIndex + 1) % items.length;
        updateAutocompleteHighlight(items);
        inputElement.value = items[highlightedAutocompleteIndex].textContent; // Live update input with highlighted text

    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        highlightedAutocompleteIndex = (highlightedAutocompleteIndex - 1 + items.length) % items.length;
        updateAutocompleteHighlight(items);
        inputElement.value = items[highlightedAutocompleteIndex].textContent; // Live update input with highlighted text

    } else if (event.key === "Enter") {
        event.preventDefault(); // Prevent form submission if part of a form
        if (highlightedAutocompleteIndex > -1) {
            // If an item is highlighted, select it and trigger save
            selectAutocompleteSuggestion(items[highlightedAutocompleteIndex], inputElement);
            // Now trigger save immediately after selection
            sendNoteToJoplin(joplinToken, selectedNotebookId, inputElement.value.trim()); // selectedNotebookId is set by selectAutocompleteSuggestion
        } else {
            // This path should ideally be covered by the initial 'if (items.length === 0)' check
            // if no suggestions are shown, but kept as a fallback if Enter pressed with suggestions but none highlighted.
            const currentText = inputElement.value.trim();
            const exactMatch = folders.find(f => f.title.toLowerCase() === currentText.toLowerCase());

            if (exactMatch) {
                selectedNotebookId = exactMatch.id;
                enableJoplinButtons(true);
                hideAutocompleteSuggestions();
                if (DEBUG) console.log("[LLM JoplinManager] Notebook immediately selected on Enter (exact match) with suggestions visible but none highlighted:", exactMatch.title, "ID:", selectedNotebookId);
                sendNoteToJoplin(joplinToken, selectedNotebookId, exactMatch.title); // Trigger save for exact match
            } else {
                showError("No matching notebook found. Please select from the list.", false, 2000);
                selectedNotebookId = null;
                enableJoplinButtons(false);
                hideAutocompleteSuggestions(); // Close dropdown as action is taken
            }
        }
    } else if (event.key === "Escape") {
        event.preventDefault(); // Prevent default browser action
        hideJoplinPopup(); // Close the entire popup on Escape
    }
}

/**
 * Updates the visual highlight on autocomplete items.
 * @param {NodeList} items - The list of autocomplete item elements.
 */
function updateAutocompleteHighlight(items) {
    items.forEach((item, index) => {
        item.classList.toggle("selected", index === highlightedAutocompleteIndex);
        if (index === highlightedAutocompleteIndex) {
            item.scrollIntoView({ block: "nearest" }); // Scroll to highlighted item
        }
    });
}

/**
 * Global click handler to dismiss autocomplete when clicking outside its elements or the popup.
 * @param {MouseEvent} event - The click event.
 */
function handleGlobalClick(event) {
    const clickedInsideJoplinPopup = joplinPopupElement && joplinPopupElement.contains(event.target);
    const clickedInsideAutocomplete = autocompleteDropdownElement && autocompleteDropdownElement.contains(event.target);

    // If the click is outside both the Joplin popup and the autocomplete dropdown, hide autocomplete.
    // If the click is inside the Joplin popup but not on the active input or autocomplete, also hide.
    if (!clickedInsideJoplinPopup && !clickedInsideAutocomplete) {
        hideAutocompleteSuggestions();
        if (DEBUG) console.log("[LLM JoplinManager] Hidden autocomplete via outside click (outside popup)");
    } else if (activeAutocompleteInput && !activeAutocompleteInput.contains(event.target) && !clickedInsideAutocomplete) {
        hideAutocompleteSuggestions();
        if (DEBUG) console.log("[LLM JoplinManager] Hidden autocomplete via outside click (inside popup, not input or dropdown)");
    }
}

// --- Public API ---

/**
 * Initializes the module by loading the last used notebook from storage.
 * @param {object} options - Configuration options.
 * @param {boolean} [options.initialDebugState=false] - Initial debug logging state.
 */
export function initializeJoplinManager(options) {
    DEBUG = !!options?.initialDebugState;
    
    // Load last used notebook from storage
    chrome.storage.local.get([STORAGE_KEY_LAST_NOTEBOOK_ID, STORAGE_KEY_LAST_NOTEBOOK_NAME], (result) => {
        lastUsedNotebookId = result[STORAGE_KEY_LAST_NOTEBOOK_ID];
        lastUsedNotebookName = result[STORAGE_KEY_LAST_NOTEBOOK_NAME];
        if (DEBUG && lastUsedNotebookId) {
            console.log("[LLM JoplinManager] Loaded last used notebook:", lastUsedNotebookName, "ID:", lastUsedNotebookId);
        }
    });
    
    if (DEBUG) console.log("[LLM JoplinManager] Initialized.");
}

/**
 * Hides and removes the Joplin popup from the DOM.
 */
export function hideJoplinPopup() {
    // If there is an active autocomplete input, clear its value before hiding the main popup
    if (activeAutocompleteInput) {
        activeAutocompleteInput.value = ""; // Clear the input field
    }

    if (joplinPopupElement && joplinPopupElement.parentNode) {
        joplinPopupElement.classList.remove("visible"); // Start fade out effect
        const computedStyle = window.getComputedStyle(joplinPopupElement);
        const transitionDuration = parseFloat(computedStyle.transitionDuration) * 1000;

        setTimeout(() => {
            if (joplinPopupElement && joplinPopupElement.parentNode) { // Check again in case it was already removed
                joplinPopupElement.parentNode.removeChild(joplinPopupElement);
            }
            joplinPopupElement = null; // Clear module-level reference
            currentJoplinContent = null;
            currentJoplinSourceUrl = null;
            selectedNotebookId = null; // Reset selected ID
            hideAutocompleteSuggestions(); // Ensure dropdown is also removed
            if (DEBUG) console.log("[LLM JoplinManager] Joplin popup hidden and removed.");
        }, transitionDuration > 0 ? transitionDuration + 50 : 10); // Add a small buffer for transition
    }
}

/**
 * Fetches notebooks from Joplin API and displays a selection dialog.
 * @param {string} joplinToken - The Joplin API token.
 * @param {string} content - The content (HTML) to be saved to Joplin.
 * @param {string} sourceUrl - The source URL of the content.
 */
export async function fetchAndShowNotebookSelection(joplinToken, content, sourceUrl) {
    if (!joplinToken) {
        showError("Joplin API token not found. Please set it in extension options.", true, 5000);
        if (DEBUG) console.error("[LLM JoplinManager] Fetch failed: Joplin token missing.");
        return;
    }

    currentJoplinContent = content; // Store content for later
    currentJoplinSourceUrl = sourceUrl; // Store source URL for later
    selectedNotebookId = null; // Ensure no previous selection is carried over

    const popup = createJoplinPopupBase();
    popup.style.display = "flex"; // Show the loading popup
    popup.classList.add("visible");
    // Use isPlaceholder = true for loading message
    updateJoplinPopupBodyContent("<p>Fetching notebooks from Joplin...</p>", true);
    enableJoplinButtons(false); // Disable save button initially

    // Setup cancel button listener
    const cancelBtn = popup.querySelector(`.${JOPLIN_CANCEL_BTN_CLASS}`);
    if (cancelBtn) {
        cancelBtn.onclick = () => hideJoplinPopup();
    }

    try {
        const response = await chrome.runtime.sendMessage({
            action: "fetchJoplinNotebooks",
            joplinToken: joplinToken, // Pass token to background script
        });

        if (chrome.runtime.lastError) {
            throw new Error(`Background script error: ${chrome.runtime.lastError.message}`);
        }

        if (response.status === "success" && response.folders && response.folders.length > 0) {
            // Sort folders alphabetically by title before rendering
            const sortedFolders = response.folders.sort((a, b) => a.title.localeCompare(b.title));
            renderNotebookSelectionPopup(joplinToken, sortedFolders);
        } else if (response.status === "success" && response.folders.length === 0) {
            updateJoplinPopupBodyContent("<p>No Joplin notebooks found. Please create one in Joplin.</p>", true);
            // Even if no notebooks, allow user to cancel. Keep save disabled.
            enableJoplinButtons(false);
            if (DEBUG) console.log("[LLM JoplinManager] No Joplin notebooks returned.");
        } else {
            throw new Error(response.message || "Failed to fetch Joplin notebooks.");
        }
    } catch (error) {
        console.error("[LLM JoplinManager] Error fetching Joplin notebooks:", error);
        showError(`Error fetching Joplin notebooks: ${error.message}`, true, 5000);
        updateJoplinPopupBodyContent(`<p>Error: ${error.message}</p>`, true); // Pass true for placeholder flag
        enableJoplinButtons(false);
         // Keep popup visible for error message unless it's a transient error
         // For critical errors (like token missing, network issues), keep it visible
         // For "no notebooks found", it's informative.
    }
}

/**
 * Renders the notebook selection UI with an autocomplete input.
 * @param {string} joplinToken - The Joplin API token.
 * @param {Array} folders - Sorted array of Joplin folder objects ({id, title}).
 */
function renderNotebookSelectionPopup(joplinToken, folders) {
    if (!joplinPopupElement) {
        if (DEBUG) console.warn("[LLM JoplinManager] Popup element not found for rendering selection.");
        return;
    }

    const selectHtml = `
        <p>Type to search or select a notebook:</p>
        <div style="position: relative; width: 100%;">
            <input type="text" placeholder="Search notebooks..." class="joplin-notebook-search-input">
        </div>
    `;
    updateJoplinPopupBodyContent(selectHtml);
    enableJoplinButtons(false); // Disable save button initially, it will be enabled on selection

    const notebookSearchInput = joplinPopupElement.querySelector('.joplin-notebook-search-input');
    const saveBtn = joplinPopupElement.querySelector(`.${JOPLIN_SAVE_BTN_CLASS}`);
    const cancelBtn = joplinPopupElement.querySelector(`.${JOPLIN_CANCEL_BTN_CLASS}`);

    // Set up initial selection if folders exist
    if (folders.length > 0) {
        // Check if we have a last used notebook and if it still exists in the folders list
        let initialNotebook = null;
        if (lastUsedNotebookId) {
            initialNotebook = folders.find(f => f.id === lastUsedNotebookId);
            if (initialNotebook && DEBUG) {
                console.log("[LLM JoplinManager] Using last used notebook:", initialNotebook.title);
            }
        }
        
        // If last used notebook wasn't found, use the first one
        if (!initialNotebook) {
            initialNotebook = folders[0];
            if (DEBUG && lastUsedNotebookId) {
                console.log("[LLM JoplinManager] Last used notebook not found, using first notebook:", initialNotebook.title);
            }
        }
        
        // Set the selected notebook
        selectedNotebookId = initialNotebook.id;
        notebookSearchInput.value = initialNotebook.title;
        enableJoplinButtons(true);
    } else {
        updateJoplinPopupBodyContent("<p>No Joplin notebooks found. Please create one in Joplin, or click 'Cancel'.</p>", true);
        notebookSearchInput.disabled = true; // Disable input if no notebooks
        saveBtn.disabled = true;
    }

    if (notebookSearchInput) {
        notebookSearchInput.addEventListener("input", (event) => {
            const query = event.target.value;
            // Clear selected ID if text changes and doesn't match current selection
            if (selectedNotebookId && folders.find(f => f.id === selectedNotebookId)?.title !== query) {
                selectedNotebookId = null;
                enableJoplinButtons(false);
            }
            const suggestions = filterNotebooks(query, folders);
            showAutocompleteSuggestions(notebookSearchInput, suggestions);
        });
        // Pass joplinToken to handleAutocompleteKeydown
        notebookSearchInput.addEventListener("keydown", (event) => handleAutocompleteKeydown(event, notebookSearchInput, folders, joplinToken));
        notebookSearchInput.addEventListener("focus", () => {
            // On focus, if input is empty, show all sorted folders as suggestions
            const query = notebookSearchInput.value;
            const suggestions = filterNotebooks(query, folders);
            showAutocompleteSuggestions(notebookSearchInput, suggestions);
        });
        notebookSearchInput.addEventListener("blur", () => {
            // Give a small delay before hiding dropdowns on blur to allow click events to register
            setTimeout(() => {
                hideAutocompleteSuggestions();
                // On blur, if no actual selection was made (e.g. via click/enter), ensure button state is correct
                const currentText = notebookSearchInput.value.trim();
                const matchedFolder = folders.find(f => f.title.toLowerCase() === currentText.toLowerCase());
                if (!matchedFolder) {
                    // If text does not match a known folder, and no ID is selected, disable save.
                    // But don't clear input, user might be typing.
                    if (selectedNotebookId !== null) { // If there was a selection, but now input doesn't match it
                        selectedNotebookId = null;
                    }
                    enableJoplinButtons(false);
                } else if (matchedFolder.id !== selectedNotebookId) { // If text matches a folder but not the currently selected one
                    selectedNotebookId = matchedFolder.id;
                    enableJoplinButtons(true);
                }
            }, 100);
        });
    }

    if (saveBtn) {
        saveBtn.onclick = async () => {
            if (selectedNotebookId) {
                // If save button is clicked, ensure the currently typed text (if any)
                // matches a selected notebook, then proceed to save.
                const currentText = notebookSearchInput.value.trim();
                const matchedFolder = folders.find(f => f.id === selectedNotebookId && f.title === currentText);
                if (matchedFolder) {
                    await sendNoteToJoplin(joplinToken, selectedNotebookId, matchedFolder.title);
                } else {
                    // This scenario means selectedNotebookId doesn't match current input (e.g. user typed over a selection)
                    // Try to re-match based on input text, or disable save
                    const reMatchedFolder = folders.find(f => f.title.toLowerCase() === currentText.toLowerCase());
                    if (reMatchedFolder) {
                        selectedNotebookId = reMatchedFolder.id;
                        await sendNoteToJoplin(joplinToken, selectedNotebookId, reMatchedFolder.title);
                    } else {
                        showError("Please select a valid notebook from the list.", true, 3000);
                    }
                }
            } else {
                showError("Please select a notebook first.", true, 3000);
            }
        };
    }
    if (cancelBtn) {
        cancelBtn.onclick = () => hideJoplinPopup();
    }

    // Show the popup if it's not already visible
    joplinPopupElement.style.display = "flex";
    joplinPopupElement.classList.add("visible");
    notebookSearchInput.focus(); // Focus the new input field to start typing immediately
    notebookSearchInput.select(); // Select all text in the input field
}


/**
 * Sends the current content as a new note to Joplin.
 * @param {string} joplinToken - The Joplin API token.
 * @param {string} parentId - The ID of the selected Joplin notebook.
 * @param {string} notebookName - The name of the selected notebook.
 */
async function sendNoteToJoplin(joplinToken, parentId, notebookName = "") {
    if (!joplinToken || !parentId || !currentJoplinContent) {
        showError("Invalid data for sending note to Joplin.", true, 5000);
        if (DEBUG) console.error("[LLM JoplinManager] Create note failed: Missing token, parentId, or content.");
        hideJoplinPopup(); // Hide if critical data is missing
        return;
    }

    showError("Sending note to Joplin...", false, 0); // Show temporary status message
    enableJoplinButtons(false); // Disable buttons during sending, for any further interaction in the same popup instance

    const pageTitle = document.title;
    let bodyContent = currentJoplinContent; // Use the stored content

    // Prepend header link to original URL (Requirement 3)
    // Ensure separate <H1> and <A> elements for clearer Markdown interpretation in Joplin.
    // This aims to prevent aggressive Markdown parsing of nested HTML.
    const headerHtml = `<h1>${escapeHTML(pageTitle)}</h1>\n<p><a href="${escapeHTML(currentJoplinSourceUrl)}">Original Source</a></p>`;
    bodyContent = headerHtml + bodyContent;

    try {
        const response = await chrome.runtime.sendMessage({
            action: "createJoplinNote",
            joplinToken: joplinToken,
            title: pageTitle,
            source_url: currentJoplinSourceUrl,
            parent_id: parentId,
            body_html: bodyContent, // Always send as HTML for Joplin
        });

        if (chrome.runtime.lastError) {
            throw new Error(`Background script error: ${chrome.runtime.lastError.message}`);
        }

        if (response.status === "success") {
            showError("Note sent to Joplin successfully!", false, 3000);
            if (DEBUG) console.log("[LLM JoplinManager] Note created successfully:", response.result);
            
            // Only save the last used notebook if we have a name
            if (notebookName) {
                lastUsedNotebookId = parentId;
                lastUsedNotebookName = notebookName;
                
                // Store in chrome.storage.local for persistence
                chrome.storage.local.set({
                    [STORAGE_KEY_LAST_NOTEBOOK_ID]: parentId,
                    [STORAGE_KEY_LAST_NOTEBOOK_NAME]: notebookName
                });
                
                if (DEBUG) console.log("[LLM JoplinManager] Saved last used notebook:", notebookName, "ID:", parentId);
            }
        } else {
            throw new Error(response.message || "Failed to create Joplin note.");
        }
    } catch (error) {
        console.error("[LLM JoplinManager] Error sending note to Joplin:", error);
        showError(`Error sending note to Joplin: ${error.message}`, true, 5000);
    } finally {
        hideJoplinPopup(); // Always hide the Joplin popup after action attempt
    }
}

// Helper to escape HTML characters for display in UI
function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}
