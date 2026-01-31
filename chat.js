// chat.js
/**
 * chat.js
 * Short Spec: This file handles the chat interface for the OpenRouter Summarizer extension.
 * It manages chat messages, user input, model selection, and interactions with the background script.
 * It now also displays language flags for translation requests.
 * Called from: chat.html (DOMContentLoaded event).
 * Dependencies: utils.js for tryParseJson and showError.
 */

console.log(`[LLM Chat] Script Start (v3.2.2 - Direct Markdown)`); // Updated version

// ==== GLOBAL STATE ====
import { tryParseJson, showError, renderTextAsHtml } from "./utils.js"; // Import renderTextAsHtml
import {
  CHAT_SYSTEM_PROMPT_TEMPLATE,
  CHAT_USER_CONTEXT_TEMPLATE,
  CHAT_TRANSLATION_REQUEST_TEMPLATE,
  SNIPPET_TRUNCATION_LIMIT,
  NOTIFICATION_TIMEOUT_MINOR_MS,
} from "./constants.js";

let models = []; // Array of {id: string}
let selectedModelId = ""; // The ID selected in the dropdown for sending requests
let chatContext = { domSnippet: null, summary: null }; // Removed chatTargetLanguage here, context is simpler
let messages = []; // Array of {role: string, content: string | string[], model?: string}
let streaming = false;
let currentStreamModel = ""; // Stores the model ID used for the *current* stream
let DEBUG = false; // Updated by getSettings response
let chatMessagesInnerDiv = null;
let modelUsedForSummary = ""; // Stores the model ID used for the *initial* summary
let language_info = []; // Store configured languages {language_name: string, svg_path: string}

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
  languageFlagsContainer;

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

  // Check if all essential elements are present
  if (!chatMessagesInnerDiv || !downloadMdBtn || !copyMdBtn || !downloadJsonBtn ||
      !chatInput || !modelSelect || !chatForm || !chatMessages || !sendButton ||
      !stopButton || !languageFlagsContainer) {
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
  if (userText && !streaming) { // Prevent sending while streaming
    messages.push({ role: "user", content: userText });
    renderMessages();
    sendChatRequestToBackground(userText);
    chatInput.value = "";
    chatInput.style.height = "auto";
  } else if (streaming) {
      showError("Please wait for the current response to finish.", false, NOTIFICATION_TIMEOUT_MINOR_MS);
  }
};

/**
 * Initializes the chat by fetching settings for UI setup, then context for content.
 */
