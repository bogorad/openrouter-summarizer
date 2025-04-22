// chat.js
/**
 * chat.js
 * Short Spec: This file handles the chat interface for the OpenRouter Summarizer extension.
 * It manages chat messages, user input, model selection, and interactions with the background script.
 * Called from: chat.html (DOMContentLoaded event).
 * Dependencies: utils.js for tryParseJson and showError.
 */

console.log(`[LLM Chat] Script Start (v2.50.13)`); // Updated version

// ==== GLOBAL STATE ====
import { tryParseJson, showError } from "./utils.js";
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
const SNIPPET_TRUNCATION_LIMIT = 65536;
let modelUsedForSummary = ""; // Add global state variable

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
  stopButton;

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
    !stopButton
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
      // ... debug logs ...
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
      // --- MODIFICATION: Store the specific model used for summary ---
      modelUsedForSummary = response.modelUsedForSummary || "";
      if (DEBUG)
        console.log(
          "[LLM Chat] Model used for initial summary:",
          modelUsedForSummary,
        );
      // --- END MODIFICATION ---

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
        chatContext.chatTargetLanguage = response.chatTargetLanguage || "";

        // ... (rest of summary processing logic) ...

        let initialContent;
        let parseError = false;
        // ... (parsing logic remains the same) ...
        if (
          typeof chatContext.summary === "string" &&
          chatContext.summary.trim()
        ) {
          const parsedInitialSummary = tryParseJson(chatContext.summary, true);
          if (Array.isArray(parsedInitialSummary)) {
            initialContent = parsedInitialSummary
              .map((item) => String(item))
              .join("\n");
          } else {
            initialContent = chatContext.summary;
            parseError = true;
          }
        } else {
          initialContent = "(No initial summary provided)";
          parseError = true;
        }

        // --- MODIFICATION: Use modelUsedForSummary for initial message ---
        messages = [
          {
            role: "assistant",
            content: initialContent,
            model: modelUsedForSummary || "Unknown", // Use the specific model here
          },
        ];
        // --- END MODIFICATION ---

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

        // ... (rest of language handling logic) ...
        if (
          chatContext.chatTargetLanguage &&
          chatContext.chatTargetLanguage.trim()
        ) {
          if (DEBUG)
            console.log(
              `[LLM Chat Init] Initial translation requested for: ${chatContext.chatTargetLanguage}. Sending prompt.`,
            );
          const initialPrompt = `Say that in ${chatContext.chatTargetLanguage} and let's continue our conversation in that language.`;
          messages.push({ role: "user", content: initialPrompt });
          renderMessages(); // Render user prompt
          sendChatRequestToBackground(initialPrompt); // Send request
        } else {
          if (DEBUG)
            console.log(
              "[LLM Chat Init] No chatTargetLanguage specified or empty, displaying original summary only.",
            );
        }
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
        if (typeof msg.content === "string") {
          // console.log( // Less verbose
          //   `[LLM Chat Render] Raw content for message ${index}:`,
          //   msg.content.substring(0, 200) +
          //     (msg.content.length > 200 ? "..." : ""),
          // );
          let processedContent = stripCodeFences(msg.content);
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
          let jsonParsed = false;
          try {
            const jsonResult = extractJsonFromContent(processedContent);
            if (jsonResult.jsonArray && Array.isArray(jsonResult.jsonArray)) {
              jsonParsed = true;
              // Special processing for the initial summary (first assistant message)
              // Note: This is always rendered as a list for consistency with the summary popup,
              // even if it has only one element. This decision may be reconsidered in the future based on user feedback.
              if (
                index === 0 &&
                messages.length > 1 &&
                messages[0].role === "assistant"
              ) {
                const listHtml =
                  "<div><strong>Initial Summary:</strong></div>" +
                  "<ul>" +
                  jsonResult.jsonArray
                    .map((item) => `<li>${item}</li>`)
                    .join("") +
                  "</ul>";
                // Combine with any surrounding text if present
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
                //   `[LLM Chat Render] Initial summary (message ${index}) rendered as list for consistency.`,
                // );
              } else {
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
        wrap.appendChild(msgDiv);
        // console.log( // Less verbose
        //   `[LLM Chat Render] Appended assistant message ${index} to DOM.`,
        // );
      } else if (msg.role === "user") {
        msgDiv.classList.add("user");
        if (typeof marked !== "undefined") {
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
        wrap.appendChild(msgDiv);
        // console.log(`[LLM Chat Render] Appended user message ${index} to DOM.`); // Less verbose
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
      content: `
      Be concise and factual.
      Format responses using Markdown where appropriate, but you can include simple HTML like <b> and <p>.
      Return a single JSON array of strings, which will be treated as bullet points.
      If you feel no bullet points are needed, return an array with a single string element.
      Do not add any comments before or after the JSON array.
    `,
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
    apiMessages.push({
      role: "user",
      content: `Context - Original HTML Snippet:\n\`\`\`html\n${chatContext.domSnippet}\n\`\`\`\n\nInitial Summary:\n${chatContext.summary}`,
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
      apiMessages.push({
        role: "user",
        content: `Context - Original HTML Snippet:\n\`\`\`html\n${snippetForContext}\n\`\`\``,
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
 * Handles form submission when the user sends a message.
 * @param {Event} e - The form submission event.
 */
function handleFormSubmit(e) {
  // console.log("[LLM Chat] Form submit attempted."); // Less verbose
  e.preventDefault();
  if (errorDisplay) {
    errorDisplay.style.display = "none";
    errorDisplay.textContent = "";
    // console.log("[LLM Chat] Cleared previous error message on form submit."); // Less verbose
  }
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
    // console.log("[LLM Chat] Submit ignored: Input is empty."); // Less verbose
    return;
  }
  messages.push({ role: "user", content: text });
  // console.log("[LLM Chat] Added user message to messages array:", messages); // Less verbose
  renderMessages();
  chatInput.value = "";
  chatInput.style.height = "40px";
  chatInput.focus();
  sendChatRequestToBackground(text);
  // console.log("[LLM Chat] Message sent to background."); // Less verbose
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
  if (typeof content !== "string") {
    return { beforeText: "", jsonArray: null, afterText: "" };
  }
  // Look for JSON array start and end
  const startIndex = content.indexOf("[");
  if (startIndex === -1) {
    return { beforeText: content, jsonArray: null, afterText: "" };
  }
  let bracketBalance = 0;
  let endIndex = -1;
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === "[") {
      bracketBalance++;
    } else if (content[i] === "]") {
      bracketBalance--;
      if (bracketBalance === 0) {
        endIndex = i;
        break;
      }
    }
  }
  if (endIndex === -1) {
    return { beforeText: content, jsonArray: null, afterText: "" };
  }
  const jsonString = content.substring(startIndex, endIndex + 1);
  const beforeText = content.substring(0, startIndex).trim();
  const afterText = content.substring(endIndex + 1).trim();
  try {
    const jsonArray = JSON.parse(jsonString);
    if (Array.isArray(jsonArray)) {
      return { beforeText, jsonArray, afterText };
    } else {
      return { beforeText: content, jsonArray: null, afterText: "" };
    }
  } catch (e) {
    return { beforeText: content, jsonArray: null, afterText: "" };
  }
}

/**
 * Renders text content as HTML using marked if available, or as plain text with line breaks.
 * @param {string} text - The text to render.
 * @returns {string} - The rendered HTML.
 */
function renderTextAsHtml(text) {
  if (typeof text !== "string" || !text.trim()) {
    return "";
  }
  if (typeof marked !== "undefined") {
    try {
      return marked.parse(text, { sanitize: true });
    } catch (parseError) {
      console.error("[LLM Chat Render] Marked parse error:", parseError);
      return text.replace(/\n/g, "<br>");
    }
  } else {
    return text.replace(/\n/g, "<br>");
  }
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
  // console.log(`[LLM Chat] Loading indicator ${show ? "shown" : "hidden"}.`); // Less verbose
}

/**
 * Formats the chat messages as Markdown content.
 * @returns {string} - The formatted Markdown content.
 */
function formatChatAsMarkdown() {
  return messages
    .map(
      (msg) =>
        msg.role === "user"
          ? `**User:** ${msg.content}`
          : `**Assistant (${msg.model || "Unknown"}):** ${msg.content}`, // Include model in MD
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
