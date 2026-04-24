// chat.js
/**
 * chat.js
 * Short Spec: This file handles the chat interface for the OpenRouter Summarizer extension.
 * It manages chat messages, user input, model selection, and interactions with the background script.
 * It now also displays language flags for translation requests.
 * Called from: chat.html (DOMContentLoaded event).
 * Dependencies: utils.js for showError.
 */

console.log("[LLM Chat] Script Start (v3.9.44)");

// ==== GLOBAL STATE ====
import { showError } from "./utils.js";
import {
  NOTIFICATION_TIMEOUT_MINOR_MS,
} from "./constants.js";
import {
  buildApiMessages,
  buildTranslationRequest,
} from "./js/chat/chatContextBuilder.js";
import { createChatStreamController } from "./js/chat/chatStreamController.js";
import {
  renderChatMessages,
  renderStreamingPlaceholder,
} from "./js/chat/chatRenderer.js";
import {
  copyChatMarkdown,
  downloadChatJson,
  downloadChatMarkdown,
} from "./js/chat/chatExport.js";
import { chatState } from "./js/chat/chatState.js";
import { RuntimeMessageActions } from "./js/messaging/actions.js";
import { sendRuntimeAction } from "./js/messaging/runtimeClient.js";

let DEBUG = false; // Updated by getSettings response
let chatMessagesInnerDiv = null;
let chatStreamController = null;

// ==== DOM Element References ====
let downloadMdBtn,
  copyMdBtn,
  downloadJsonBtn,
  chatInput,
  modelSelect,
  chatForm,
  chatMessages,
  errorDisplay,
  sendButton,
  stopButton,
  languageFlagsContainer,
  quickPromptsContainer;

// ==== INITIALIZATION ====

document.addEventListener("DOMContentLoaded", () => {
  console.log("[LLM Chat] DOMContentLoaded event fired.");

  // Assign DOM elements
  chatMessagesInnerDiv = document.querySelector(".chat-messages-inner");
  downloadMdBtn = document.getElementById("downloadMdBtn");
  copyMdBtn = document.getElementById("copyMdBtn");
  downloadJsonBtn = document.getElementById("downloadJsonBtn");
  chatInput = document.getElementById("chatInput");
  modelSelect = document.getElementById("modelSelect");
  chatForm = document.getElementById("chatForm");
  chatMessages = document.getElementById("chatMessages");
  errorDisplay = document.getElementById("errorDisplay");
  sendButton = chatForm ? chatForm.querySelector("#sendButton") : null;
  stopButton = chatForm ? chatForm.querySelector("#stopButton") : null;
  languageFlagsContainer = document.getElementById("languageFlagsContainer");
  quickPromptsContainer = document.getElementById("quickPromptsContainer");

  // Check if all essential elements are present
  if (!chatMessagesInnerDiv || !downloadMdBtn || !copyMdBtn || !downloadJsonBtn ||
      !chatInput || !modelSelect || !chatForm || !chatMessages || !sendButton ||
      !stopButton || !languageFlagsContainer || !quickPromptsContainer) {
    console.error("CRITICAL: Could not find essential UI elements! Aborting initialization.");
    document.body.innerHTML = '<div style="color: red; padding: 20px; font-family: sans-serif;">Error: Chat UI structure is missing essential elements. Cannot load chat.</div>';
    return;
  }

  // Configure Marked library if available
  if (typeof marked !== "undefined") {
    marked.setOptions({ breaks: true, gfm: true });
  } else {
    console.warn("Marked library failed to load! Markdown rendering will use basic newline conversion.");
  }

    // Initialize chat and attach listeners
    try {
      console.log("[LLM Chat] Attempting to initialize chat...");
      chatStreamController = createChatStreamController({
        chatState,
        buildApiMessages,
        renderStreamingPlaceholder,
        sendRuntimeAction,
        actions: RuntimeMessageActions,
        getMessagesWrap: () => chatMessagesInnerDiv,
        setBusy: setChatBusyState,
        onSuccess: handleStreamSuccess,
        onError: handleStreamError,
        onAborted: handleStreamAborted,
        scrollToBottom,
      });
      initializeChat(); // Start the initialization process
      chatForm.addEventListener("submit", handleFormSubmit);
    setupTextareaResize();
    downloadMdBtn.addEventListener("click", handleDownloadMd);
    copyMdBtn.addEventListener("click", handleCopyMd);
    downloadJsonBtn.addEventListener("click", handleDownloadJson);
    setupCtrlEnterListener();
    if (stopButton) {
      stopButton.addEventListener("click", handleStopRequest);
    } else {
      console.error("[LLM Chat] Stop button not found in DOM.");
    }
  } catch (error) {
    console.error("[LLM Chat] Error during initialization:", error);
    showError("Error initializing chat features. Some functions may not work.");
  }
});

