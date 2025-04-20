// chat.js
/**
 * chat.js
 * Short Spec: This file handles the chat interface for the OpenRouter Summarizer extension.
 * It manages chat messages, user input, model selection, and interactions with the background script.
 * Called from: chat.html (DOMContentLoaded event).
 * Dependencies: utils.js for tryParseJson and showError.
 */

const VER = "v2.30";

console.log(`[LLM Chat] Script Start (${VER})`);

// ==== GLOBAL STATE ====
import { tryParseJson, showError } from "./utils.js";
let models = [];
let selectedModelId = "";
let chatContext = { domSnippet: null, summary: null, chatTargetLanguage: null };
let messages = [];
let streaming = false;
let currentStreamMsgSpan = null;
let currentStreamRawContent = "";
let currentStreamModel = "";
let DEBUG = false; // Updated by getChatContext response
let chatMessagesInnerDiv = null;
let messageListenerAttached = false;
const SNIPPET_TRUNCATION_LIMIT = 65536;

// ==== DOM Element References ====
let downloadMdBtn,
  copyMdBtn,
  downloadJsonBtn,
  chatInput,
  modelSelect,
  chatForm,
  chatMessages,
  errorDisplay,
  sendButton;

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
  sendButton = chatForm
    ? chatForm.querySelector('button[type="submit"]')
    : null;

  if (
    !chatMessagesInnerDiv ||
    !downloadMdBtn ||
    !copyMdBtn ||
    !downloadJsonBtn ||
    !chatInput ||
    !modelSelect ||
    !chatForm ||
    !chatMessages ||
    !sendButton
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
    setupStreamListeners();
    setupTextareaResize();
    downloadMdBtn.addEventListener("click", handleDownloadMd);
    copyMdBtn.addEventListener("click", handleCopyMd);
    downloadJsonBtn.addEventListener("click", handleDownloadJson);
    setupCtrlEnterListener();
  } catch (error) {
    console.error("[LLM Chat] Error during initialization:", error);
    showError("Error initializing chat features. Some functions may not work.");
  }
});

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
      console.log("[LLM Chat] Debug mode enabled via background context.");
      console.log("[LLM Chat] Found essential UI elements.");
      if (typeof marked !== "undefined") {
        console.log("[LLM Chat] Marked library loaded and configured.");
      }
      console.log("[LLM Chat] Initializing chat page...");
      console.log(
        "[LLM Chat] Received context response from background:",
        response,
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
      populateModelDropdown(response.summaryModel);

      if (
        response.domSnippet &&
        response.summary !== undefined &&
        response.summary !== null
      ) {
        chatContext.domSnippet = response.domSnippet;
        chatContext.summary = response.summary;
        chatContext.chatTargetLanguage = response.chatTargetLanguage;

        if (DEBUG)
          console.log(
            "[LLM Chat] Context received. Summary assigned:",
            typeof chatContext.summary === "string"
              ? chatContext.summary.substring(0, 300) + "..."
              : chatContext.summary,
          );
        if (DEBUG)
          console.log(
            "[LLM Chat] Chat Target Language:",
            chatContext.chatTargetLanguage,
          );

        let initialContent;
        let parseError = false;
        console.log("[LLM Chat] Processing initial summary content...");
        if (
          typeof chatContext.summary === "string" &&
          chatContext.summary.trim()
        ) {
          const parsedInitialSummary = tryParseJson(chatContext.summary, true);
          console.log(
            "[LLM Chat] Parsed initial summary result:",
            parsedInitialSummary,
          );
          if (Array.isArray(parsedInitialSummary)) {
            initialContent = parsedInitialSummary
              .map((item) => String(item))
              .join("\n");
            console.log(
              "[LLM Chat] Initial content after mapping array:",
              initialContent,
            );
          } else {
            initialContent = chatContext.summary;
            parseError = true;
            console.log(
              "[LLM Chat] Parsing failed, using raw summary as initial content.",
            );
          }
        } else {
          initialContent = "(No initial summary provided)";
          parseError = true;
          console.log("[LLM Chat] Summary was not a string or was empty.");
        }
        messages = [
          {
            role: "assistant",
            content: initialContent,
            model: models.length > 0 ? models[0].id : "Unknown",
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
          console.log(
            "[LLM Chat] Parse error occurred, showing error message.",
          );
        }
        renderMessages();
        console.log(
          "[LLM Chat] RenderMessages called with messages:",
          messages,
        );
        if (chatContext.chatTargetLanguage?.trim()) {
          if (DEBUG)
            console.log(
              `[LLM Chat Init] Initial translation requested for: ${chatContext.chatTargetLanguage}. Sending prompt.`,
            );
          const initialPrompt = `Say that in ${chatContext.chatTargetLanguage} and let's continue our conversation in ${chatContext.chatTargetLanguage}.`;
          messages.push({ role: "user", content: initialPrompt });
          console.log("[LLM Chat] Added initial prompt to messages:", messages);
          renderMessages();
          sendChatRequestToBackground(initialPrompt);
        } else {
          if (DEBUG)
            console.log("[LLM Chat Init] No chatTargetLanguage specified.");
        }
      } else {
        console.warn(
          "[LLM Chat] Context received from background is incomplete.",
        );
        messages = [];
        console.log(
          "[LLM Chat] Messages array set to empty due to incomplete context.",
        );
        renderMessages();
        showError("Could not load initial summary context.", false);
      }
      focusInput();
      console.log("[LLM Chat] Input field focused.");
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
    console.log("[LLM Chat] Added option to dropdown:", model);
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
  console.log(
    "[LLM Chat] Entering renderMessages function with messages array:",
    messages,
  );
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
    console.log("[LLM Chat] No messages, added system-info message.");
  } else {
    messages.forEach((msg, index) => {
      console.log(`[LLM Chat Render] Processing message ${index}:`, msg);
      const msgDiv = document.createElement("div");
      msgDiv.classList.add("msg");
      if (msg.role === "assistant") {
        msgDiv.classList.add("assistant");
        if (msg.model) {
          const modelLabelDiv = document.createElement("div");
          modelLabelDiv.className = "assistant-model-label";
          modelLabelDiv.textContent = `Model: ${msg.model}`;
          msgDiv.appendChild(modelLabelDiv);
          console.log(
            `[LLM Chat Render] Added model label for message ${index}:`,
            msg.model,
          );
        }
        const contentSpan = document.createElement("span");
        contentSpan.className = "assistant-inner";
        if (typeof msg.content === "string") {
          console.log(
            `[LLM Chat Render] Raw content for message ${index}:`,
            msg.content.substring(0, 200) +
              (msg.content.length > 200 ? "..." : ""),
          );
          let processedContent = stripCodeFences(msg.content);
          if (typeof processedContent !== "string") {
            console.warn(
              `[LLM Chat Render] Processed content is not a string for message ${index}:`,
              processedContent,
            );
            processedContent = "";
          }
          console.log(
            `[LLM Chat Render] Processed content after stripping fences for message ${index}:`,
            processedContent.substring(0, 200) +
              (processedContent.length > 200 ? "..." : ""),
          );
          if (typeof marked !== "undefined") {
            try {
              contentSpan.innerHTML = marked.parse(processedContent, {
                sanitize: true,
              });
              console.log(
                `[LLM Chat Render] Successfully parsed content with marked for message ${index}. Resulting HTML:`,
                contentSpan.innerHTML.substring(0, 200) +
                  (contentSpan.innerHTML.length > 200 ? "..." : ""),
              );
            } catch (parseError) {
              console.error(
                `[LLM Chat Render] Marked parse error for message ${index}:`,
                parseError,
              );
              contentSpan.innerHTML = processedContent.replace(/\n/g, "<br>");
              console.log(
                `[LLM Chat Render] Fallback text for message ${index}:`,
                contentSpan.textContent.substring(0, 200) +
                  (contentSpan.textContent.length > 200 ? "..." : ""),
              );
            }
          } else {
            contentSpan.innerHTML = processedContent.replace(/\n/g, "<br>");
            console.log(
              `[LLM Chat Render] Used fallback rendering for message ${index} since marked is not available.`,
            );
          }
        } else {
          contentSpan.innerHTML = "[Error: Invalid message content]";
          console.log(
            `[LLM Chat Render] Invalid content type for message ${index}.`,
          );
        }
        msgDiv.appendChild(contentSpan);
        wrap.appendChild(msgDiv);
        console.log(
          `[LLM Chat Render] Appended assistant message ${index} to DOM.`,
        );
      } else if (msg.role === "user") {
        msgDiv.classList.add("user");
        if (typeof marked !== "undefined") {
          try {
            msgDiv.innerHTML = marked.parse(msg.content);
            console.log(
              `[LLM Chat Render] Successfully parsed user message ${index} with marked.`,
            );
          } catch (parseError) {
            console.error(
              `[LLM Chat Render] Marked parse error for user message ${index}:`,
              parseError,
            );
            msgDiv.innerHTML = msg.content.replace(/\n/g, "<br>");
          }
        } else {
          msgDiv.innerHTML = msg.content.replace(/\n/g, "<br>");
          console.log(
            `[LLM Chat Render] Used fallback for user message ${index}.`,
          );
        }
        wrap.appendChild(msgDiv);
        console.log(`[LLM Chat Render] Appended user message ${index} to DOM.`);
      }
    });
  }
  scrollToBottom();
  console.log(
    "[LLM Chat Render] Finished rendering messages. Scrolled to bottom.",
  );
}

