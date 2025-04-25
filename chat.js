// chat.js
/**
 * chat.js
 * Short Spec: This file handles the chat interface for the OpenRouter Summarizer extension.
 * It manages chat messages, user input, model selection, and interactions with the background script.
 * It now also displays language flags for translation requests.
 * Called from: chat.html (DOMContentLoaded event).
 * Dependencies: utils.js for tryParseJson and showError.
 */

console.log(`[LLM Chat] Script Start (v3.0.9)`); // Updated version

// ==== GLOBAL STATE ====
import { tryParseJson, showError } from "./utils.js";
import {
  CHAT_SYSTEM_PROMPT_TEMPLATE,
  CHAT_USER_CONTEXT_TEMPLATE,
  CHAT_TRANSLATION_REQUEST_TEMPLATE, // Import new constant
} from "./constants.js"; // Import new constants

let models = [];
let selectedModelId = "";
let chatContext = { domSnippet: null, summary: null, chatTargetLanguage: "" };
let messages = [];
let streaming = false;
let currentStreamMsgSpan = null;
let currentStreamRawContent = "";
let currentStreamModel = "";
let DEBUG = false; // Updated by getChatContext response
let chatMessagesInnerDiv = null;
let messageListenerAttached = false;
const SNIPPET_TRUNCATION_LIMIT = 65568; // Increased slightly
let modelUsedForSummary = ""; // Add global state variable
let language_info = []; // Store configured languages

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
  languageFlagsContainer; // Reference to the new flags container

// ==== INITIALIZATION ====

document.addEventListener("DOMContentLoaded", () => {
  console.log("[LLM Chat] DOMContentLoaded event fired.");

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
  languageFlagsContainer = document.getElementById("languageFlagsContainer"); // Get the new container

  if (
    !chatMessagesInnerDiv ||
    !downloadMdBtn ||
    !copyMdBtn ||
    !downloadJsonBtn ||
    !chatInput ||
    !modelSelect ||
    !chatForm ||
    !chatMessages ||
    !sendButton ||
    !stopButton ||
    !languageFlagsContainer // Check for the new container
  ) {
    console.error(
      "CRITICAL: Could not find essential UI elements! Aborting initialization.",
    );
    document.body.innerHTML =
      '<div style="color: red; padding: 20px; font-family: sans-serif;">Error: Chat UI structure is missing essential elements. Cannot load chat.</div>';
    return;
  }

  if (typeof marked !== "undefined") {
    marked.setOptions({ breaks: true, gfm: true });
  } else {
    console.warn(
      "Marked library failed to load! Markdown rendering will use basic newline conversion.",
    );
  }

  try {
    console.log("[LLM Chat] Attempting to initialize chat...");
    initializeChat();
    chatForm.addEventListener("submit", handleFormSubmit);
    setupStreamListeners(); // Currently no-op
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
  event.preventDefault(); // Prevent default form submission

  const userText = chatInput.value.trim();
  if (userText) {
    // Add user message to chat history and render
    messages.push({ role: "user", content: userText });
    renderMessages();

    // Send message to background script for LLM processing
    sendChatRequestToBackground(userText);

    // Clear input and resize
    chatInput.value = "";
    chatInput.style.height = "auto"; // Reset height
  }
};

/**
 * Initializes the chat by fetching context from the background script and setting up the UI.
 */
function initializeChat() {
  console.log("[LLM Chat] Entering initializeChat function.");
  chrome.runtime.sendMessage({ action: "getChatContext" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(
        "[LLM Chat] Error getting context from background:",
        chrome.runtime.lastError,
      );
      showError(
        `Error loading chat context: ${chrome.runtime.lastError.message}. Please close this tab and try again.`,
      );
      return;
    }

    DEBUG = !!response?.debug;
    console.log("[LLM Chat] Debug mode set to:", DEBUG);
    if (DEBUG) {
      console.log(
        "[LLM Chat] Received context response from background:",
        response, // Log the full response
      );
    }

    if (
      response &&
      Array.isArray(response.models) &&
      response.models.length > 0 &&
      response.models.every((m) => typeof m === "object" && m.id)
    ) {
      models = response.models;
      console.log("[LLM Chat] Models array populated:", models);
      modelUsedForSummary = response.modelUsedForSummary || "";
      if (DEBUG)
        console.log(
          "[LLM Chat] Model used for initial summary:",
          modelUsedForSummary,
        );

      // Store language info and render flags
      language_info = Array.isArray(response.language_info)
        ? response.language_info
        : [];
      renderLanguageFlags(); // Render flags based on received info

      // Populate dropdown, try selecting the actual model used for summary first,
      // then fall back to the first available model if it's not in the list (shouldn't happen ideally)
      populateModelDropdown(
        modelUsedForSummary || (models.length > 0 ? models[0].id : ""),
      );

      if (
        response.domSnippet &&
        response.summary !== undefined &&
        response.summary !== null
      ) {
        chatContext.domSnippet = response.domSnippet;
        chatContext.summary = response.summary;
        chatContext.chatTargetLanguage = response.chatTargetLanguage || ""; // This might be set if chat was opened via a flag in the old popup

        let initialContent;
        let parseError = false;
        if (
          typeof chatContext.summary === "string" &&
          chatContext.summary.trim()
        ) { // Spec: Attempt to parse the initial summary as a JSON array.
          const parsedInitialSummary = tryParseJson(chatContext.summary, false); // Don't log warning here, handle below
          if (Array.isArray(parsedInitialSummary)) { // Spec: If successfully parsed as an array, use the array as content.
            initialContent = parsedInitialSummary.map(item => String(item)); // Store as array of strings
          } else {
            initialContent = chatContext.summary;
            parseError = true;
          }
        } else {
          initialContent = "(No initial summary provided)";
          parseError = true;
        }

        messages = [
          {
            role: "assistant",
            content: initialContent, // Spec: Content is now the parsed array or the raw string.
            model: modelUsedForSummary || "Unknown", // Use the specific model here
          },
        ];

        console.log(
          "[LLM Chat] Messages array after adding initial message:",
          messages,
        );
        if (parseError) {
          showError(
            "Failed to parse initial summary. Displaying raw data.",
            false,
          );
        }
        renderMessages(); // Render initial message with correct model label

        // The initial translation request logic based on chatTargetLanguage is removed
        // as flags now trigger a new chat turn directly.
      } else {
        console.warn(
          "[LLM Chat] Context received from background is incomplete.",
        );
        messages = [];
        renderMessages();
        showError("Could not load initial summary context.", false);
      }
      focusInput();
    } else {
      console.error(
        "[LLM Chat] Failed to get valid context or models list.",
        response,
      );
      showError("Error: Could not load models list from settings.");
    }
  });
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
    if (DEBUG)
      console.log("[LLM Chat] No configured languages to render flags.");
    return;
  }

  if (DEBUG) console.log("[LLM Chat] Rendering language flags:", language_info);

  language_info.forEach((langInfo) => {
    const flagButton = document.createElement("button");
    flagButton.className = "language-flag-button"; // Use the new class from chat.css
    flagButton.title = `Translate last assistant message to ${langInfo.language_name}`;
    flagButton.dataset.languageName = langInfo.language_name; // Store language name

    const flagImg = document.createElement("img");
    flagImg.className = "language-flag"; // Use the class from chat.css
    flagImg.src = langInfo.svg_path;
    flagImg.alt = `${langInfo.language_name} flag`;
    flagImg.style.pointerEvents = "none"; // Prevent image interfering with button click

    flagButton.appendChild(flagImg);

    // Add click listener to initiate translation
    flagButton.addEventListener("click", handleFlagButtonClick);

    languageFlagsContainer.appendChild(flagButton);
  });
}