/**
 * Handles the form submission event.
 * @param {Event} event - The form submit event.
 */
const handleFormSubmit = (event) => {
  event.preventDefault();
  const userText = chatInput.value.trim();
  if (userText) {
    const didSend = queueAndSendUserMessage(userText);
    if (!didSend) {
      return;
    }
    chatInput.value = "";
    chatInput.style.height = "auto";
  }
};

/**
 * Initializes the chat by fetching settings for UI setup, then context for content.
 */
async function initializeChat() {
  console.log("[LLM Chat] Entering initializeChat function.");

  // --- Step 1: Fetch Settings for UI Setup ---
  try {
    const { response: settingsResponse } = await sendRuntimeAction(
      RuntimeMessageActions.getSettings,
    );

    if (!settingsResponse) {
      console.error("[LLM Chat] Error getting settings from background: No response");
      showError("Error loading settings: No response. Please check options and reload.");
      modelSelect.disabled = true;
      chatInput.disabled = true;
      if(sendButton) sendButton.disabled = true;
      return;
    }

    DEBUG = !!settingsResponse.debug;
    console.log("[LLM Chat] Debug mode set to:", DEBUG);
    if (DEBUG) console.log("[LLM Chat] Received settings response:", settingsResponse);

    // Validate and store models (expecting {id: string})
    if (Array.isArray(settingsResponse.models) && settingsResponse.models.length > 0 &&
        settingsResponse.models.every(m => typeof m === 'object' && m.id)) {
      chatState.setModels(settingsResponse.models); // Already {id: string} from background
      console.log("[LLM Chat] Models array populated from settings:", chatState.getState().models);
    } else {
      console.error("[LLM Chat] Invalid or empty models list received from settings.");
      showError("Error: Could not load valid models list from settings.");
      chatState.setModels([]); // Ensure models is an empty array
    }

    // Store language info
    chatState.setLanguageInfo(settingsResponse.language_info);
    chatState.setChatQuickPrompts(Array.isArray(settingsResponse.chatQuickPrompts)
      ? settingsResponse.chatQuickPrompts
        .filter((item) => item && typeof item.title === "string" && typeof item.prompt === "string")
        .map((item) => ({ title: item.title.trim(), prompt: item.prompt.trim() }))
        .filter((item) => item.title && item.prompt)
      : []);

    // Populate dropdown using the CHAT model ID as preferred
    const defaultChatModelId = settingsResponse.chatModelId || "";
    populateModelDropdown(defaultChatModelId); // Pass the specific chat default

    // Render flags
    renderLanguageFlags();
    renderQuickPromptButtons();

    // --- Step 2: Fetch Session Context for Initial Message ---
    // This runs *after* settings are processed
    await loadChatContext();
  } catch (error) {
    console.error("[LLM Chat] Error getting settings from background:", error);
    showError(`Error loading settings: ${error.message}. Please check options and reload.`);
    modelSelect.disabled = true;
    chatInput.disabled = true;
    if(sendButton) sendButton.disabled = true;
  }
}

