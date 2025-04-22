// pageInteraction.js
console.log(`[LLM Content] Script Start (v2.50.10)`); // Updated version

// --- Module References (will be populated after dynamic import) ---
let Highlighter = null;
let FloatingIcon = null;
let SummaryPopup = null;
let constants = null;
let importedTryParseJson = null; // Keep for potential future use, but not for summary parsing now
let importedShowError = null;

// --- Global State Variables ---
let DEBUG = false; // Debug logging state
let lastSummary = ""; // Raw or Cleaned/Combined summary string for chat context
let lastModelUsed = ""; // Model used for the last summary

let language_info = [];

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
    .replace("US English", targetLanguage);
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
  // Pass the RAW summary string to context. Chat will handle parsing/display.
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
              );
              importedShowError(
                `Error opening chat tab: ${chrome.runtime.lastError.message}.`,
              );
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
  // Ensure SummaryPopup is loaded before proceeding
  if (!SummaryPopup) {
    console.error(
      "[LLM Content] sendToLLM called before SummaryPopup module loaded!",
    );
    return;
  }
  if (DEBUG)
    console.log("[LLM Request] Sending summarization request to background.");

  // Generate a unique request ID for tracking
  const requestId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  lastSummary = "Thinking...";
  // No need to set flags or language data here; it will come with the response
  SummaryPopup.showPopup("Thinking...", {
    onCopy: handlePopupCopy,
    onChat: handlePopupChat,
    onClose: handlePopupClose,
  });
  SummaryPopup.enableChatButton(false);

  // Send the request to background.js with the selected HTML and request ID
  // Language data will be included in the response, no separate fetch needed
  chrome.runtime.sendMessage(
    {
      action: "requestSummary",
      requestId: requestId,
      selectedHtml: selectedHtml,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[LLM Content] Error sending summary request to background:",
          chrome.runtime.lastError,
        );
        importedShowError(`Error: ${chrome.runtime.lastError.message}`);
        SummaryPopup.updatePopupContent(
          `Error: ${chrome.runtime.lastError.message}`,
        );
        SummaryPopup.enableChatButton(false);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = "";
        return;
      }

      if (response && response.status === "processing") {
        if (DEBUG)
          console.log(
            "[LLM Content] Background acknowledged summary request processing.",
          );
        // The background will send a separate message with the result including language data
      } else {
        console.error(
          "[LLM Content] Unexpected response from background:",
          response,
        );
        importedShowError("Error: Unexpected response from background.");
        SummaryPopup.updatePopupContent(
          "Error: Unexpected response from background.",
        );
        SummaryPopup.enableChatButton(false);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = "";
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
    return;
  }
  if (DEBUG)
    console.log(
      "[LLM Content] processSelectedElement called for element:",
      currentSelectedElement,
    );

  lastSummary = "Thinking...";
  SummaryPopup.showPopup("Thinking...", {
    onCopy: handlePopupCopy,
    onChat: handlePopupChat,
    onClose: handlePopupClose,
  });
  SummaryPopup.enableChatButton(false);

  // Step 1: Perform health-check before proceeding with summarization
  // This ensures configuration is valid before making an LLM request
  const healthCheckTimeout = 5000; // 5 seconds timeout
  let healthCheckTimedOut = false;
  const healthCheckTimer = setTimeout(() => {
    healthCheckTimedOut = true;
    const timeoutMsg =
      "Health check timed out. Please check your connection or extension settings.";
    if (DEBUG)
      console.log(
        "[LLM Content] Health check timed out after " +
          healthCheckTimeout +
          "ms.",
      );
    importedShowError(timeoutMsg);
    SummaryPopup.updatePopupContent(timeoutMsg);
    FloatingIcon.removeFloatingIcon();
    Highlighter.removeSelectionHighlight();
  }, healthCheckTimeout);

  chrome.runtime.sendMessage({ action: "healthCheck" }, (healthResponse) => {
    clearTimeout(healthCheckTimer); // Clear the timeout as soon as we get a response
    if (healthCheckTimedOut) {
      if (DEBUG)
        console.log(
          "[LLM Content] Health check response received after timeout, ignoring.",
        );
      return;
    }
    if (DEBUG)
      console.log("[LLM Content] Health check response:", healthResponse);
    if (chrome.runtime.lastError || healthResponse?.status === "error") {
      const errorMsg =
        healthResponse?.message ||
        chrome.runtime.lastError?.message ||
        "Unknown error during health check.";
      importedShowError(`Configuration Error: ${errorMsg}`);
      SummaryPopup.updatePopupContent(`Configuration Error: ${errorMsg}`);
      FloatingIcon.removeFloatingIcon();
      Highlighter.removeSelectionHighlight();
      return;
    }

    if (healthResponse?.status === "ok") {
      if (DEBUG)
        console.log(
          "[LLM Content] Health check passed, proceeding with summarization.",
        );
      // Step 2: Health check passed, proceed with sending HTML content to LLM
      try {
        const htmlContent =
          currentSelectedElement.outerHTML ||
          currentSelectedElement.innerHTML ||
          currentSelectedElement.textContent ||
          "";
        if (!htmlContent.trim()) {
          importedShowError("Error: Selected element has no content.");
          SummaryPopup.updatePopupContent(
            "Error: Selected element has no content.",
          );
          FloatingIcon.removeFloatingIcon();
          Highlighter.removeSelectionHighlight();
          return;
        }

        // Send the HTML content to background.js for summarization
        // Language data will be returned with the response, no need to fetch separately
        sendToLLM(htmlContent);
      } catch (error) {
        console.error("[LLM Content] Error processing selection:", error);
        importedShowError(
          `Error processing selection: ${error.message || "Unknown error"}`,
        );
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
      }
    } else {
      const unexpectedMsg = "Unexpected response from health check.";
      importedShowError(unexpectedMsg);
      SummaryPopup.updatePopupContent(unexpectedMsg);
      FloatingIcon.removeFloatingIcon();
      Highlighter.removeSelectionHighlight();
    }
  });
}