/**
 * Handles click events on language flag buttons.
 * @param {Event} event - The click event.
 */
function handleFlagButtonClick(event) {
  const targetLanguage = event.currentTarget.dataset.languageName;
  if (!targetLanguage) {
    console.error("[LLM Chat] Flag button missing language name data.");
    showError("Error: Could not determine target language for translation.");
    return;
  }

  // Find the content of the last assistant message
  const lastAssistantMessage = messages
    .slice()
    .reverse()
    .find((msg) => msg.role === "assistant");

  if (!lastAssistantMessage || !lastAssistantMessage.content) {
    showError("No previous assistant message to translate.", false);
    if (DEBUG)
      console.log(
        "[LLM Chat] Cannot translate: No previous assistant message found.",
      );
    return;
  }

  let textToTranslate = "";
  if (Array.isArray(lastAssistantMessage.content)) {
    // If the content is an array (like the initial summary), join it for translation
    textToTranslate = lastAssistantMessage.content.join("\n"); // Join with newlines
  } else if (typeof lastAssistantMessage.content === "string") {
    // If the content is a string, use it directly
    textToTranslate = lastAssistantMessage.content;
  } else {
    showError("Cannot translate: Invalid format of the last message.", false);
    if (DEBUG)
      console.log(
        "[LLM Chat] Cannot translate: Invalid content type of last assistant message.",
        lastAssistantMessage.content,
      );
    return;
  }

  if (DEBUG)
    console.log(
      `[LLM Chat] Flag clicked for translation to: ${targetLanguage}. Text to translate:`,
      textToTranslate.substring(0, 200) +
        (textToTranslate.length > 200 ? "..." : ""),
    );

  // Construct the specific user message using the constant and the text to translate
  const userMessage = CHAT_TRANSLATION_REQUEST_TEMPLATE.replace(
    "${targetLanguage}",
    targetLanguage,
  ).replace("${textToTranslate}", textToTranslate);

  // Add the user message to the chat history
  messages.push({ role: "user", content: userMessage });
  renderMessages(); // Render the new user message

  // Send the message to the background script using the standard chat pipeline
  sendChatRequestToBackground(userMessage);
}

