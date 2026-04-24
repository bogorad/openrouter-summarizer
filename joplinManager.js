// joplinManager.js

import { showError } from "./utils.js"; // For displaying errors
import {
  NOTIFICATION_TIMEOUT_MINOR_MS,
  NOTIFICATION_TIMEOUT_SUCCESS_MS,
  NOTIFICATION_TIMEOUT_CRITICAL_MS,
} from "./constants.js";
import { RuntimeMessageActions } from "./js/messaging/actions.js";
import { sendRuntimeAction } from "./js/messaging/runtimeClient.js";
import { createAutocomplete } from "./js/ui/autocomplete.js";
import { createButton, setButtonDisabled } from "./js/ui/buttons.js";
import { createElement } from "./js/ui/dom.js";
import { createPopup } from "./js/ui/popup.js";
import { createStatusMessage, STATUS_TYPES } from "./js/ui/status.js";
import { getIntegrationErrorMessage } from "./js/integrations/integrationErrors.js";

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

// Accessibility IDs
const JOPLIN_POPUP_TITLE_ID = "llm-joplin-popup-title";
const JOPLIN_AUTOCOMPLETE_LISTBOX_ID = "llm-joplin-notebook-listbox";
const JOPLIN_AUTOCOMPLETE_OPTION_ID_PREFIX = "llm-joplin-notebook-option-";

// --- Module State ---
let joplinPopupElement = null; // Refers to the created popup DOM element
let DEBUG = false;
let currentJoplinContent = null; // Stored content to be sent to Joplin
let currentJoplinSourceUrl = null; // Stored source URL to be sent to Joplin
let lastUsedNotebookId = null; // To store the ID of the last used notebook
let lastUsedNotebookName = null; // To store the name of the last used notebook

let popupGeneration = 0;
let joplinPopupController = null;
let notebookAutocompleteController = null;

// Storage keys for last used notebook
const STORAGE_KEY_LAST_NOTEBOOK_ID = "lastUsedJoplinNotebookId";
const STORAGE_KEY_LAST_NOTEBOOK_NAME = "lastUsedJoplinNotebookName";

let selectedNotebookId = null; // To store the ID of the selected notebook from autocomplete (global to the module)

// --- Internal Helper Functions ---

/**
 * Creates and appends the main Joplin popup element to the DOM.
 * @returns {HTMLElement} The created popup element.
 */
function createJoplinPopupBase() {
    if (joplinPopupElement) {
        hideJoplinPopup(); // Ensure only one popup exists
    }
    popupGeneration += 1;

    const saveButton = createButton({
        label: "Save Note",
        className: JOPLIN_BTN_CLASS,
        classes: [JOPLIN_SAVE_BTN_CLASS],
        disabled: true,
    }).element;
    const cancelButton = createButton({
        label: "Cancel",
        className: JOPLIN_BTN_CLASS,
        classes: [JOPLIN_CANCEL_BTN_CLASS],
        onClick: () => hideJoplinPopup(),
    }).element;

    joplinPopupController = createPopup({
        titleNode: createElement("div", {
            className: JOPLIN_POPUP_HEADER_CLASS,
            attrs: { id: JOPLIN_POPUP_TITLE_ID },
            text: "Select Joplin Notebook",
        }),
        titleId: JOPLIN_POPUP_TITLE_ID,
        body: "",
        actions: [saveButton, cancelButton],
        surfaceClassName: JOPLIN_POPUP_CLASS,
        headerClassName: JOPLIN_POPUP_HEADER_CONTAINER_CLASS,
        bodyClassName: JOPLIN_POPUP_BODY_CLASS,
        actionsClassName: JOPLIN_POPUP_ACTIONS_CLASS,
        includeCloseButton: false,
        closeOnOutsideClick: false,
        trapFocus: true,
        restoreFocus: true,
        autoFocus: false,
        onCleanup: () => {
            notebookAutocompleteController?.cleanup();
            notebookAutocompleteController = null;
            joplinPopupElement = null;
            joplinPopupController = null;
            currentJoplinContent = null;
            currentJoplinSourceUrl = null;
            selectedNotebookId = null;
            if (DEBUG) console.log("[LLM JoplinManager] Joplin popup hidden and removed.");
        },
    });

    joplinPopupElement = joplinPopupController.surface;
    requestAnimationFrame(() => joplinPopupElement?.classList.add("visible"));
    if (DEBUG) console.log("[LLM JoplinManager] Joplin popup base created and added to DOM.");
    return joplinPopupElement;
}

