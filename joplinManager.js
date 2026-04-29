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
const JOPLIN_NOTEBOOK_INPUT_WRAPPER_CLASS = "joplin-notebook-input-wrapper";
const JOPLIN_NOTEBOOK_INPUT_CLASS = "joplin-notebook-search-input";
const JOPLIN_POPUP_STATUS_CLASS = "joplin-popup-status";
const JOPLIN_AUTOCOMPLETE_DROPDOWN_CLASS = "joplin-autocomplete-dropdown";
const JOPLIN_AUTOCOMPLETE_ITEM_CLASS = "joplin-autocomplete-item";

const JOPLIN_POPUP_STYLES = `
  :host {
    all: initial;
    display: block;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif !important;
  }

  .${JOPLIN_POPUP_CLASS} {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: #ffffff;
    border: 1px solid #ccc;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 20px;
    z-index: 2147483647;
    width: 300px;
    font-family: inherit;
    font-size: 14px;
    color: #333333;
    display: flex;
    flex-direction: column;
    gap: 15px;
    box-sizing: border-box;
    overflow: visible;
    transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
    opacity: 0;
    pointer-events: none;
  }

  .${JOPLIN_POPUP_CLASS}.visible {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
    pointer-events: auto;
  }

  .${JOPLIN_POPUP_HEADER_CONTAINER_CLASS} {
    padding: 14px 20px;
    background-color: #2196F3;
    color: #ffffff;
    flex-shrink: 0;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    border-radius: 8px 8px 0 0;
    box-sizing: border-box;
  }

  .${JOPLIN_POPUP_HEADER_CLASS} {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0;
    text-align: center;
    color: #ffffff;
  }

  .${JOPLIN_POPUP_BODY_CLASS} {
    order: 2;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    min-height: 80px;
    box-sizing: border-box;
  }

  .${JOPLIN_POPUP_BODY_CLASS}.placeholder-content,
  .${JOPLIN_POPUP_STATUS_CLASS} {
    color: #888888;
    font-style: italic;
  }

  .${JOPLIN_POPUP_BODY_CLASS} p,
  .${JOPLIN_POPUP_STATUS_CLASS} {
    margin: 0;
  }

  .${JOPLIN_POPUP_BODY_CLASS} p {
    color: #555555;
  }

  .${JOPLIN_NOTEBOOK_INPUT_WRAPPER_CLASS} {
    position: relative;
    width: 100%;
    box-sizing: border-box;
  }

  .${JOPLIN_NOTEBOOK_INPUT_CLASS} {
    width: 100%;
    padding: 8px;
    border: 1px solid #dddddd;
    border-radius: 4px;
    font: inherit;
    margin-top: 10px;
    box-sizing: border-box;
    color: #333333;
    background-color: #ffffff;
  }

  .${JOPLIN_POPUP_ACTIONS_CLASS} {
    order: 1;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid #eeeeee;
    box-sizing: border-box;
  }

  .${JOPLIN_BTN_CLASS} {
    padding: 8px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font: inherit;
    transition: background-color 0.2s ease;
  }

  .${JOPLIN_SAVE_BTN_CLASS} {
    background-color: #4CAF50;
    color: #ffffff;
  }

  .${JOPLIN_SAVE_BTN_CLASS}:hover:not(:disabled) {
    background-color: #45a049;
  }

  .${JOPLIN_CANCEL_BTN_CLASS} {
    background-color: #f44336;
    color: #ffffff;
  }

  .${JOPLIN_CANCEL_BTN_CLASS}:hover:not(:disabled) {
    background-color: #da190b;
  }

  .${JOPLIN_BTN_CLASS}:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }

  .${JOPLIN_AUTOCOMPLETE_DROPDOWN_CLASS} {
    position: absolute;
    border: 1px solid #dddddd;
    background-color: #ffffff;
    max-height: 200px;
    overflow-y: auto;
    z-index: 1;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    border-radius: 4px;
    box-sizing: border-box;
  }

  .${JOPLIN_AUTOCOMPLETE_ITEM_CLASS} {
    padding: 8px 10px;
    cursor: pointer;
    font-size: 0.95em;
    color: #333333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-bottom: 1px solid #eeeeee;
    box-sizing: border-box;
  }

  .${JOPLIN_AUTOCOMPLETE_ITEM_CLASS}:last-child {
    border-bottom: none;
  }

  .${JOPLIN_AUTOCOMPLETE_ITEM_CLASS}:hover,
  .${JOPLIN_AUTOCOMPLETE_ITEM_CLASS}.selected {
    background-color: #f0f0f0;
  }
`;

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
        label: "Back (no action)",
        className: JOPLIN_BTN_CLASS,
        classes: [JOPLIN_CANCEL_BTN_CLASS],
        onClick: () => hideJoplinPopup(),
    }).element;

    joplinPopupController = createPopup({
        id: "joplin-popup-host",
        useShadowRoot: true,
        styles: JOPLIN_POPUP_STYLES,
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
        hostAttrs: {
            style: `
                position: fixed;
                top: 0;
                left: 0;
                width: 0;
                height: 0;
                z-index: 2147483647;
            `,
        },
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
    const inputWrapper = createElement("div", {
        className: JOPLIN_NOTEBOOK_INPUT_WRAPPER_CLASS,
    });
    const input = createElement("input", {
        className: JOPLIN_NOTEBOOK_INPUT_CLASS,
        attrs: {
            type: "text",
            placeholder: "Search notebooks...",
            "aria-label": "Search notebooks",
        },
    });

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
                className: JOPLIN_POPUP_STATUS_CLASS,
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

    const currentText = inputElement.value.trim();
    const exactMatch = findNotebookByTitle(currentText, folders);
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

    const notebookSearchInput = joplinPopupElement.querySelector(`.${JOPLIN_NOTEBOOK_INPUT_CLASS}`);
    const saveBtn = joplinPopupElement.querySelector(`.${JOPLIN_SAVE_BTN_CLASS}`);
    const cancelBtn = joplinPopupElement.querySelector(`.${JOPLIN_CANCEL_BTN_CLASS}`);
    const notebookInputWrapper = notebookSearchInput?.parentElement;

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
            listboxParent: notebookInputWrapper,
            positioningAnchor: notebookSearchInput,
            positionListbox: ({ listbox, input }) => {
                const parentRect = notebookInputWrapper.getBoundingClientRect();
                const inputRect = input.getBoundingClientRect();
                listbox.style.position = "absolute";
                listbox.style.top = `${inputRect.bottom - parentRect.top + 4}px`;
                listbox.style.left = `${inputRect.left - parentRect.left}px`;
                listbox.style.width = `${inputRect.width}px`;
            },
            listboxId: JOPLIN_AUTOCOMPLETE_LISTBOX_ID,
            optionIdPrefix: JOPLIN_AUTOCOMPLETE_OPTION_ID_PREFIX,
            listboxLabel: "Notebook suggestions",
            classNames: {
                listbox: JOPLIN_AUTOCOMPLETE_DROPDOWN_CLASS,
                option: JOPLIN_AUTOCOMPLETE_ITEM_CLASS,
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
