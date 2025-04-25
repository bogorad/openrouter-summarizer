// pageInteraction.js
console.log(`[LLM Content] Script Start (v3.0.5)`); // Updated version

// --- Module References (will be populated after dynamic import) ---
let Highlighter = null;
let FloatingIcon = null;
let SummaryPopup = null;
let constants = null;
let importedTryParseJson = null; // We might use this again in chat.js
let importedShowError = null;
// ...

// --- Global State ---
let DEBUG = false; // Debug logging state
let lastSummary = ""; // Raw or Cleaned/Combined summary string for chat context
let lastModelUsed = ""; // Model used for the last summary

let language_info = [];
// ...

// --- Prompt Assembly Function (Needs constants) ---
const numToWord = {
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
};

function getSystemPrompt(
  bulletCount,
  customFormatInstructions,
  preambleTemplate,
  postambleText,
  defaultFormatInstructions,
  targetLanguage,
) {
  // Ensure constants are loaded before calling this
  if (!constants) {
    console.error(
      "[LLM Content] getSystemPrompt called before constants loaded!",
    );
    return "Error: Constants not loaded.";
  }
  const {
    DEFAULT_PREAMBLE_TEMPLATE,
    DEFAULT_POSTAMBLE_TEXT,
    DEFAULT_FORMAT_INSTRUCTIONS,
    PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
    PROMPT_STORAGE_KEY_PREAMBLE,
    PROMPT_STORAGE_KEY_POSTAMBLE,
    PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
  } = constants;

  const bcNum = Number(bulletCount) || 5;
  const word = numToWord[bcNum] || "five";

  // Use provided values or fall back to defaults from constants
  const finalPreamble = (
    preambleTemplate?.trim() ? preambleTemplate : DEFAULT_PREAMBLE_TEMPLATE
  )
    .replace("${bulletWord}", word)
    .replace("US English", targetLanguage); // Use targetLanguage here
  // Use custom instructions from config, fallback to default instructions from config, fallback to hardcoded default
  const finalFormatInstructions = customFormatInstructions?.trim()
    ? customFormatInstructions
    : defaultFormatInstructions?.trim()
      ? defaultFormatInstructions
      : DEFAULT_FORMAT_INSTRUCTIONS;
  const finalPostamble = postambleText?.trim()
    ? postambleText
    : DEFAULT_POSTAMBLE_TEXT;

  return `${finalPreamble}\n${finalFormatInstructions}\n${finalPostamble}`;
}

// --- Callback Functions for Modules ---

function handleElementSelected(element, clickX, clickY) {
  if (!FloatingIcon) return; // Check if module is loaded
  if (DEBUG)
    console.log("[LLM Content] handleElementSelected called for:", element);
  // When an element is selected by the highlighter, create the floating icon.
  FloatingIcon.createFloatingIcon(
    clickX,
    clickY,
    handleIconClick,
    handleIconDismiss,
  );
}

function handleElementDeselected() {
  if (!FloatingIcon || !SummaryPopup) return; // Check if modules are loaded
  if (DEBUG) console.log("[LLM Content] handleElementDeselected called.");
  // When deselection occurs (via highlighter), remove the icon and hide the popup.
  FloatingIcon.removeFloatingIcon();
  SummaryPopup.hidePopup();
  // Clear summary state as well
  lastSummary = "";
  lastModelUsed = "";
}

function handleIconClick() {
  if (DEBUG) console.log("[LLM Content] handleIconClick called.");
  // When the floating icon is clicked, start the summarization process.
  processSelectedElement(); // Assume modules are loaded if icon exists
}

function handleIconDismiss() {
  if (!Highlighter || !SummaryPopup) return; // Check if modules are loaded
  if (DEBUG)
    console.log(
      "[LLM Content] handleIconDismiss called (Escape pressed on icon).",
    );
  // When the icon is dismissed (e.g., Escape key), deselect the element.
  Highlighter.removeSelectionHighlight(); // This will trigger handleElementDeselected via its internal logic if needed
  SummaryPopup.hidePopup();
  // Clear summary state as well
  lastSummary = "";
  lastModelUsed = "";
}