async function loadChatContext() {
  try {
    const { response: contextResponse } = await sendRuntimeAction(
      RuntimeMessageActions.getChatContext,
    );

    if (!contextResponse) {
      console.error("[LLM Chat] Error getting context from background: No response");
      showError("Error loading chat context: No response. Displaying empty chat.");
      chatState.setMessages([]); // Start with empty messages on context error
      renderMessages();
      focusInput();
      return;
    }

    if (DEBUG) console.log("[LLM Chat] Received context response:", contextResponse);

    // Store context needed for display/prompts
    chatState.setChatContext({
      domSnippet: contextResponse.domSnippet,
      summary: contextResponse.summary, // The raw summary string/array
    });
    const modelUsedForSummary = chatState.setModelUsedForSummary(
      contextResponse.modelUsedForSummary || "",
    ); // Model ID used for the summary

    // Process and display the initial summary message
    if (typeof contextResponse.summary === 'string' && contextResponse.summary.trim()) {
      // The summary is now always an HTML string. No parsing is needed.
      const initialContent = contextResponse.summary;

      chatState.addMessage({
        role: "assistant",
        content: initialContent, // This will be the raw HTML string
        model: modelUsedForSummary || "Unknown"
      });
    } else {
      // Handle cases where the summary might be missing
      console.warn("[LLM Chat] Initial summary content missing or invalid in context.");
      chatState.setMessages([]); // Start empty if no summary
    }

    renderMessages(); // Render initial message (or empty state)
    focusInput();
  } catch (error) {
    console.error("[LLM Chat] Error getting context from background:", error);
    showError(`Error loading chat context: ${error.message}. Displaying empty chat.`);
    chatState.setMessages([]); // Start with empty messages on context error
    renderMessages();
    focusInput();
  }
}


/**
 * Sets focus to the chat input textarea.
 */
function focusInput() {
  if (chatInput) {
    chatInput.focus();
    if (DEBUG) console.log("[LLM Chat] Input focused.");
  } else {
    console.warn("[LLM Chat] chatInput element not found for focusing.");
  }
}

/**
 * Renders language flag buttons in the chat interface.
 */
function renderLanguageFlags() {
  if (!languageFlagsContainer) {
    console.error("[LLM Chat] Language flags container not found.");
    return;
  }
  languageFlagsContainer.innerHTML = ""; // Clear existing flags

  const { language_info } = chatState.getState();
  if (!Array.isArray(language_info) || language_info.length === 0) {
    if (DEBUG) console.log("[LLM Chat] No configured languages to render flags.");
    return;
  }

  if (DEBUG) console.log("[LLM Chat] Rendering language flags:", language_info);

  language_info.forEach((langInfo) => {
    const flagButton = document.createElement("button");
    flagButton.className = "language-flag-button";
    flagButton.title = `Translate last assistant message to ${langInfo.language_name}`;
    flagButton.dataset.languageName = langInfo.language_name;

    const flagImg = document.createElement("img");
    flagImg.className = "language-flag";
    flagImg.src = langInfo.svg_path;
    flagImg.alt = `${langInfo.language_name} flag`;
    flagImg.style.pointerEvents = "none";

    flagButton.appendChild(flagImg);
    flagButton.addEventListener("click", handleFlagButtonClick);
    languageFlagsContainer.appendChild(flagButton);
  });
}

/**
 * Renders quick prompt buttons in the chat interface.
 */
function renderQuickPromptButtons() {
  if (!quickPromptsContainer) {
    console.error("[LLM Chat] Quick prompts container not found.");
    return;
  }

  quickPromptsContainer.innerHTML = "";

  const { chatQuickPrompts, streaming } = chatState.getState();
  if (!Array.isArray(chatQuickPrompts) || chatQuickPrompts.length === 0) {
    return;
  }

  chatQuickPrompts.forEach((quickPrompt) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-prompt-button";
    button.textContent = quickPrompt.title;
    button.title = quickPrompt.prompt;
    button.dataset.quickPrompt = quickPrompt.prompt;
    button.disabled = streaming;
    button.addEventListener("click", handleQuickPromptButtonClick);
    quickPromptsContainer.appendChild(button);
  });
}

/**
 * Handles click events on language flag buttons.
 * @param {Event} event - The click event.
 */
function handleFlagButtonClick(event) {
  const { messages, streaming } = chatState.getState();
  if (streaming) {
    if (DEBUG) console.log("[LLM Chat] Flag click ignored: Chat is currently streaming.");
    showError("Chat is busy. Please wait for the current response to finish.", false, NOTIFICATION_TIMEOUT_MINOR_MS);
    return;
  }

  const targetLanguage = event.currentTarget.dataset.languageName;
  if (!targetLanguage) {
    console.error("[LLM Chat] Flag button missing language name data.");
    showError("Error: Could not determine target language for translation.");
    return;
  }

  const lastAssistantMessage = messages.slice().reverse().find(msg => msg.role === "assistant");

  if (!lastAssistantMessage || !lastAssistantMessage.content) {
    showError("No previous assistant message to translate.", false);
    if (DEBUG) console.log("[LLM Chat] Cannot translate: No previous assistant message found.");
    return;
  }

  let textToTranslate = "";
  if (Array.isArray(lastAssistantMessage.content)) {
    textToTranslate = lastAssistantMessage.content.join("\n");
  } else if (typeof lastAssistantMessage.content === 'string') {
    textToTranslate = lastAssistantMessage.content;
  } else {
    showError("Cannot translate: Invalid format of the last message.", false);
    if (DEBUG) console.log("[LLM Chat] Cannot translate: Invalid content type of last assistant message.", lastAssistantMessage.content);
    return;
  }

  if (DEBUG) console.log(`[LLM Chat] Flag clicked for translation to: ${targetLanguage}. Text to translate:`, textToTranslate.substring(0, 200) + (textToTranslate.length > 200 ? "..." : ""));

  const userMessage = buildTranslationRequest(targetLanguage, textToTranslate);

  queueAndSendUserMessage(userMessage);
}