/**
 * Creates a paragraph for popup status and error text.
 * @param {string} text - Text to show in the paragraph.
 * @returns {HTMLParagraphElement} Paragraph element.
 */
function createJoplinPopupParagraph(text) {
    return createElement("p", { text });
}

/**
 * Creates the notebook selection controls.
 * @returns {DocumentFragment} Notebook selection UI.
 */
function createNotebookSelectionContent() {
    const fragment = document.createDocumentFragment();
    const label = createJoplinPopupParagraph("Type to search or select a notebook:");
    const inputWrapper = createElement("div");
    const input = createElement("input", {
        className: "joplin-notebook-search-input",
        attrs: {
            type: "text",
            placeholder: "Search notebooks...",
            "aria-label": "Search notebooks",
        },
    });

    inputWrapper.style.position = "relative";
    inputWrapper.style.width = "100%";

    inputWrapper.appendChild(input);
    fragment.appendChild(label);
    fragment.appendChild(inputWrapper);
    return fragment;
}

/**
 * Updates the content of the Joplin popup body.
 * @param {Node|string} content - DOM content or text to set for the body.
 * @param {boolean} [isPlaceholder=false] - True if the content is a placeholder (e.g., loading message).
 */
function updateJoplinPopupBodyContent(content, isPlaceholder = false) {
    if (!joplinPopupController) return;
    const bodyDiv = joplinPopupController.body;
    if (bodyDiv) {
        const renderedContent = content instanceof Node
            ? content
            : createStatusMessage({
                message: String(content || ""),
                type: isPlaceholder ? STATUS_TYPES.INFO : STATUS_TYPES.ERROR,
                className: "joplin-popup-status",
            });
        joplinPopupController.render(renderedContent);
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

    setButtonDisabled(saveBtn, !enableSave);
    setButtonDisabled(cancelBtn, false); // Cancel is always enabled unless explicitly disabled
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
 * Returns an exact title match for the current notebook input text.
 * @param {string} text - Input text.
 * @param {Array} folders - Joplin folder list.
 * @returns {object|undefined} Matching folder.
 */
function findNotebookByTitle(text, folders) {
    const currentText = String(text || "").trim().toLowerCase();
    return folders.find(f => f.title.toLowerCase() === currentText);
}

/**
 * Selects a notebook and enables note creation.
 * @param {object} folder - Joplin folder.
 */
function selectNotebook(folder) {
    selectedNotebookId = folder?.id || null;
    enableJoplinButtons(Boolean(selectedNotebookId));
    if (DEBUG && folder) console.log("[LLM JoplinManager] Notebook selected:", folder.title, "ID:", selectedNotebookId);
}

/**
 * Handles Enter on the notebook input when autocomplete has not consumed it.
 * @param {KeyboardEvent} event - The keyboard event.
 * @param {HTMLElement} inputElement - Notebook search input.
 * @param {Array} folders - Joplin folder list.
 */
function handleNotebookEnter(event, inputElement, folders) {
    if (event.key !== "Enter") return;
    if (event.defaultPrevented) return;
    event.preventDefault();

    const exactMatch = findNotebookByTitle(inputElement.value, folders);
    if (exactMatch) {
        selectNotebook(exactMatch);
        sendNoteToJoplin(exactMatch.id, exactMatch.title);
        return;
    }

    showError("No matching notebook found. Please select from the list.", false, NOTIFICATION_TIMEOUT_MINOR_MS);
    selectedNotebookId = null;
    enableJoplinButtons(false);
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
    if (joplinPopupElement && joplinPopupController) {
        const popupToRemove = joplinPopupElement;
        const generationAtHide = popupGeneration;
        const controllerToCleanup = joplinPopupController;

        popupToRemove.classList.remove("visible"); // Start fade out effect
        const computedStyle = window.getComputedStyle(popupToRemove);
        const transitionDuration = parseFloat(computedStyle.transitionDuration) * 1000;

        setTimeout(() => {
            // Only reset shared state if no newer popup has been created.
            if (generationAtHide === popupGeneration) {
                controllerToCleanup.cleanup();
            }
        }, transitionDuration > 0 ? transitionDuration + 50 : 10); // Add a small buffer for transition
    }
}

/**
 * Fetches notebooks from Joplin API and displays a selection dialog.
 * @param {string} content - The content (HTML) to be saved to Joplin.
 * @param {string} sourceUrl - The source URL of the content.
 */
export async function fetchAndShowNotebookSelection(content, sourceUrl) {
    currentJoplinContent = content; // Store content for later
    currentJoplinSourceUrl = sourceUrl; // Store source URL for later
    selectedNotebookId = null; // Ensure no previous selection is carried over

    const popup = createJoplinPopupBase();
    popup.classList.add("visible");
    // Use isPlaceholder = true for loading message
    updateJoplinPopupBodyContent("Fetching notebooks from Joplin...", true);
    enableJoplinButtons(false); // Disable save button initially

    // Setup cancel button listener
    const cancelBtn = popup.querySelector(`.${JOPLIN_CANCEL_BTN_CLASS}`);
    if (cancelBtn) {
        cancelBtn.onclick = () => hideJoplinPopup();
        cancelBtn.focus();
    }

    try {
        const { response } = await sendRuntimeAction(
          RuntimeMessageActions.fetchJoplinNotebooks,
        );

        if (response.status === "success" && response.folders && response.folders.length > 0) {
            // Sort folders alphabetically by title before rendering
            const sortedFolders = response.folders.sort((a, b) => a.title.localeCompare(b.title));
            renderNotebookSelectionPopup(sortedFolders);
        } else if (response.status === "success" && response.folders.length === 0) {
            updateJoplinPopupBodyContent("No Joplin notebooks found. Please create one in Joplin.", true);
            // Even if no notebooks, allow user to cancel. Keep save disabled.
            enableJoplinButtons(false);
            if (DEBUG) console.log("[LLM JoplinManager] No Joplin notebooks returned.");
        } else {
            throw new Error(getIntegrationErrorMessage(response, "Failed to fetch Joplin notebooks."));
        }
    } catch (error) {
        const message = getIntegrationErrorMessage(error, "Failed to fetch Joplin notebooks.");
        console.error("[LLM JoplinManager] Error fetching Joplin notebooks:", error);
        showError(`Error fetching Joplin notebooks: ${message}`, true, NOTIFICATION_TIMEOUT_CRITICAL_MS);
        updateJoplinPopupBodyContent(`Error: ${message}`, true); // Pass true for placeholder flag
        enableJoplinButtons(false);
         // Keep popup visible for error message unless it's a transient error
         // For critical errors (like missing configuration or network issues), keep it visible
         // For "no notebooks found", it's informative.
    }
}

/**
 * Renders the notebook selection UI with an autocomplete input.
 * @param {Array} folders - Sorted array of Joplin folder objects ({id, title}).
 */
function renderNotebookSelectionPopup(folders) {
    if (!joplinPopupElement) {
        if (DEBUG) console.warn("[LLM JoplinManager] Popup element not found for rendering selection.");
        return;
    }

    updateJoplinPopupBodyContent(createNotebookSelectionContent());
    enableJoplinButtons(false); // Disable save button initially, it will be enabled on selection

    const notebookSearchInput = joplinPopupElement.querySelector('.joplin-notebook-search-input');
    const saveBtn = joplinPopupElement.querySelector(`.${JOPLIN_SAVE_BTN_CLASS}`);
    const cancelBtn = joplinPopupElement.querySelector(`.${JOPLIN_CANCEL_BTN_CLASS}`);

    if (notebookSearchInput) {
        notebookSearchInput.setAttribute('aria-label', 'Search notebooks');
    }

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
        updateJoplinPopupBodyContent("No Joplin notebooks found. Please create one in Joplin, or click 'Cancel'.", true);
        notebookSearchInput.disabled = true; // Disable input if no notebooks
        saveBtn.disabled = true;
    }

    if (notebookSearchInput) {
        notebookAutocompleteController?.cleanup();
        notebookAutocompleteController = createAutocomplete({
            input: notebookSearchInput,
            items: folders,
            getItemLabel: folder => folder.title,
            getItemValue: folder => folder.title,
            filterItems: filterNotebooks,
            listboxId: JOPLIN_AUTOCOMPLETE_LISTBOX_ID,
            optionIdPrefix: JOPLIN_AUTOCOMPLETE_OPTION_ID_PREFIX,
            listboxLabel: "Notebook suggestions",
            classNames: {
                listbox: "joplin-autocomplete-dropdown",
                option: "joplin-autocomplete-item",
                selected: "selected",
            },
            maxItems: 10,
            openOnFocus: true,
            liveUpdateInputOnActive: true,
            onSelect: ({ item, event }) => {
                selectNotebook(item);
                if (event?.type === "keydown" && event.key === "Enter") {
                    sendNoteToJoplin(item.id, item.title);
                }
            },
        });

        notebookSearchInput.addEventListener("input", (event) => {
            const query = event.target.value;
            // Clear selected ID if text changes and doesn't match current selection
            if (selectedNotebookId && folders.find(f => f.id === selectedNotebookId)?.title !== query) {
                selectedNotebookId = null;
                enableJoplinButtons(false);
            }
        });
        notebookSearchInput.addEventListener("keydown", (event) => handleNotebookEnter(event, notebookSearchInput, folders));
        notebookSearchInput.addEventListener("blur", () => {
            // Give a small delay before hiding dropdowns on blur to allow click events to register
            setTimeout(() => {
                // On blur, if no actual selection was made (e.g. via click/enter), ensure button state is correct
                const currentText = notebookSearchInput.value.trim();
                const matchedFolder = findNotebookByTitle(currentText, folders);
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
                    await sendNoteToJoplin(selectedNotebookId, matchedFolder.title);
                } else {
                    // This scenario means selectedNotebookId doesn't match current input (e.g. user typed over a selection)
                    // Try to re-match based on input text, or disable save
                    const reMatchedFolder = findNotebookByTitle(currentText, folders);
                    if (reMatchedFolder) {
                        selectNotebook(reMatchedFolder);
                        await sendNoteToJoplin(selectedNotebookId, reMatchedFolder.title);
                    } else {
                        showError("Please select a valid notebook from the list.", true, NOTIFICATION_TIMEOUT_SUCCESS_MS);
                    }
                }
            } else {
                showError("Please select a notebook first.", true, NOTIFICATION_TIMEOUT_SUCCESS_MS);
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
 * @param {string} parentId - The ID of the selected Joplin notebook.
 * @param {string} notebookName - The name of the selected notebook.
 */
async function sendNoteToJoplin(parentId, notebookName = "") {
    if (!parentId || !currentJoplinContent) {
        showError("Invalid data for sending note to Joplin.", true, NOTIFICATION_TIMEOUT_CRITICAL_MS);
        if (DEBUG) console.error("[LLM JoplinManager] Create note failed: Missing parentId or content.");
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
        const { response } = await sendRuntimeAction(
          RuntimeMessageActions.createJoplinNote,
          {
            title: pageTitle,
            source_url: currentJoplinSourceUrl,
            parent_id: parentId,
            body_html: bodyContent, // Always send as HTML for Joplin
          },
        );

        if (response.status === "success") {
            showError("Note sent to Joplin successfully!", false, NOTIFICATION_TIMEOUT_SUCCESS_MS);
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
            throw new Error(getIntegrationErrorMessage(response, "Failed to create Joplin note."));
        }
    } catch (error) {
        const message = getIntegrationErrorMessage(error, "Failed to create Joplin note.");
        console.error("[LLM JoplinManager] Error sending note to Joplin:", error);
        showError(`Error sending note to Joplin: ${message}`, true, NOTIFICATION_TIMEOUT_CRITICAL_MS);
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