function initializeChat() {
  console.log("[LLM Chat] Entering initializeChat function.");

  // --- Step 1: Fetch Settings for UI Setup ---
  chrome.runtime.sendMessage({ action: "getSettings" }, (settingsResponse) => {
    if (chrome.runtime.lastError || !settingsResponse) {
      console.error("[LLM Chat] Error getting settings from background:", chrome.runtime.lastError);
      showError(`Error loading settings: ${chrome.runtime.lastError?.message || 'No response'}. Please check options and reload.`);
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
      models = settingsResponse.models; // Already {id: string} from background
      console.log("[LLM Chat] Models array populated from settings:", models);
    } else {
      console.error("[LLM Chat] Invalid or empty models list received from settings.");
      showError("Error: Could not load valid models list from settings.");
      models = []; // Ensure models is an empty array
    }

    // Store language info
    language_info = Array.isArray(settingsResponse.language_info) ? settingsResponse.language_info : [];

    // Populate dropdown using the CHAT model ID as preferred
    const defaultChatModelId = settingsResponse.chatModelId || "";
    populateModelDropdown(defaultChatModelId); // Pass the specific chat default

    // Render flags
    renderLanguageFlags();

    // --- Step 2: Fetch Session Context for Initial Message ---
    // This runs *after* settings are processed
    chrome.runtime.sendMessage({ action: "getChatContext" }, (contextResponse) => {
      if (chrome.runtime.lastError || !contextResponse) {
        console.error("[LLM Chat] Error getting context from background:", chrome.runtime.lastError);
        showError(`Error loading chat context: ${chrome.runtime.lastError?.message || 'No response'}. Displaying empty chat.`);
        messages = []; // Start with empty messages on context error
        renderMessages();
        focusInput();
        return;
      }

      if (DEBUG) console.log("[LLM Chat] Received context response:", contextResponse);

      // Store context needed for display/prompts
      chatContext.domSnippet = contextResponse.domSnippet;
      chatContext.summary = contextResponse.summary; // The raw summary string/array
      modelUsedForSummary = contextResponse.modelUsedForSummary || ""; // Model ID used for the summary

      // Process and display the initial summary message
      if (typeof contextResponse.summary === 'string' && contextResponse.summary.trim()) {
        // The summary is now always an HTML string. No parsing is needed.
        const initialContent = contextResponse.summary;

        messages.push({
          role: "assistant",
          content: initialContent, // This will be the raw HTML string
          model: modelUsedForSummary || "Unknown"
        });
      } else {
        // Handle cases where the summary might be missing
        console.warn("[LLM Chat] Initial summary content missing or invalid in context.");
        messages = []; // Start empty if no summary
      }

      renderMessages(); // Render initial message (or empty state)
      focusInput();

    }); // End getChatContext callback

  }); // End getSettings callback
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
 * Handles click events on language flag buttons.
 * @param {Event} event - The click event.
 */
function handleFlagButtonClick(event) {
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

  const userMessage = CHAT_TRANSLATION_REQUEST_TEMPLATE
    .replace("${targetLanguage}", targetLanguage)
    .replace("${textToTranslate}", textToTranslate);

  messages.push({ role: "user", content: userMessage });
  renderMessages();
  sendChatRequestToBackground(userMessage);
}

/**
 * Sends a chat request to the background script with the user's text.
 * @param {string} userText - The text input by the user.
 */
function sendChatRequestToBackground(userText) {
  if (streaming) {
    console.log("[LLM Chat] Streaming in progress, request ignored.");
    return;
  }
  if (!selectedModelId) {
    showError("Cannot send message: No model selected or configured.", false);
    console.log("[LLM Chat] No model selected, request aborted.");
    return;
  }

  streaming = true;
  currentStreamModel = selectedModelId;
  console.log("[LLM Chat] Streaming started with model:", currentStreamModel);
  if (sendButton) sendButton.style.display = "none";
  if (stopButton) stopButton.style.display = "block";

  const flagButtons = languageFlagsContainer.querySelectorAll(".language-flag-button");
  flagButtons.forEach(button => {
    button.classList.add("language-flag-button-busy");
    button.title = "Chat is busy, cannot translate now";
  });

  const wrap = chatMessagesInnerDiv;
  if (!wrap) {
    console.error("[LLM Chat] messagesWrap (chatMessagesInnerDiv) not found.");
    streaming = false;
    return;
  }
  const modelLabelDiv = document.createElement("div");
  modelLabelDiv.className = "assistant-model-label";
  modelLabelDiv.textContent = `Model: ${currentStreamModel}`;
  wrap.appendChild(modelLabelDiv);
  const streamContainer = document.createElement("div");
  streamContainer.className = "msg assistant";
  streamContainer.innerHTML = `<span class="assistant-inner" id="activeStreamSpan">(...)</span>`;
  wrap.appendChild(streamContainer);
  scrollToBottom();

  const apiMessages = buildApiMessages(userText, messages, chatContext);

  // --- MODIFIED: Send request to background (no change here, background handles format) ---
  chrome.runtime.sendMessage(
    { action: "llmChatStream", messages: apiMessages, model: selectedModelId },
    (response) => { // --- MODIFIED: Callback handles direct content ---
      streaming = false;
      if (sendButton) sendButton.style.display = "block";
      if (stopButton) stopButton.style.display = "none";
      flagButtons.forEach(button => {
        button.classList.remove("language-flag-button-busy");
        button.title = `Translate last assistant message to ${button.dataset.languageName}`;
      });
      // Remove the placeholder message container
      if (streamContainer && streamContainer.parentNode === wrap) {
          wrap.removeChild(streamContainer);
          wrap.removeChild(modelLabelDiv);
      }

      if (chrome.runtime.lastError) {
        console.error("[LLM Chat] Error receiving response from background:", chrome.runtime.lastError);
        showError(`Error: ${chrome.runtime.lastError.message}.`);
        return;
      }

      // --- MODIFIED: Process direct 'content' instead of 'data' ---
      if (response.status === "success" && response.content !== undefined) {
        if (DEBUG) console.log("[LLM Chat] Received successful direct content:", response.content.substring(0,100)+"...");

        // Content is already the direct Markdown string
        const contentToStore = response.content;

        const newMessage = {
          role: "assistant",
          content: contentToStore, // Store the direct string
          model: currentStreamModel,
        };
        messages.push(newMessage);
        renderMessages(); // Re-render with the new message

      } else if (response.status === "error") {
        console.error("[LLM Chat] Background response error:", response.message);
        showError(`Error: ${response.message || 'Failed to get response from LLM.'}`);
      } else if (response.status === "aborted") {
          console.log("[LLM Chat] Chat request was aborted.");
      } else {
          // Handle case where status is success but content is missing, or unknown status
          console.error("[LLM Chat] Unexpected/Error response from background:", response);
          showError(`Error: ${response.message || 'Unknown response from background script.'}`);
      }
      // --- END MODIFICATION ---
    }
  );
}

/**
 * Builds the array of messages to be sent to the API.
 * It includes the page context for the first user message and then the recent chat history for subsequent messages.
 * @param {string} userText - The latest message from the user.
 * @param {Array} messages - The entire history of chat messages.
 * @param {object} chatContext - An object containing the domSnippet and summary.
 * @returns {Array} The array of message objects for the API request.
 */
function buildApiMessages(userText, messages, chatContext) {
  const apiMessages = [{ role: "system", content: CHAT_SYSTEM_PROMPT_TEMPLATE }];
  const userMessageCount = messages.filter(m => m.role === 'user').length;

  if (userMessageCount === 1) {
    // This is the first user message in the chat. Include the full context.
    if (DEBUG) console.log("[LLM Chat] First user message. Building request with full context.");
    const summaryString = Array.isArray(chatContext.summary) ? chatContext.summary.join("\n") : String(chatContext.summary);
    const contextContent = CHAT_USER_CONTEXT_TEMPLATE
      .replace("${domSnippet}", chatContext.domSnippet)
      .replace("${summary}", summaryString);
    apiMessages.push({ role: "user", content: contextContent });
    apiMessages.push({ role: "user", content: userText });
  } else {
    // This is a follow-up message. Include recent chat history.
    if (DEBUG) console.log("[LLM Chat] Follow-up message. Building request with recent history.");
    const recentHistory = messages
      .slice(0, messages.length - 1) // Exclude the latest user message (it's added separately)
      .slice(1) // Exclude the initial summary message from the assistant
      .filter(m => m.role === 'user' || m.role === 'assistant') // Only include user and assistant messages
      .slice(-10) // Get the last 10 messages to keep the context relevant
      .map(msg => ({
        role: msg.role,
        content: Array.isArray(msg.content) ? msg.content.join("\n") : String(msg.content)
      }));

    // Add a condensed context message for follow-up requests
    let snippetForContext = chatContext.domSnippet || "";
    if (snippetForContext.length > SNIPPET_TRUNCATION_LIMIT) {
      snippetForContext = snippetForContext.substring(0, SNIPPET_TRUNCATION_LIMIT) + "[...truncated]";
    }
    const followUpContextContent = CHAT_USER_CONTEXT_TEMPLATE
      .replace("${domSnippet}", snippetForContext)
      .replace("\n\nInitial Summary:\n${summary}", ""); // Remove summary part for follow-ups
    apiMessages.push({ role: "user", content: followUpContextContent });

    apiMessages.push(...recentHistory);
    apiMessages.push({ role: "user", content: userText });
  }
  return apiMessages;
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
  modelSelect.innerHTML = "";
  modelSelect.disabled = false;

  if (!models || models.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No models configured";
    opt.disabled = true;
    modelSelect.appendChild(opt);
    modelSelect.disabled = true;
    selectedModelId = "";
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
    selectedModelId = preferredModelId;
    console.log("[LLM Chat] Set selected model to preferred chat default:", preferredModelId);
  } else if (models.length > 0) {
    modelSelect.value = models[0].id;
    selectedModelId = models[0].id;
    console.warn("[LLM Chat] Preferred chat default invalid or missing, set selected model to first available:", models[0].id);
  } else {
    selectedModelId = "";
    console.log("[LLM Chat] No models to select.");
  }

  modelSelect.onchange = function() {
    selectedModelId = this.value;
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
  if (DEBUG) console.log(`[LLM Chat Render] Rendering ${messages.length} messages.`);
  wrap.innerHTML = ""; // Clear previous messages

  if (messages.length === 0) {
    wrap.innerHTML = '<div class="msg system-info">Chat started. Ask a follow-up question...</div>';
  } else {
    messages.forEach((msg, index) => {
      const msgDiv = document.createElement("div");
      msgDiv.classList.add("msg");

      if (msg.role === "assistant") {
        msgDiv.classList.add("assistant");
        if (msg.model) {
          const modelLabelDiv = document.createElement("div");
          modelLabelDiv.className = "assistant-model-label";
          modelLabelDiv.textContent = `Model: ${msg.model}`;
          msgDiv.appendChild(modelLabelDiv);
        }
        const contentSpan = document.createElement("span");
        contentSpan.className = "assistant-inner";
        let contentToRender = "[Error: Invalid message content]";

        if (Array.isArray(msg.content)) {
          // Initial summary (array of strings) - render as list
          contentToRender = "<ul>" + msg.content.map(item => `<li>${renderTextAsHtml(item)}</li>`).join("") + "</ul>";
        } else if (typeof msg.content === 'string') {
          // Subsequent chat responses (string) or fallback raw summary
          // --- MODIFIED: No JSON parsing needed here ---
          contentToRender = renderTextAsHtml(stripCodeFences(msg.content));
          // --- END MODIFICATION ---
        }

        contentSpan.innerHTML = contentToRender;
        msgDiv.appendChild(contentSpan);
        wrap.appendChild(msgDiv);

      } else if (msg.role === "user") {
        msgDiv.classList.add("user");
        msgDiv.innerHTML = renderTextAsHtml(msg.content);
        wrap.appendChild(msgDiv);

      } else if (msg.role === "system") {
        msgDiv.classList.add("system-info");
        msgDiv.textContent = msg.content;
        wrap.appendChild(msgDiv);
      }
    });
  }
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
  const mdContent = formatChatAsMarkdown();
  const blob = new Blob([mdContent], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chat.md";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Handles copying the chat content as Markdown to the clipboard. (Unchanged)
 */
function handleCopyMd() {
  console.log("[LLM Chat] Handling copy as Markdown.");
  const mdContent = formatChatAsMarkdown();
  navigator.clipboard.writeText(mdContent)
    .then(() => { showError("Chat copied to clipboard as Markdown.", false); })
    .catch(err => { showError("Error copying to clipboard: " + err.message); });
}

/**
 * Handles downloading the chat as a JSON file. (Unchanged)
 */
function handleDownloadJson() {
  console.log("[LLM Chat] Handling download as JSON.");
  const messagesToSave = messages.map(msg => ({
      ...msg,
      content: Array.isArray(msg.content) ? msg.content.join("\n") : msg.content
  }));
  const jsonContent = JSON.stringify(messagesToSave, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chat.json";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Handles stopping the current chat request. (Unchanged)
 */
function handleStopRequest() {
  console.log("[LLM Chat] Stop request initiated.");
  if (streaming) {
    streaming = false;
    if (sendButton) sendButton.style.display = "block";
    if (stopButton) stopButton.style.display = "none";
    showError("Chat request stopped by user.", false);
    console.log("[LLM Chat] Chat request stopped.");

    const flagButtons = languageFlagsContainer.querySelectorAll(".language-flag-button");
    flagButtons.forEach(button => {
      button.classList.remove("language-flag-button-busy");
      button.title = `Translate last assistant message to ${button.dataset.languageName}`;
    });

    chrome.runtime.sendMessage({ action: "abortChatRequest" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[LLM Chat] Error sending abort request:", chrome.runtime.lastError);
      } else if (response && response.status === "aborted") {
        console.log("[LLM Chat] Background confirmed request abort.");
      } else {
        console.log("[LLM Chat] Background could not abort request or no active request.");
      }
    });
  }
}

/**
 * Handles keydown events for Ctrl+Enter or Cmd+Enter. (Unchanged)
 */
function handleChatInputKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    if (chatForm && !streaming) {
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

/**
 * Strips code fences from text content. (Unchanged)
 */
function stripCodeFences(text) {
  if (typeof text !== 'string') {
    console.warn("[LLM Chat] stripCodeFences received non-string input:", text);
    return "";
  }
  return text.replace(/```(?:\w*\n)?([\s\S]*?)```/g, '$1').trim();
}

/**
 * Formats the chat messages as Markdown content. (Unchanged)
 */
function formatChatAsMarkdown() {
  return messages.map(msg => {
    let contentString = "";
    if (Array.isArray(msg.content)) {
      contentString = msg.content.join("\n");
    } else if (typeof msg.content === 'string') {
      contentString = msg.content;
    } else {
      contentString = "[Invalid message content]";
    }

    return msg.role === 'user'
      ? `**User:**\n${contentString}`
      : msg.role === 'assistant'
        ? `**Assistant (${msg.model || 'Unknown'}):**\n${contentString}`
        : `**System:**\n${contentString}`;
  }).join("\n\n---\n\n");
}