// Removed sendTranslationRequest function

/**
 * Sends a chat request to the background script with the user's text.
 * @param {string} userText - The text input by the user.
 */
function sendChatRequestToBackground(userText) {
  // console.log( // Less verbose
  //   "[LLM Chat] Entering sendChatRequestToBackground with userText:",
  //   userText,
  // );
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
  currentStreamRawContent = "";
  console.log("[LLM Chat] Streaming started with model:", currentStreamModel);
  if (sendButton) sendButton.style.display = "none";
  if (stopButton) stopButton.style.display = "block";
  const messagesWrap = chatMessagesInnerDiv;
  if (!messagesWrap) {
    console.error("[LLM Chat] messagesWrap not found.");
    streaming = false;
    return;
  }
  const modelLabelDiv = document.createElement("div");
  modelLabelDiv.className = "assistant-model-label";
  modelLabelDiv.textContent = `Model: ${currentStreamModel}`;
  messagesWrap.appendChild(modelLabelDiv);
  // console.log("[LLM Chat] Added model label to messages wrap."); // Less verbose
  let streamContainer = document.createElement("div");
  streamContainer.className = "msg assistant";
  streamContainer.innerHTML = `<span class="assistant-inner" id="activeStreamSpan"></span>`;
  messagesWrap.appendChild(streamContainer);
  currentStreamMsgSpan = streamContainer.querySelector("#activeStreamSpan");
  if (!currentStreamMsgSpan) {
    console.error("[LLM Chat] currentStreamMsgSpan not found.");
    streaming = false;
    return;
  }
  const apiMessages = [
    {
      role: "system",
      content: CHAT_SYSTEM_PROMPT_TEMPLATE, // Use constant
    },
  ];
  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const isFirstUserTurn = userMessageCount === 1;
  // console.log( // Less verbose
  //   "[LLM Chat] User message count:",
  //   userMessageCount,
  //   "Is first turn:",
  //   isFirstUserTurn,
  // );
  if (
    isFirstUserTurn &&
    chatContext.domSnippet &&
    chatContext.summary !== undefined &&
    chatContext.summary !== null
  ) {
    // Use constant template for context
    const contextContent = CHAT_USER_CONTEXT_TEMPLATE.replace('${domSnippet}', chatContext.domSnippet).replace('${summary}', chatContext.summary);
    apiMessages.push({
      role: "user",
      content: contextContent,
    });
    apiMessages.push({ role: "user", content: userText });
    // console.log("[LLM Chat] Added context and user text for first turn."); // Less verbose
  } else {
    const recentHistory = messages
      .slice(0, messages.length - 1) // Exclude the latest user message which is in userText
      .slice(1) // Exclude the initial summary message
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-10); // Limit history
    // console.log("[LLM Chat] Recent history:", recentHistory); // Less verbose
    if (chatContext.domSnippet) {
      let snippetForContext = chatContext.domSnippet;
      if (snippetForContext.length > SNIPPET_TRUNCATION_LIMIT) {
        snippetForContext =
          snippetForContext.substring(0, SNIPPET_TRUNCATION_LIMIT) +
          "[...truncated]";
        // console.log("[LLM Chat] Snippet truncated for context."); // Less verbose
      }
      // Use constant template for context, but only include snippet
      const contextContent = CHAT_USER_CONTEXT_TEMPLATE.replace('${domSnippet}', snippetForContext).replace('\n\nInitial Summary:\n${summary}', ''); // Remove summary part
      apiMessages.push({
        role: "user",
        content: contextContent,
      });
    }
    apiMessages.push(...recentHistory);
    apiMessages.push({ role: "user", content: userText });
    // console.log("[LLM Chat] Added recent history and user text."); // Less verbose
  }
  chrome.runtime.sendMessage(
    {
      action: "llmChatStream",
      messages: apiMessages,
      model: selectedModelId,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[LLM Chat] Error from background:",
          chrome.runtime.lastError,
        );
        showError(`Error: ${chrome.runtime.lastError.message}.`);
        streaming = false;
        if (sendButton) sendButton.style.display = "block";
        if (stopButton) stopButton.style.display = "none";
        return;
      }

      if (response.status === "success" && response.data) {
        // console.log( // Less verbose
        //   "[LLM Chat] Received successful response from background:",
        //   response.data,
        // );
        const newMessage = {
          role: "assistant",
          content: response.data.choices[0].message.content,
          model: currentStreamModel,
        };
        messages.push(newMessage);
        renderMessages();
      } else {
        console.error(
          "[LLM Chat] Background response error:",
          response.message,
        );
        showError("Error: Failed to get response from LLM.");
      }
      streaming = false;
      if (sendButton) sendButton.style.display = "block";
      if (stopButton) stopButton.style.display = "none";
    },
  );
}