/**
 * Scrolls the chat messages to the bottom.
 */
function scrollToBottom() {
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
    console.log("[LLM Chat] Scrolled to bottom of chat messages.");
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
    console.log("[LLM Chat] Input field focused.");
  } else {
    console.warn("[LLM Chat] chatInput element not found for focusing.");
  }
}

/**
 * Sends a chat request to the background script with the user's text.
 * @param {string} userText - The text input by the user.
 */
function sendChatRequestToBackground(userText) {
  console.log(
    "[LLM Chat] Entering sendChatRequestToBackground with userText:",
    userText,
  );
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
  console.log("[LLM Chat] Added model label to messages wrap.");
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
      content:
        "Be concise and factual. Format responses using Markdown where appropriate, but you can include simple HTML like <b> and <i>.",
    },
  ];
  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const isFirstUserTurn = userMessageCount === 1;
  console.log(
    "[LLM Chat] User message count:",
    userMessageCount,
    "Is first turn:",
    isFirstUserTurn,
  );
  if (
    isFirstUserTurn &&
    chatContext.domSnippet &&
    chatContext.summary !== undefined &&
    chatContext.summary !== null
  ) {
    apiMessages.push({
      role: "user",
      content: `Context - Original HTML Snippet:\n\`\`\`html\n${chatContext.domSnippet}\n\`\`\`\n\nInitial Summary:\n${chatContext.summary}`,
    });
    apiMessages.push({ role: "user", content: userText });
    console.log("[LLM Chat] Added context and user text for first turn.");
  } else {
    const recentHistory = messages
      .slice(0, messages.length - 1)
      .slice(1)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-10);
    console.log("[LLM Chat] Recent history:", recentHistory);
    if (chatContext.domSnippet) {
      let snippetForContext = chatContext.domSnippet;
      if (snippetForContext.length > SNIPPET_TRUNCATION_LIMIT) {
        snippetForContext =
          snippetForContext.substring(0, SNIPPET_TRUNCATION_LIMIT) +
          "[...truncated]";
        console.log("[LLM Chat] Snippet truncated for context.");
      }
      apiMessages.push({
        role: "user",
        content: `Context - Original HTML Snippet:\n\`\`\`html\n${snippetForContext}\n\`\`\``,
      });
    }
    apiMessages.push(...recentHistory);
    apiMessages.push({ role: "user", content: userText });
    console.log("[LLM Chat] Added recent history and user text.");
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
        return;
      }

      if (response.status === "success" && response.data) {
        console.log(
          "[LLM Chat] Received successful response from background:",
          response.data,
        );
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
    },
  );
}