function handlePopupCopy() {
  // The copy logic is now internal to summaryPopup.js's handleCopyClick.
  if (DEBUG)
    console.log(
      "[LLM Content] handlePopupCopy triggered (logic inside summaryPopup).",
    );
}

function handlePopupChat(targetLang = null) {
  if (DEBUG)
    console.log(
      `[LLM Content] handlePopupChat called. Target Language: ${targetLang}`,
    );
  // When the Chat button (or a flag) is clicked in the popup, open the chat context.
  openChatWithContext(targetLang); // Assume modules are loaded if popup exists
}

function handlePopupClose() {
  if (!SummaryPopup || !Highlighter || !FloatingIcon) return; // Check if modules are loaded
  if (DEBUG) console.log("[LLM Content] handlePopupClose called.");
  // When the Close button is clicked, hide the popup.
  SummaryPopup.hidePopup();
  Highlighter.removeSelectionHighlight(); // This will trigger handleElementDeselected
  FloatingIcon.removeFloatingIcon(); // Ensure icon is removed too
  // Clear summary state as well
  lastSummary = "";
  lastModelUsed = "";
}

// --- Chat Context Handling ---
function openChatWithContext(targetLang = "") {
  if (!Highlighter) return; // Check module loaded
  const selectedElement = Highlighter.getSelectedElement();
  if (!selectedElement) {
    importedShowError("Cannot open chat: Original element selection lost.");
    if (DEBUG)
      console.warn(
        "[LLM Chat Context] Chat attempt failed: selectedElement is null.",
      );
    return;
  }
  // Use the raw lastSummary stored in this main script's state
  // Check if lastSummary is valid (not empty, not "Thinking...", not an error)
  if (
    !lastSummary ||
    lastSummary === "Thinking..." ||
    lastSummary.startsWith("Error:") ||
    lastSummary === "Error: Could not parse summary response." // Add check for parsing error
  ) {
    importedShowError("Cannot open chat: No valid summary available.");
    if (DEBUG)
      console.warn(
        "[LLM Chat Context] Chat attempt failed: No valid summary found in lastSummary.",
        `lastSummary was: "${lastSummary}"`,
      );
    return;
  }

  const domSnippet =
    selectedElement.outerHTML ||
    selectedElement.innerHTML ||
    selectedElement.textContent ||
    "";
  // Pass the potentially fixed (or error) summary string to context.
  const summaryForChat = lastSummary;

  const contextPayload = {
    domSnippet: domSnippet,
    summary: summaryForChat,
    chatTargetLanguage: targetLang,
    modelUsedForSummary: lastModelUsed, // Include the model used
  };

  if (DEBUG)
    console.log(
      "[LLM Chat Context] Preparing context payload for background:",
      contextPayload,
    );

  chrome.runtime.sendMessage(
    { action: "setChatContext", ...contextPayload },
    function (response) {
      if (chrome.runtime.lastError) {
        console.error(
          "[LLM Chat Context] Error sending context:",
          chrome.runtime.lastError,
        );
        importedShowError(
          `Error preparing chat: ${chrome.runtime.lastError.message}`,
        );
        return;
      }
      if (response && response.status === "ok") {
        if (DEBUG)
          console.log(
            "[LLM Chat Context] Background confirmed context storage. Requesting tab open.",
          );
        chrome.runtime.sendMessage(
          { action: "openChatTab" },
          (openResponse) => {
            if (chrome.runtime.lastError) {
              console.error(
                "[LLM Chat Context] Error requesting tab open:",
                chrome.runtime.lastError,
              } else {
              if (DEBUG)
                console.log(
                  "[LLM Chat Context] Background ack openChatTab:",
                  openResponse,
                );
              // Successfully opened chat, now clean up the page interaction state
              if (SummaryPopup) SummaryPopup.hidePopup();
              if (FloatingIcon) FloatingIcon.removeFloatingIcon();
              if (Highlighter) Highlighter.removeSelectionHighlight();
              lastSummary = "";
              lastModelUsed = ""; // Clear state after successful chat open
            }
          },
        );
      } else {
        console.error(
          "[LLM Chat Context] Background did not confirm context storage:",
          response,
        );
        importedShowError("Failed to prepare chat context.");
      }
    },
  );
}

// --- LLM Interaction (Delegated to background.js) ---
function sendToLLM(selectedHtml) {
  if (!SummaryPopup) {
    console.error(
      "[LLM Content] sendToLLM called before SummaryPopup module loaded!",
    );
    return;
  }
  if (DEBUG)
    console.log("[LLM Request] Sending summarization request to background.");

  const requestId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  lastSummary = "Thinking...";
  SummaryPopup.showPopup("Thinking...", {
    onCopy: handlePopupCopy,
    onChat: handlePopupChat,
    onClose: handlePopupClose,
  });
  SummaryPopup.enableChatButton(false);

  chrome.runtime.sendMessage(
    {
      action: "requestSummary",
      requestId: requestId,
      selectedHtml: selectedHtml,
    },
    (response) => {
      // This callback handles the *immediate* response from the background listener.
      // It's primarily used for initial validation errors from the background script.
      if (chrome.runtime.lastError) {
        // Error sending the initial request message
        console.error(
          "[LLM Content] Error sending summary request to background:",
          chrome.runtime.lastError,
        );
        const errorMsg = `Error sending request: ${chrome.runtime.lastError.message}`;
        importedShowError(errorMsg);
        SummaryPopup.updatePopupContent(errorMsg);
        SummaryPopup.enableChatButton(false);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = ""; // Clear state on send error
        return;
      }

      if (response && response.status === "error") {
        // Background validation failed before starting async fetch
        console.error(
          "[LLM Content] Received immediate error from background:",
          response.message,
        );
        const errorMsg = `Error: ${response.message || "Background validation failed."}`;
        importedShowError(errorMsg);
        SummaryPopup.updatePopupContent(errorMsg);
        SummaryPopup.enableChatButton(false);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = ""; // Clear state on validation error
      } else if (response && response.status === "processing") {
        // Correct path: Background acknowledged the request and will send result later via tabs.sendMessage
        if (DEBUG)
          console.log(
            "[LLM Content] Background acknowledged summary request processing.",
          );
        // No need for a timeout here, the summaryResult listener will handle the async response or lack thereof.
      } else {
        // Incorrect path: Background listener returned something unexpected immediately
        console.error(
          "[LLM Content] Unexpected immediate response from background:",
          response,
        );
        const errorMsg = "Error: Unexpected response from background.";
        importedShowError(errorMsg);
        SummaryPopup.updatePopupContent(errorMsg);
        SummaryPopup.enableChatButton(false);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = ""; // Clear state on unexpected response
      }
    },
  );
}

// --- Core Process Trigger ---
function processSelectedElement() {
  if (!Highlighter || !SummaryPopup || !FloatingIcon || !constants) {
    console.error(
      "[LLM Content] processSelectedElement called before modules loaded!",
    );
    return;
  }
  const currentSelectedElement = Highlighter.getSelectedElement();
  if (!currentSelectedElement) {
    console.error(
      "[LLM Content] processSelectedElement called but no element is selected!",
    );
    importedShowError("Error: No element selected. Use Alt+Click first.");
    SummaryPopup.showPopup(
      "Error: No element selected. Use Alt+Click first.",
      { onCopy: () => {}, onChat: () => {}, onClose: SummaryPopup.hidePopup },
    );
    SummaryPopup.enableChatButton(false);
    setTimeout(SummaryPopup.hidePopup, 3000);
    return;
  }
  if (DEBUG)
    console.log(
      "[LLM Content] processSelectedElement called for element:",
      currentSelectedElement,
    );

  // Get HTML content
  const htmlContent =
    currentSelectedElement.outerHTML ||
    currentSelectedElement.innerHTML ||
    currentSelectedElement.textContent ||
    "";
  if (!htmlContent.trim()) {
    importedShowError("Error: Selected element has no content.");
    SummaryPopup.showPopup("Error: Selected element has no content.", {
      onCopy: () => {},
      onChat: () => {},
      onClose: SummaryPopup.hidePopup,
    });
    SummaryPopup.enableChatButton(false);
    FloatingIcon.removeFloatingIcon();
    Highlighter.removeSelectionHighlight();
    return;
  }

  // Send the HTML content to background.js for summarization directly
  // The background script will handle validation (API key, model) and respond with either the summary or an error.
  sendToLLM(htmlContent);
}

// --- Message Listener from Background ---
// Handles the *asynchronous* summaryResult message sent via tabs.sendMessage
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (!Highlighter || !SummaryPopup) {
    console.warn(
      "[LLM Content] Message received before modules loaded, ignoring:",
      req.action,
    );
    sendResponse({
      status: "error",
      message: "Content script not fully initialized.",
    });
    return false;
  }

  if (DEBUG) console.log("[LLM Content] Received message:", req.action);

  if (req.action === "processSelection") {
    if (DEBUG) console.log("[LLM Content] Received processSelection command.");
    const currentSelectedElement = Highlighter.getSelectedElement();
    if (currentSelectedElement) {
      processSelectedElement();
      sendResponse({ status: "processing started" });
      return true;
    } else {
      console.warn(
        "[LLM Content] Received processSelection but no element is selected.",
      );
      importedShowError("Error: No element selected. Use Alt+Click first.");
      SummaryPopup.showPopup(
        "Error: No element selected. Use Alt+Click first.",
        { onCopy: () => {}, onChat: () => {}, onClose: SummaryPopup.hidePopup },
      );
      SummaryPopup.enableChatButton(false);
      setTimeout(SummaryPopup.hidePopup, 3000);
      sendResponse({ status: "no element selected" });
      return false;
    }
  } else if (req.action === "summaryResult") {
    // This part handles the async response correctly
    if (DEBUG)
      console.log(
        "[LLM Content] Received summary result from background:",
        req.requestId,
        "Raw Summary:",
        req.summary,
        "Full Response:",
        req.fullResponse,
      );

    lastModelUsed = req.model || "Unknown"; // Store model regardless of success/error

    if (req.error) {
      // Handle async error from background (e.g., fetch failed, or background validation)
      lastSummary = `Error: ${req.error}`; // Store error state
      importedShowError(`Error: ${req.error}`);
      SummaryPopup.updatePopupContent(`Error: ${req.error}`);
      SummaryPopup.enableChatButton(false);
    } else if (req.summary && typeof req.summary === "string") {
      // Handle successful async summary response string
      const rawSummaryString = req.summary; // Keep original for potential raw display
      let combinedSummaryArray = [];
      let summaryHtml = "";
      let parseSuccess = false;

      try {
        // Robust parsing logic (find all [...], parse, merge)
        const jsonArrayRegex = /\[.*?\]/gs;
        const matches = rawSummaryString.match(jsonArrayRegex);
        if (matches && matches.length > 0) {
          if (DEBUG)
            console.log(
              "[LLM Content] Found potential JSON array matches:",
              matches,
            );
          matches.forEach((match) => {
            try {
              const parsedArray = JSON.parse(match);
              if (Array.isArray(parsedArray)) {
                const stringArray = parsedArray.map((item) => String(item));
                combinedSummaryArray = combinedSummaryArray.concat(stringArray);
              } else {
                if (DEBUG)
                  console.warn(
                    "[LLM Content] Parsed match is not an array:",
                    parsedArray,
                  );
              }
            } catch (innerError) {
              if (DEBUG)
                console.warn(
                  "[LLM Content] Failed to parse individual JSON array match:",
                  match,
                  innerError,
                );
            }
          });
        } else {
          if (DEBUG)
            console.warn(
              "[LLM Content] No JSON array patterns found, attempting direct parse.",
            );
          const directParsed = JSON.parse(rawSummaryString);
          if (Array.isArray(directParsed)) {
            combinedSummaryArray = directParsed.map((item) => String(item));
          } else {
            throw new Error("Direct parse did not result in an array.");
          }
        }

        if (combinedSummaryArray.length > 0) {
          // --- SUCCESSFUL PARSE ---
          summaryHtml =
            "<ul>" +
            combinedSummaryArray.map((item) => `<li>${item}</li></li>`).join("") +
            "</ul>";
          // --- STORE FIXED JSON STRING ---
          lastSummary = JSON.stringify(combinedSummaryArray);
          // --- END STORE ---
          SummaryPopup.updatePopupContent(summaryHtml);
          SummaryPopup.enableChatButton(true);
          parseSuccess = true;
          if (DEBUG)
            console.log(
              "[LLM Content] Successfully processed summary. Stored valid JSON string for chat context:",
              lastSummary,
            );
        } else {
          throw new Error(
            "No valid JSON arrays found or parsed from summary string.",
          );
        }
      } catch (e) {
        // --- PARSE FAILED ---
        console.error(
          `[LLM Content] Error processing summary string: ${e.message}`,
        );
        importedShowError(`Error processing summary: ${e.message}`);
        summaryHtml = rawSummaryString; // Show raw string in popup
        SummaryPopup.updatePopupContent(
          summaryHtml +
            "<br><small>(Raw response shown due to parsing error)</small>",
        );
        // --- STORE ERROR STATE ---
        lastSummary = "Error: Could not parse summary response.";
        // --- END STORE ---
        SummaryPopup.enableChatButton(false); // Disable chat if parsing failed
      }
    } else {
      // Handle missing or invalid summary data in async response
      lastSummary = "Error: No summary data received or invalid format.";
      importedShowError("Error: No summary data received or invalid format.");
      SummaryPopup.updatePopupContent(
        "Error: No summary data received or invalid format.",
      );
      SummaryPopup.enableChatButton(false);
    }

    // Update flags regardless of parsing success/failure
    language_info = Array.isArray(req.language_info) ? req.language_info : [];
    if (DEBUG)
      console.log(
        "[LLM Content] Updating popup flags with language_info from response:",
        language_info,
      );
    SummaryPopup.updatePopupFlags(language_info); // This is a no-op now, but keep the call for clarity

    return true; // Indicate message handled
  }
  return false; // Indicate message not handled by this listener
});