/**
 * Populates the model dropdown with available models.
 * @param {string} preferredModelId - The preferred model ID to select by default.
 */
function populateModelDropdown(preferredModelId) {
  console.log(
    "[LLM Chat] Entering populateModelDropdown with preferredModelId:",
    preferredModelId,
  );
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
    opt.textContent = model.label || model.id;
    modelSelect.appendChild(opt);
    // console.log("[LLM Chat] Added option to dropdown:", model); // Less verbose
  });
  const availableModelIds = models.map((m) => m.id);
  if (
    preferredModelId &&
    typeof preferredModelId === "string" &&
    availableModelIds.includes(preferredModelId)
  ) {
    modelSelect.value = preferredModelId;
    selectedModelId = preferredModelId;
    console.log(
      "[LLM Chat] Set selected model to preferred:",
      preferredModelId,
    );
  } else if (models.length > 0) {
    modelSelect.value = models[0].id;
    selectedModelId = models[0].id;
    console.log(
      "[LLM Chat] Set selected model to first available:",
      models[0].id,
    );
  } else {
    selectedModelId = "";
    console.log("[LLM Chat] No models to select, selectedModelId is empty.");
  }
  modelSelect.onchange = function () {
    selectedModelId = this.value;
    console.log("[LLM Chat] Model changed to:", selectedModelId);
  };
}

/**
 * Renders the chat messages in the UI.
 */