// --- Message Listener from Background ---
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
    // Handle context menu or toolbar icon click to process selection
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
        {
          onCopy: () => {},
          onChat: () => {},
          onClose: SummaryPopup.hidePopup,
        },
      );
      SummaryPopup.enableChatButton(false);
      setTimeout(SummaryPopup.hidePopup, 3000);
      sendResponse({ status: "no element selected" });
      return false;
    }
  } else if (req.action === "summaryResult") {
    // Handle the summary result from background.js, which includes language data
    if (DEBUG)
      console.log(
        "[LLM Content] Received summary result from background:",
        req.requestId,
        "Raw Summary:",
        req.summary, // Log raw summary
        "Full Response:",
        req.fullResponse,
      );

    if (req.error) {
      // If an error occurred, store it and display the error message
      lastSummary = `Error: ${req.error}`;
      lastModelUsed = req.model || "Unknown"; // Store model even on error if available
      importedShowError(`Error: ${req.error}`);
      SummaryPopup.updatePopupContent(`Error: ${req.error}`);
      SummaryPopup.enableChatButton(false);
    } else if (req.summary && typeof req.summary === "string") {
      // If a summary string is received, attempt to parse it robustly
      lastSummary = req.summary; // Store the raw summary string
      lastModelUsed = req.model || "Unknown"; // Store the model used

      let combinedSummaryArray = [];
      let summaryHtml = "";
      let parseSuccess = false;

      try {
        // Regex to find all [...] blocks, including nested ones (simplified approach)
        // Using 's' flag for dotall to match newlines within brackets
        const jsonArrayRegex = /\[.*?\]/gs;
        const matches = req.summary.match(jsonArrayRegex);

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
                // Ensure all items are strings before concatenating
                const stringArray = parsedArray.map((item) => String(item));
                combinedSummaryArray = combinedSummaryArray.concat(stringArray);
                if (DEBUG)
                  console.log(
                    "[LLM Content] Successfully parsed and concatenated array:",
                    stringArray,
                  );
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
              // Optionally try cleaning the match string further if needed
            }
          });
        } else {
          if (DEBUG)
            console.warn(
              "[LLM Content] No JSON array patterns found in summary string.",
            );
          // As a fallback, try parsing the whole string directly
          const directParsed = JSON.parse(req.summary);
          if (Array.isArray(directParsed)) {
            combinedSummaryArray = directParsed.map((item) => String(item));
            if (DEBUG)
              console.log(
                "[LLM Content] Successfully parsed entire summary string as array.",
              );
          } else {
            throw new Error("Direct parse did not result in an array.");
          }
        }

        // Check if we successfully extracted any points
        if (combinedSummaryArray.length > 0) {
          summaryHtml =
            "<ul>" +
            combinedSummaryArray.map((item) => `<li>${item}</li>`).join("") +
            "</ul>";
          SummaryPopup.updatePopupContent(summaryHtml);
          SummaryPopup.enableChatButton(true);
          parseSuccess = true;
          if (DEBUG)
            console.log(
              "[LLM Content] Successfully processed summary into combined array:",
              combinedSummaryArray,
            );
        } else {
          // No valid arrays found after trying all matches and direct parse
          throw new Error(
            "No valid JSON arrays found or parsed from summary string.",
          );
        }
      } catch (e) {
        // This catch block handles errors from the outer try or the final throw
        console.error(
          `[LLM Content] Error processing summary string: ${e.message}`,
        );
        importedShowError(`Error processing summary: ${e.message}`);
        // Fallback to displaying raw content if possible, mark as potentially invalid
        summaryHtml = req.summary; // Show the raw string
        SummaryPopup.updatePopupContent(
          summaryHtml +
            "<br><small>(Raw response shown due to parsing error)</small>",
        );
        // Still enable chat, as there might be usable text content in the raw summary
        SummaryPopup.enableChatButton(true);
        // Update lastSummary state to indicate parsing failure for chat context check
        lastSummary = "Error: Could not parse summary response.";
      }

      // Update popup flags regardless of parsing success/failure
      language_info = Array.isArray(req.language_info)
        ? req.language_info
        : (() => {
            console.error(
              "[LLM Content] language_info is not an array:",
              req.language_info,
            );
            return [];
          })();
      if (DEBUG)
        console.log(
          "[LLM Content] Updating popup flags with language_info from response:",
          language_info,
        );
      SummaryPopup.updatePopupFlags(language_info);
    } else {
      // If no summary data is received or it's not a string
      lastSummary = "Error: No summary data received or invalid format.";
      lastModelUsed = req.model || "Unknown";
      importedShowError("Error: No summary data received or invalid format.");
      SummaryPopup.updatePopupContent(
        "Error: No summary data received or invalid format.",
      );
      SummaryPopup.enableChatButton(false);
      // Update flags even if summary is missing/invalid
      language_info = Array.isArray(req.language_info) ? req.language_info : [];
      SummaryPopup.updatePopupFlags(language_info);
    }
    return true;
  }
  return false;
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
      tryParseJson: importedTryParseJsonFn,
      showError: importedShowErrorFn,
    } = utilsModule || {};
    importedTryParseJson = importedTryParseJsonFn;
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
    SummaryPopup.initializePopupManager({
      initialDebugState: DEBUG,
    });

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