// --- Initialization Function ---
async function initialize() {
  try {
    const result = await chrome.storage.sync.get(["debug"]);
    DEBUG = !!result.debug;
    if (DEBUG) console.log("[LLM Content] Initial Debug mode:", DEBUG);

    // Dynamically import utils.js
    let utilsModule;
    try {
      utilsModule = await import(chrome.runtime.getURL("./utils.js"));
      if (DEBUG) console.log("[LLM Content] utils.js loaded dynamically.");
    } catch (error) {
      console.error("[LLM Content] Failed to load utils.js:", error);
      const errorMsg =
        "Error loading utility functions. Some features may not work.";
      console.error(errorMsg, error);
      try {
        importedShowError(errorMsg);
      } catch {
        /* ignore */
      }
    }
    const {
      tryParseJson: importedTryParseJsonFn, // Assign here
      showError: importedShowErrorFn,
    } = utilsModule || {};
    importedTryParseJson = importedTryParseJsonFn; // Make available globally
    importedShowError = importedShowErrorFn || console.error;

    [Highlighter, FloatingIcon, SummaryPopup, constants] = await Promise.all([
      import(chrome.runtime.getURL("./highlighter.js")),
      import(chrome.runtime.getURL("./floatingIcon.js")),
      import(chrome.runtime.getURL("./summaryPopup.js")),
      import(chrome.runtime.getURL("./constants.js")),
    ]);
    if (DEBUG) console.log("[LLM Content] All modules loaded dynamically.");

    // Initialize modules with basic configuration
    Highlighter.initializeHighlighter({
      onElementSelected: handleElementSelected,
      onElementDeselected: handleElementDeselected,
      initialDebugState: DEBUG,
    });
    FloatingIcon.initializeFloatingIcon({ initialDebugState: DEBUG });
    SummaryPopup.initializePopupManager({ initialDebugState: DEBUG });

    console.log(`[LLM Content] Script Initialized. Modules ready.`);
  } catch (err) {
    console.error(
      "[LLM Content] CRITICAL: Failed to load modules dynamically or initialize.",
      err,
    );
    const errorDisplayFn = importedShowError || console.error;
    errorDisplayFn(
      `Error: OpenRouter Summarizer failed to load components (${err.message}). Please try reloading the page or reinstalling the extension.`,
    );
  }
}

// Start the initialization process
initialize();