function renderMessages() {
  // console.log( // Less verbose
  //   "[LLM Chat] Entering renderMessages function with messages array:",
  //   messages,
  // );
  const wrap = chatMessagesInnerDiv;
  if (!wrap) {
    console.error("[LLM Chat] chatMessagesInnerDiv not found.");
    return;
  }
  if (DEBUG)
    console.log(`[LLM Chat Render] Rendering ${messages.length} messages.`);
  wrap.innerHTML = "";
  if (messages.length === 0) {
    wrap.innerHTML =
      '<div class="msg system-info">Chat started. Ask a follow-up question...</div>';
    // console.log("[LLM Chat] No messages, added system-info message."); // Less verbose
  } else {
    messages.forEach((msg, index) => {
      // console.log(`[LLM Chat Render] Processing message ${index}:`, msg); // Less verbose
      const msgDiv = document.createElement("div");
      msgDiv.classList.add("msg");
      if (msg.role === "assistant") {
        msgDiv.classList.add("assistant");
        if (msg.model) {
          // Spec: Add model label for assistant messages.
          // Arguments: msg (object) - The message object.
          // Called from: renderMessages.
          // Creates a div with the model label and appends it to the message div.
          // Uses CSS class 'assistant-model-label'.
          // No return value.
          // Call site: Inside the messages.forEach loop for assistant messages.
          // Dependencies: DOM manipulation.
          // State changes: Appends a div to msgDiv.
          // Error handling: Logs error if chatMessagesInnerDiv is not found (handled at function start).
          // Side effects: Modifies the DOM.
          // Accessibility: Implicitly handled by the text content.
          // Performance: Minimal impact per message.


          const modelLabelDiv = document.createElement("div");
          modelLabelDiv.className = "assistant-model-label";
          modelLabelDiv.textContent = `Model: ${msg.model}`;
          msgDiv.appendChild(modelLabelDiv);
          // console.log( // Less verbose
          //   `[LLM Chat Render] Added model label for message ${index}:`,
          //   msg.model,
          // );
        }
        const contentSpan = document.createElement("span");
        contentSpan.className = "assistant-inner";
        if (Array.isArray(msg.content)) { // Spec: If content is already an array (initial summary), render as list.
             // console.log(`[LLM Chat Render] Rendering message ${index} as list (content is array).`); // Less verbose
             const listHtml = "<ul>" + msg.content.map(item => `<li>${item}</li>`).join("") + "</ul>";
             contentSpan.innerHTML = listHtml;
        } else if (typeof msg.content === "string") {
          // console.log( // Less verbose
          //   `[LLM Chat Render] Raw content for message ${index}:`,
          //   msg.content.substring(0, 200) +
          //     (msg.content.length > 200 ? "..." : ""),
          // );
          let processedContent = stripCodeFences(msg.content);
          // Spec: Strips code fences from the message content.
          // Arguments: msg.content (string) - The raw message content.
          // Called from: renderMessages.
          // Returns: string - The content with code fences removed.
          // Call site: Inside the messages.forEach loop for assistant messages.
          // Dependencies: stripCodeFences function.
          // State changes: None.
          // Error handling: Logs warning if input is not a string (handled in stripCodeFences).
          // Side effects: None.
          // Accessibility: N/A.
          // Performance: Simple string replacement.


          if (typeof processedContent !== "string") {
            console.warn(
              `[LLM Chat Render] Processed content is not a string for message ${index}:`,
              processedContent,
            );
            processedContent = "";
          }
          // console.log( // Less verbose
          //   `[LLM Chat Render] Processed content after stripping fences for message ${index}:`,
          //   processedContent.substring(0, 200) +
          //     (processedContent.length > 200 ? "..." : ""),
          // );
          // Attempt to extract and parse JSON array from the content
          let finalHtml = "";
          // Spec: Variable to hold the final HTML content for the message.
          // Arguments: None.
          // Called from: renderMessages.
          // Returns: N/A.
          // Call site: Inside the messages.forEach loop for assistant messages.
          // Dependencies: None.
          // State changes: Initialized as empty string.
          // Error handling: N/A.
          // Side effects: N/A.
          // Performance: N/A.


          let jsonParsed = false;
          try {
            const jsonResult = extractJsonFromContent(processedContent);
            if (jsonResult.jsonArray && Array.isArray(jsonResult.jsonArray)) {
              jsonParsed = true;
              // For subsequent assistant messages, render single-element arrays as plain text
              if (jsonResult.jsonArray.length === 1) {
                finalHtml = renderTextAsHtml(jsonResult.jsonArray[0]);
                if (jsonResult.beforeText || jsonResult.afterText) {
                  const beforeHtml = jsonResult.beforeText
                    ? renderTextAsHtml(jsonResult.beforeText)
                    : "";
                  const afterHtml = jsonResult.afterText
                    ? renderTextAsHtml(jsonResult.afterText)
                    : "";
                  finalHtml = `${beforeHtml}${finalHtml}${afterHtml}`;
                }
                // console.log( // Less verbose
                //   `[LLM Chat Render] Single-element array for message ${index} rendered as plain HTML.`,
                // );
              } else {
                // Multi-element arrays are rendered as lists
                const listHtml =
                  "<ul>" +
                  jsonResult.jsonArray
                    .map((item) => `<li>${item}</li>`)
                    .join("") +
                  "</ul>";
                if (jsonResult.beforeText || jsonResult.afterText) {
                  const beforeHtml = jsonResult.beforeText
                    ? renderTextAsHtml(jsonResult.beforeText)
                    : "";
                  const afterHtml = jsonResult.afterText
                    ? renderTextAsHtml(jsonResult.afterText)
                    : "";
                  finalHtml = `${beforeHtml}${listHtml}${afterHtml}`;
                } else {
                  finalHtml = listHtml;
                }
                // console.log( // Less verbose
                //   `[LLM Chat Render] Multi-element array for message ${index} rendered as list.`,
                // );
              }
            } else {
              // console.log( // Less verbose
              //   `[LLM Chat Render] No valid JSON array found in message ${index}. Falling back to text rendering.`,
              // );
            }
          } catch (jsonError) {
            console.error(
              `[LLM Chat Render] Error parsing JSON for message ${index}:`,
              jsonError,
            );
          }
          // If no JSON was parsed, render the content as text/markdown
          // Spec: Renders the processed content as HTML using marked or fallback.
          // Arguments: processedContent (string) - The content after stripping code fences.
          // Called from: renderMessages.
          // Returns: string - The rendered HTML.
          // Call site: Inside the messages.forEach loop for assistant messages, if JSON parsing failed.
          // Dependencies: renderTextAsHtml function.
          // State changes: None.
          // Error handling: Handled within renderTextAsHtml.
          // Side effects: None.
          // Accessibility: N/A.
          // Performance: Minimal impact per message.


          if (!jsonParsed) {
            finalHtml = renderTextAsHtml(processedContent);
          }
          contentSpan.innerHTML = finalHtml;
        } else {
          contentSpan.innerHTML = "[Error: Invalid message content]";
          // console.log( // Less verbose
          //   `[LLM Chat Render] Invalid content type for message ${index}.`,
          // );
        }
        msgDiv.appendChild(contentSpan);
        // Spec: Appends the content span to the message div.
        // Arguments: contentSpan (HTMLElement) - The span containing the message content.
        // Called from: renderMessages.
        // Returns: N/A.
        // Call site: Inside the messages.forEach loop for assistant messages.
        // Dependencies: DOM manipulation.
        // State changes: Appends contentSpan to msgDiv.
        // Error handling: N/A.
        // Side effects: Modifies the DOM.
        // Accessibility: N/A.
        // Performance: Minimal impact per message.


        wrap.appendChild(msgDiv);
        // console.log( // Less verbose
        //   `[LLM Chat Render] Appended assistant message ${index} to DOM.`,
        // );
      } else if (msg.role === "user") {
        msgDiv.classList.add("user");
        if (typeof marked !== "undefined") {
          // Spec: Parses user message content as Markdown using marked.
          // Arguments: msg.content (string) - The user message content.
          // Called from: renderMessages.
          // Returns: string - The rendered HTML.
          // Call site: Inside the messages.forEach loop for user messages, if marked is available.
          // Dependencies: marked library.
          // State changes: None.
          // Error handling: Logs error if marked parsing fails.
          // Side effects: None.
          // Accessibility: N/A.
          // Performance: Minimal impact per message.


          try {
            msgDiv.innerHTML = marked.parse(msg.content);
            // console.log( // Less verbose
            //   `[LLM Chat Render] Successfully parsed user message ${index} with marked.`,
            // );
          } catch (parseError) {
            console.error(
              `[LLM Chat Render] Marked parse error for user message ${index}:`,
              parseError,
            );
            msgDiv.innerHTML = msg.content.replace(/\n/g, "<br>");
          }
        } else {
          msgDiv.innerHTML = msg.content.replace(/\n/g, "<br>");
          // console.log( // Less verbose
          //   `[LLM Chat Render] Used fallback for user message ${index}.`,
          // );
        }
        // Spec: Appends the user message div to the chat messages wrapper.
        // Arguments: msgDiv (HTMLElement) - The div containing the user message.
        // Called from: renderMessages.
        // Returns: N/A.
        // Call site: Inside the messages.forEach loop for user messages.
        // Dependencies: DOM manipulation.
        // State changes: Appends msgDiv to wrap.
        // Error handling: N/A.
        // Side effects: Modifies the DOM.
        // Accessibility: N/A.
        // Performance: Minimal impact per message.


        wrap.appendChild(msgDiv);
        // console.log(`[LLM Chat Render] Appended user message ${index} to DOM.`); // Less verbose
      } else if (msg.role === "system") {
        // Render system messages (like "Translating...")
        msgDiv.classList.add("system-info");
        msgDiv.textContent = msg.content;
        wrap.appendChild(msgDiv);
        // Spec: Appends the system message div to the chat messages wrapper.
        // Arguments: msgDiv (HTMLElement) - The div containing the system message.
        // Called from: renderMessages.
        // Returns: N/A.
        // Call site: Inside the messages.forEach loop for system messages.
        // Dependencies: DOM manipulation.
        // State changes: Appends msgDiv to wrap.
        // Error handling: N/A.
        // Side effects: Modifies the DOM.
        // Accessibility: N/A.
        // Performance: Minimal impact per message.


      }
    });
  }
  scrollToBottom();
  // console.log( // Less verbose
  //   "[LLM Chat Render] Finished rendering messages. Scrolled to bottom.",
  // );
}