/**
 * Handles click events on quick prompt buttons.
 * @param {Event} event - The click event.
 */
function handleQuickPromptButtonClick(event) {
  const quickPromptText = event.currentTarget?.dataset.quickPrompt;

  if (!quickPromptText) {
    console.error("[LLM Chat] Quick prompt button missing prompt text.");
    showError("Error: Could not load this quick prompt.");
    return;
  }

  queueAndSendUserMessage(quickPromptText);
}

/**
 * Adds a user message to chat and sends it through the request pipeline.
 * @param {string} userText - The text input by the user.
 * @returns {boolean} True when message was sent.
 */
function queueAndSendUserMessage(userText) {
  const { selectedModelId, streaming } = chatState.getState();
  if (streaming) {
    showError("Please wait for the current response to finish.", false, NOTIFICATION_TIMEOUT_MINOR_MS);
    return false;
  }

  if (!selectedModelId) {
    showError("Cannot send message: No model selected or configured.", false);
    console.log("[LLM Chat] No model selected, request aborted before queue.");
    return false;
  }

    chatState.addMessage({ role: "user", content: userText });
    renderMessages();
    chatStreamController.start(userText);
    return true;
  }

/**
 * Updates busy state for quick prompt buttons.
 * @param {boolean} isBusy - Whether chat is currently streaming.
 */
function setQuickPromptButtonsBusy(isBusy) {
  if (!quickPromptsContainer) {
    return;
  }

  const quickPromptButtons = quickPromptsContainer.querySelectorAll(".quick-prompt-button");
  quickPromptButtons.forEach((button) => {
    button.disabled = isBusy;
    button.classList.toggle("quick-prompt-button-busy", isBusy);
  });
}

/**
 * Updates controls that should be disabled while a chat response is pending.
 * @param {boolean} isBusy - Whether chat is currently streaming.
 */
function setChatBusyState(isBusy) {
    if (sendButton) sendButton.style.display = isBusy ? "none" : "block";
    if (stopButton) stopButton.style.display = isBusy ? "block" : "none";
    setQuickPromptButtonsBusy(isBusy);

    const flagButtons = languageFlagsContainer.querySelectorAll(".language-flag-button");
    flagButtons.forEach(button => {
      button.classList.toggle("language-flag-button-busy", isBusy);
      button.title = isBusy
        ? "Chat is busy, cannot translate now"
        : `Translate last assistant message to ${button.dataset.languageName}`;
    });
}

/**
 * Stores and renders a completed assistant response.
 * @param {object} result - Stream success result.
 */
function handleStreamSuccess(result) {
    if (DEBUG) console.log("[LLM Chat] Received successful direct content:", result.content.substring(0,100)+"...");

    chatState.addMessage({
      role: "assistant",
      content: result.content,
      model: result.model,
    });
    renderMessages();
}

/**
 * Shows a stream error.
 * @param {string} message - Error message.
 * @param {object} response - Raw error response.
 */
function handleStreamError(message, response) {
    console.error("[LLM Chat] Chat stream error:", response);
    showError(`Error: ${message}`);
}

/**
 * Handles an aborted stream response.
 */
function handleStreamAborted() {
    console.log("[LLM Chat] Chat request was aborted.");
}

/**
 * Populates the model dropdown with available models.
 * @param {string} preferredModelId - The preferred model ID (chatModelId) to select by default.
 */