/**
 * Handles form submission when the user sends a message.
 * @param {Event} e - The form submission event.
 */
function handleFormSubmit(e) {
  console.log("[LLM Chat] Form submit attempted.");
  e.preventDefault();
  if (streaming) {
    console.log("[LLM Chat] Streaming in progress, submit ignored.");
    return;
  }
  if (!chatInput) {
    console.error("[LLM Chat] Chat input element not found.");
    showError("Error: Chat input is missing.");
    return;
  }
  const text = chatInput.value.trim();
  if (!text) {
    console.log("[LLM Chat] Submit ignored: Input is empty.");
    return;
  }
  messages.push({ role: "user", content: text });
  console.log("[LLM Chat] Added user message to messages array:", messages);
  renderMessages();
  chatInput.value = "";
  chatInput.style.height = "40px";
  chatInput.focus();
  sendChatRequestToBackground(text);
  console.log("[LLM Chat] Message sent to background.");
}

/**
 * Sets up stream listeners (currently a no-op implementation).
 */
function setupStreamListeners() {
  console.log("[LLM Chat] Setting up stream listeners (no-op implementation).");
}

/**
 * Sets up textarea resize functionality to adjust height based on content.
 */
function setupTextareaResize() {
  console.log("[LLM Chat] Setting up textarea resize.");
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
 * Handles keydown events for Ctrl+Enter or Cmd+Enter to submit the form.
 * @param {Event} event - The keydown event.
 */
function handleChatInputKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    console.log("[LLM Chat] Ctrl+Enter detected, submitting form.");
    if (chatForm) {
      chatForm.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  }
}

/**
 * Sets up the Ctrl+Enter listener for form submission.
 */
function setupCtrlEnterListener() {
  console.log("[LLM Chat] Setting up Ctrl+Enter listener.");
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
  if (typeof text !== "string") {
    console.warn("[LLM Chat] stripCodeFences received non-string input:", text);
    return "";
  }
  const regex = /```[\s\S]*?```/g;
  return text.replace(regex, "").trim();
}

/**
 * Extracts text from JSON data.
 * @param {object} jsonData - The JSON data to extract text from.
 * @returns {string} - The extracted text.
 */
function extractTextFromJson(jsonData) {
  if (!jsonData || typeof jsonData !== "object") return "";
  return JSON.stringify(jsonData);
}

/**
 * Shows or hides a loading indicator (currently a placeholder).
 * @param {boolean} show - Whether to show the loading indicator.
 */
function showLoadingIndicator(show) {
  console.log(`[LLM Chat] Loading indicator ${show ? "shown" : "hidden"}.`);
}

/**
 * Formats the chat messages as Markdown content.
 * @returns {string} - The formatted Markdown content.
 */
function formatChatAsMarkdown() {
  return messages
    .map((msg) =>
      msg.role === "user"
        ? `**User:** ${msg.content}`
        : `**Assistant:** ${msg.content}`,
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
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