/**
 * Scrolls the chat messages to the bottom.
 */
function scrollToBottom() {
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
    // console.log("[LLM Chat] Scrolled to bottom of chat messages."); // Less verbose
  } else {
    console.warn("[LLM Chat] chatMessages element not found for scrolling.");
  }
}

/**
 * Focuses the chat input field.
 */
function focusInput() {
  if (chatInput) {
    chatInput.focus();
    // console.log("[LLM Chat] Input field focused."); // Less verbose
  } else {
    console.warn("[LLM Chat] chatInput element not found for focusing.");
  }
}

/**
 * Sets up stream listeners (currently a no-op implementation).
 */
function setupStreamListeners() {
  // console.log("[LLM Chat] Setting up stream listeners (no-op implementation)."); // Less verbose
}

/**
 * Sets up textarea resize functionality to adjust height based on content.
 */
function setupTextareaResize() {
  // console.log("[LLM Chat] Setting up textarea resize."); // Less verbose
  if (chatInput) {
    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height = chatInput.scrollHeight + "px";
    });
  }
}

/**
 * Handles downloading the chat as a Markdown file.
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
 * Handles copying the chat content as Markdown to the clipboard.
 */
function handleCopyMd() {
  console.log("[LLM Chat] Handling copy as Markdown.");
  const mdContent = formatChatAsMarkdown();
  navigator.clipboard
    .writeText(mdContent)
    .then(() => {
      showError("Chat copied to clipboard as Markdown.", false);
    })
    .catch((err) => {
      showError("Error copying to clipboard: " + err.message);
    });
}

/**
 * Handles downloading the chat as a JSON file.
 */
function handleDownloadJson() {
  console.log("[LLM Chat] Handling download as JSON.");
  const jsonContent = JSON.stringify(messages, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chat.json";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Handles stopping the current chat request.
 */
function handleStopRequest() {
  console.log("[LLM Chat] Stop request initiated.");
  if (streaming) {
    streaming = false;
    if (sendButton) sendButton.style.display = "block";
    if (stopButton) stopButton.style.display = "none";
    showError("Chat request stopped by user.", false);
    console.log("[LLM Chat] Chat request stopped.");
    // Attempt to abort the ongoing request if possible
    chrome.runtime.sendMessage({ action: "abortChatRequest" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[LLM Chat] Error sending abort request:",
          chrome.runtime.lastError,
        );
      } else if (response && response.status === "aborted") {
        console.log("[LLM Chat] Background confirmed request abort.");
      } else {
        console.log(
          "[LLM Chat] Background could not abort request or no active request.",
        );
      }
    });
  }
}