function populateModelDropdown(preferredModelId) {
  console.log("[LLM Chat] Populating dropdown, preferred chat default:", preferredModelId);
  if (!modelSelect) {
    console.error("[LLM Chat] Model select element not found.");
    return;
  }
  const { models } = chatState.getState();
  modelSelect.innerHTML = "";
  modelSelect.disabled = false;

  if (!models || models.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No models configured";
    opt.disabled = true;
    modelSelect.appendChild(opt);
    modelSelect.disabled = true;
    chatState.setSelectedModelId("");
    console.log("[LLM Chat] No models available, dropdown disabled.");
    return;
  }

  models.forEach((model) => {
    const opt = document.createElement("option");
    opt.value = model.id;
    opt.textContent = model.id; // Use only ID for display text
    modelSelect.appendChild(opt);
  });

  const availableModelIds = models.map(m => m.id);
  if (preferredModelId && typeof preferredModelId === 'string' && availableModelIds.includes(preferredModelId)) {
    modelSelect.value = preferredModelId;
    chatState.setSelectedModelId(preferredModelId);
    console.log("[LLM Chat] Set selected model to preferred chat default:", preferredModelId);
  } else if (models.length > 0) {
    modelSelect.value = models[0].id;
    chatState.setSelectedModelId(models[0].id);
    console.warn("[LLM Chat] Preferred chat default invalid or missing, set selected model to first available:", models[0].id);
  } else {
    chatState.setSelectedModelId("");
    console.log("[LLM Chat] No models to select.");
  }

  modelSelect.onchange = function() {
    const selectedModelId = chatState.setSelectedModelId(this.value);
    console.log("[LLM Chat] Model changed via dropdown to:", selectedModelId);
  };
}


/**
 * Renders the chat messages in the UI.
 */
function renderMessages() {
  const wrap = chatMessagesInnerDiv;
  if (!wrap) {
    console.error("[LLM Chat] chatMessagesInnerDiv not found for rendering.");
    return;
  }
  const { messages, streaming } = chatState.getState();
  if (DEBUG) console.log(`[LLM Chat Render] Rendering ${messages.length} messages.`);
  renderChatMessages(wrap, { messages });
  // Only scroll if not currently streaming
  if (!streaming) {
      scrollToBottom();
  }
}


/**
 * Scrolls the chat messages to the bottom.
 */
function scrollToBottom() {
  if (chatMessages) {
    // Use setTimeout to ensure scroll happens after potential reflow
    setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; }, 0);
  } else {
    console.warn("[LLM Chat] chatMessages element not found for scrolling.");
  }
}

/**
 * Sets up textarea resize functionality. (Unchanged)
 */
function setupTextareaResize() {
  if (chatInput) {
    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height = chatInput.scrollHeight + "px";
    });
  }
}

/**
 * Handles downloading the chat as a Markdown file. (Unchanged)
 */
function handleDownloadMd() {
  console.log("[LLM Chat] Handling download as Markdown.");
  const { messages } = chatState.getState();
  downloadChatMarkdown(messages);
}

/**
 * Handles copying the chat content as Markdown to the clipboard. (Unchanged)
 */
function handleCopyMd() {
  console.log("[LLM Chat] Handling copy as Markdown.");
  const { messages } = chatState.getState();
  copyChatMarkdown(messages)
    .then(() => { showError("Chat copied to clipboard as Markdown.", false); })
    .catch(err => { showError("Error copying to clipboard: " + err.message); });
}

/**
 * Handles downloading the chat as a JSON file. (Unchanged)
 */
function handleDownloadJson() {
  console.log("[LLM Chat] Handling download as JSON.");
  const { messages } = chatState.getState();
  downloadChatJson(messages);
}

/**
 * Handles stopping the current chat request.
 */
function handleStopRequest() {
    console.log("[LLM Chat] Stop request initiated.");
    if (chatStreamController.stop()) {
      showError("Chat request stopped by user.", false);
      console.log("[LLM Chat] Chat request stopped.");
    }
  }

/**
 * Handles keydown events for Ctrl+Enter or Cmd+Enter. (Unchanged)
 */
function handleChatInputKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    if (chatForm && !chatState.getState().streaming) {
      chatForm.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  }
}

/**
 * Sets up the Ctrl+Enter listener. (Unchanged)
 */
function setupCtrlEnterListener() {
  if (chatInput) {
    chatInput.addEventListener("keydown", handleChatInputKeydown);
  }
}