/**
 * Handles keydown events for Ctrl+Enter or Cmd+Enter to submit the form.
 * @param {Event} event - The keydown event.
 */
function handleChatInputKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    // console.log("[LLM Chat] Ctrl+Enter detected, submitting form."); // Less verbose
    if (chatForm) {
      chatForm.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  }
}

/**
 * Sets up the Ctrl+Enter listener for form submission.
 */
function setupCtrlEnterListener() {
  // console.log("[LLM Chat] Setting up Ctrl+Enter listener."); // Less verbose
  if (chatInput) {
    chatInput.addEventListener("keydown", handleChatInputKeydown);
  }
}

/**
 * Strips code fences from text content.
 * @param {string} text - The text to process.
 * @returns {string} - The processed text without code fences.
 */
function stripCodeFences(text) {
  // Spec: Removes markdown code fences (```) from a string.
  // Arguments: text (string) - The input string.
  // Called from: renderMessages.
  // Returns: string - The string with code fences removed.
  // Call site: Inside renderMessages for assistant messages.
  // Dependencies: None.
  // State changes: None.
  // Error handling: Logs a warning if the input is not a string (handled in stripCodeFences).
  // Side effects: None.
  // Accessibility: N/A.
  // Performance: Simple string replacement.


  if (typeof text !== "string") {
    console.warn("[LLM Chat] stripCodeFences received non-string input:", text);
    return "";
  }
  // Replace code fences with a placeholder to preserve content if needed
  const regex = /```[\s\S]*?```/g;
  return text
    .replace(regex, (match) => {
      // Extract content inside fences if it's JSON-like, otherwise remove
      const innerContent = match
        .replace(/```(?:\w*)\s*/, "")
        .replace(/\s*```/, "")
        .trim();
      if (innerContent.startsWith("[") && innerContent.endsWith("]")) {
        return innerContent; // Keep potential JSON content
      }
      return ""; // Remove non-JSON fenced content
    })
    .trim();
}

/**
 * Extracts JSON array from content and separates surrounding text.
 * @param {string} content - The content to process.
 * @returns {object} - An object with beforeText, jsonArray, and afterText.
 */
function extractJsonFromContent(content) {
  // Spec: Attempts to find and parse JSON arrays within a string, separating surrounding text.
  // Arguments: content (string) - The input string.
  // Called from: renderMessages.
  // Returns: object - { beforeText: string, jsonArray: array | null, afterText: string }.
  // Call site: Inside renderMessages for assistant messages with string content.
  // Dependencies: tryParseJson function.
  // State changes: None.
  // Error handling: Logs error if JSON parsing fails.
  // Side effects: None.
  // Accessibility: N/A.
  // Performance: String searching and parsing.


  if (typeof content !== "string") {
    return { beforeText: "", jsonArray: null, afterText: "" };
  }

  const jsonArrayRegex = /\[.*?\]/gs; // Find all occurrences of [...]
  let combinedJsonArray = [];
  let lastIndex = 0;
  let beforeText = "";
  let afterText = "";
  let foundJson = false;

  let match;
  while ((match = jsonArrayRegex.exec(content)) !== null) {
    const jsonString = match[0];
    const textBeforeMatch = content.substring(lastIndex, match.index).trim();

    // Append text before this match to beforeText if it's the first JSON found
    // or if there was text between JSON blocks.
    if (!foundJson) {
        beforeText += textBeforeMatch;
    } else {
        // If we found JSON before, any text between matches goes to afterText for now,
        // we'll consolidate later.
        afterText += textBeforeMatch;
    }


    try {
      const parsedArray = JSON.parse(jsonString);
      if (Array.isArray(parsedArray)) {
        // Flatten nested arrays of strings if necessary, or just take strings
        const stringArray = parsedArray.flatMap(item => {
            if (Array.isArray(item)) {
                // If it's a nested array, try to flatten it
                return item.map(subItem => String(subItem));
            }
            return String(item); // Ensure it's a string
        });
        combinedJsonArray = combinedJsonArray.concat(stringArray);
        foundJson = true; // Mark that we found at least one valid JSON array
        afterText = ""; // Clear afterText accumulated *before* this valid JSON
      } else {
        // If it's not a valid array, treat the match and preceding text as just text
        if (!foundJson) {
             beforeText += jsonString;
        } else {
             afterText += jsonString;
        }
      }
    } catch (e) {
      // If parsing fails, treat the match and preceding text as just text
       if (!foundJson) {
            beforeText += jsonString;
       } else {
            afterText += jsonString;
       }
      if (DEBUG) console.warn("[LLM Chat Render] Failed to parse potential JSON array:", jsonString, e);
    }

    lastIndex = jsonArrayRegex.lastIndex;
  }

  // Append any remaining text after the last match
  afterText += content.substring(lastIndex).trim();

  // Consolidate beforeText and afterText if no JSON was found
  if (!foundJson) {
      beforeText = content.trim();
      afterText = "";
  } else {
      // If JSON was found, consolidate any text collected in afterText
      // This handles cases like JSON followed by plain text.
      // We'll just append it to the end for simplicity.
      // The rendering logic will handle rendering beforeText, the list, and afterText.
  }


  return {
    beforeText: beforeText,
    jsonArray: foundJson ? combinedJsonArray : null,
    afterText: afterText,
  };
}

/**
 * Renders text content as HTML using marked if available, or as plain text with line breaks.
 * @param {string} text - The text to render.
 * @returns {string} - The rendered HTML.
 */
function renderTextAsHtml(text) {
  // Spec: Renders plain text or markdown as HTML.
  // Arguments: text (string) - The input text.
  // Called from: renderMessages.
  // Returns: string - The HTML representation of the text.
  // Call site: Inside renderMessages for assistant messages (if no JSON) and user messages.
  // Dependencies: marked library (optional).
  // State changes: None.
  // Error handling: Logs error if marked parsing fails.
  // Side effects: None.
  // Accessibility: N/A.
  // Performance: Markdown parsing or simple string replacement.


  if (typeof text !== "string" || !text.trim()) {
    return "";
  }
  if (typeof marked !== "undefined") {
    try {
      // Use marked.parse for markdown rendering
      return marked.parse(text, { sanitize: true });
    } catch (parseError) {
      console.error("[LLM Chat Render] Marked parse error:", parseError);
      // Fallback to simple line breaks if marked fails
      return text.replace(/\n/g, "<br>");
    }
  } else {
    // Fallback to simple line breaks if marked is not available
    return text.replace(/\n/g, "<br>");
  }
}

/**
 * Extracts text from JSON data.
 * @param {object} jsonData - The JSON data to extract text from.
 * @returns {string} - The extracted text.
 */
function extractTextFromJson(jsonData) {
  // Spec: Converts JSON data to a string representation.
  // Arguments: jsonData (object) - The input JSON data.
  // Called from: formatChatAsMarkdown (although currently unused there).
  // Returns: string - The stringified JSON.
  // Call site: Currently unused in the provided code.
  // Dependencies: JSON.stringify.
  // State changes: None.
  // Error handling: Returns empty string for invalid input.
  // Side effects: None.
  // Accessibility: N/A.
  // Performance: JSON stringification.


  if (!jsonData || typeof jsonData !== "object") return "";
  return JSON.stringify(jsonData);
}

/**
 * Shows or hides a loading indicator (currently a placeholder).
 * @param {boolean} show - Whether to show the loading indicator.
 */
function showLoadingIndicator(show) {
  // Spec: Placeholder function for showing/hiding a loading indicator.
  // Arguments: show (boolean) - True to show, false to hide.
  // Called from: sendChatRequestToBackground (implicitly, although not fully implemented).
  // Returns: N/A.
  // Call site: Intended to be called before/after LLM requests.
  // Dependencies: DOM manipulation (not fully implemented).
  // State changes: Intended to modify the display of a loading element.
  // Error handling: N/A.
  // Side effects: Intended to modify the DOM.
  // Accessibility: N/A.
  // Performance: Minimal.


  // console.log(`[LLM Chat] Loading indicator ${show ? "shown" : "hidden"}.`); // Less verbose
}

/**
 * Formats the chat messages as Markdown content.
 * @returns {string} - The formatted Markdown content.
 */
function formatChatAsMarkdown() {
  // Spec: Formats the chat messages array into a Markdown string.
  // Arguments: None.
  // Called from: handleDownloadMd, handleCopyMd.
  // Returns: string - The chat history formatted as Markdown.
  // Call site: Event listeners for download/copy buttons.
  // Dependencies: messages array.
  // State changes: None.
  // Error handling: N/A.
  // Side effects: None.
  // Accessibility: N/A.
  // Performance: Array mapping and joining.


  return messages
    .map(
      (msg) =>
        msg.role === "user"
          ? `**User:** ${msg.content}`
          : msg.role === "assistant"
            ? `**Assistant (${msg.model || "Unknown"}):** ${msg.content}` // Include model in MD
            : `**System:** ${msg.content}`, // Include system messages
    )
    .join("\n\n");
}

/**
 * Triggers a download of content with the specified filename and content type.
 * @param {string} content - The content to download.
 * @param {string} filename - The name of the file to download.
 * @param {string} contentType - The MIME type of the content.
 */
function triggerDownload(content, filename, contentType) {
  // Spec: Triggers a file download in the browser.
  // Arguments: content (string), filename (string), contentType (string).
  // Called from: handleDownloadMd, handleDownloadJson.
  // Returns: N/A.
  // Call site: Event listeners for download buttons.
  // Dependencies: Blob, URL, document.createElement.
  // State changes: None.
  // Error handling: N/A.
  // Side effects: Initiates a browser download.
  // Accessibility: N/A.
  // Performance: Minimal.


  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
