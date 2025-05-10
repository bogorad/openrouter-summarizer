console.log(`[LLM Content] Script Start (v3.0.21)`); // Updated version

// --- Module References (will be populated after dynamic import) ---
let Highlighter = null;
let FloatingIcon = null;
let SummaryPopup = null;
let constants = null;
let importedShowError = null; // Will be assigned from dynamic import
let renderTextAsHtml = null; // Will be assigned from dynamic import
// REMOVED: Direct import of showError and renderTextAsHtml
// import { showError, renderTextAsHtml } from "./utils.js"; // Import renderTextAsHtml and showError
// ...

// --- Global State ---
let DEBUG = false; // Debug logging state
let lastSummary = ""; // Raw or Cleaned/Combined summary string for chat context
let lastModelUsed = ""; // Model used for the last summary
let lastSelectedDomSnippet = null; // ADDED: New state variable to store the HTML snippet

// Queue for messages received before modules are fully initialized
let messageQueue = [];
let modulesInitialized = false; // Flag to indicate when modules are ready
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

// --- Core Processing Function ---
/**
 * Processes the currently selected element: gets its HTML and sends it to the LLM.
 */
function processSelectedElement() {
  // FIX: Check for importedShowError instead of showError directly
  if (!Highlighter || !SummaryPopup || !importedShowError) {
    console.error(
      "[LLM Content] processSelectedElement called before modules loaded!",
    );
    importedShowError("Error: Core components not loaded."); // Use importedShowError
    return;
  }

  const selectedElement = Highlighter.getSelectedElement();
  if (!selectedElement) {
    if (DEBUG)
      console.warn(
        "[LLM Content] processSelectedElement called but no element is selected.",
      );
    importedShowError("Error: No element selected to process."); // Use importedShowError
    return;
  }

  // Store the selected element's outerHTML for chat context
  lastSelectedDomSnippet = selectedElement.outerHTML;
  if (DEBUG)
    console.log(
      "[LLM Content] Stored selected element snippet for chat context:",
      lastSelectedDomSnippet.substring(0, 200) +
        (lastSelectedDomSnippet.length > 200 ? "..." : ""),
    );

  // Remove the highlight immediately after getting the snippet
  Highlighter.removeSelectionHighlight(); // This also triggers handleElementDeselected

  // Get the HTML content of the selected element
  const selectedHtml = selectedElement.outerHTML; // Or innerHTML depending on desired behavior

  if (!selectedHtml || selectedHtml.trim() === "") {
    if (DEBUG)
      console.warn(
        "[LLM Content] Selected element has no HTML content to summarize.",
      );
    importedShowError("Error: Selected element has no content."); // Use importedShowError
    return;
  }

  // Send the HTML to the background script for LLM processing with price validation
  sendToLLM(selectedHtml);
}

/**
 * Validates the cost of the request against the max price limit before sending to LLM.
 * @param {string} selectedHtml - The HTML content to be summarized.
 */
async function validateAndSendToLLM(selectedHtml) {
  if (!SummaryPopup) {
    console.error(
      "[LLM Content] validateAndSendToLLM called before SummaryPopup module loaded!",
    );
    return;
  }
  if (DEBUG)
    console.log("[LLM Request] Validating cost before sending summarization request.");

  const requestId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  lastSummary = "Thinking...";

  // Await the popup to be fully ready before proceeding
  try {
    // Pass null for originalMarkdownArray and pageURL initially
    await SummaryPopup.showPopup(
      "Thinking...",
      {
        onCopy: () => {}, // Provide a no-op function instead of null
        onChat: handlePopupChat,
        onClose: handlePopupClose,
        onOptions: handlePopupOptions,
      },
      null,
      null,
      false,
    );
    if (DEBUG) console.log("[LLM Content] Summary popup is now ready.");
  } catch (error) {
    console.error("[LLM Content] Error showing summary popup:", error);
    importedShowError("Error displaying summary popup.");
    FloatingIcon.removeFloatingIcon();
    Highlighter.removeSelectionHighlight();
    lastSummary = "";
    lastSelectedDomSnippet = null;
    return; // Stop if popup failed to show
  }

  SummaryPopup.enableChatButton(false);

  // Get settings including max request price and summary model
  chrome.runtime.sendMessage({ action: "getSettings" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      const errorMsg = `Error getting settings: ${chrome.runtime.lastError?.message || "No response"}`;
      importedShowError(errorMsg);
      if (DEBUG) console.log("[LLM Content] Setting error state to true for settings retrieval error.");
      SummaryPopup.updatePopupContent(errorMsg, null, null, true);
      FloatingIcon.removeFloatingIcon();
      Highlighter.removeSelectionHighlight();
      lastSummary = "";
      lastSelectedDomSnippet = null;
      return;
    }

    const maxRequestPrice = response.maxRequestPrice || DEFAULT_MAX_REQUEST_PRICE;
    const summaryModelId = response.summaryModelId || "";

    if (!summaryModelId) {
      const errorMsg = "Error: No summary model selected.";
      importedShowError(errorMsg);
      if (DEBUG) console.log("[LLM Content] Setting error state to true for no summary model selected.");
      SummaryPopup.updatePopupContent(errorMsg, null, null, true);
      FloatingIcon.removeFloatingIcon();
      Highlighter.removeSelectionHighlight();
      lastSummary = "";
      lastSelectedDomSnippet = null;
      return;
    }

    // Estimate token count based on content size and Unicode presence
    const contentSize = selectedHtml.length;
    const sampleSize = Math.min(1024, contentSize);
    const sampleContent = selectedHtml.substring(0, sampleSize);
    let unicodeMultiplier = 1.0;
    let unicodeCount = 0;
    for (let i = 0; i < sampleContent.length; i++) {
      if (sampleContent.charCodeAt(i) > 127) {
        unicodeCount++;
      }
    }
    const unicodeRatio = unicodeCount / sampleContent.length;
    if (unicodeRatio > 0.2) {
      unicodeMultiplier = 2.0; // Double the token estimate for Unicode-heavy content
      if (DEBUG) console.log(`[LLM Content] Unicode-heavy content detected (ratio: ${unicodeRatio.toFixed(2)}), applying multiplier: ${unicodeMultiplier}`);
    } else {
      if (DEBUG) console.log(`[LLM Content] ASCII-dominant content detected (ratio: ${unicodeRatio.toFixed(2)}), no multiplier applied.`);
    }

    // Approximate tokens per KB (from options.js TOKENS_PER_KB = 227.56)
    const tokensPerChar = 227.56 / 1024;
    const estimatedTokens = Math.ceil(contentSize * tokensPerChar * unicodeMultiplier);
    if (DEBUG) console.log(`[LLM Content] Estimated tokens for content: ${estimatedTokens} (size: ${contentSize} chars, multiplier: ${unicodeMultiplier})`);

    // Get pricing data for the summary model
    chrome.runtime.sendMessage({
      action: "getModelPricing",
      modelId: summaryModelId
    }, (priceResponse) => {
      if (chrome.runtime.lastError || !priceResponse || priceResponse.status !== "success") {
        const errorMsg = `Error fetching pricing data: ${chrome.runtime.lastError?.message || priceResponse?.message || "Unknown error"}`;
        importedShowError(errorMsg);
        if (DEBUG) console.log("[LLM Content] Setting error state to true for pricing data fetch error.");
        SummaryPopup.updatePopupContent(errorMsg, null, null, true);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = "";
        lastSelectedDomSnippet = null;
        return;
      }

      const pricePerToken = priceResponse.pricePerToken || 0;
      if (pricePerToken === 0) {
        if (DEBUG) console.log(`[LLM Content] Free model detected (${summaryModelId}), skipping cost validation.`);
        sendRequestToBackground(selectedHtml, requestId);
        return;
      }

      const estimatedCost = estimatedTokens * pricePerToken;
      if (DEBUG) console.log(`[LLM Content] Estimated cost: $${estimatedCost.toFixed(6)} (max allowed: $${maxRequestPrice.toFixed(3)})`);

      if (estimatedCost > maxRequestPrice) {
        const errorMsg = `Error: Request exceeds max price of $${maxRequestPrice.toFixed(3)}. Estimated cost: $${estimatedCost.toFixed(6)}. Reduce selection or increase limit in Options (accessible via extension icon > Options).`;
        importedShowError(errorMsg);
        SummaryPopup.updatePopupContent(errorMsg, null, null);
        SummaryPopup.enableChatButton(false);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = "";
        lastSelectedDomSnippet = null;
        return;
      }

      // If cost is within limit, proceed with the request
      sendRequestToBackground(selectedHtml, requestId);
    });
  });
}

/**
 * Sends the request to the background script for LLM processing.
 * @param {string} selectedHtml - The HTML content to be summarized.
 * @param {string} requestId - Unique ID for the request.
 */
function sendRequestToBackground(selectedHtml, requestId) {
  if (DEBUG)
    console.log("[LLM Request] Sending summarization request to background.");

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
        if (DEBUG) console.log("[LLM Content] Setting error state to true for sending request error.");
        SummaryPopup.updatePopupContent(errorMsg, null, null, true);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = "";
        lastSelectedDomSnippet = null;
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
        if (DEBUG) console.log("[LLM Content] Setting error state to true for background validation error.");
        SummaryPopup.updatePopupContent(errorMsg, null, null, true);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = "";
        lastSelectedDomSnippet = null;
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
        if (DEBUG) console.log("[LLM Content] Setting error state to true for unexpected response error.");
        SummaryPopup.updatePopupContent(errorMsg, null, null, true);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = "";
        lastSelectedDomSnippet = null;
      }
    },
  );
}

/**
 * Sends the selected HTML to the background script for LLM processing after validation.
 * @param {string} selectedHtml - The HTML content to be summarized.
 */
function sendToLLM(selectedHtml) {
  validateAndSendToLLM(selectedHtml);
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
  if (!SummaryPopup) return; // Check if module is loaded
  if (DEBUG) console.log("[LLM Content] handleElementDeselected called.");
  // When deselection occurs (via highlighter), hide the popup.
  SummaryPopup.hidePopup();
  // Clear state variables
  lastSummary = "";
  lastModelUsed = "";
  lastSelectedDomSnippet = null; // ADDED: Clear stored snippet on deselect
  // FloatingIcon.removeFloatingIcon(); // Removed - handled in handleIconClick/handleIconDismiss
}

function handleIconClick() {
  // Check if modules are loaded
  if (!Highlighter || !FloatingIcon || !SummaryPopup || !constants) return;

  if (DEBUG) console.log("[LLM Content] handleIconClick called.");

  // Remove the icon immediately as the action is initiated
  FloatingIcon.removeFloatingIcon();

  // Reset highlighter state (including altKeyDown)
  Highlighter.resetHighlightState();

  // Proceed with processing the selected element
  // The selection highlight will be removed *inside* processSelectedElement
  processSelectedElement();
}

function handleIconDismiss() {
  if (!Highlighter || !FloatingIcon || !SummaryPopup) return; // Check if modules are loaded
  if (DEBUG)
    console.log(
      "[LLM Content] handleIconDismiss called (Escape pressed on icon).",
    );
  // When the icon is dismissed (e.g., Escape key), deselect the element.
  // This will trigger handleElementDeselected which hides the popup and removes the icon.
  // We also need to reset the alt state here in case the user pressed Alt+Escape.
  Highlighter.resetHighlightState(); // Reset alt state
  Highlighter.removeSelectionHighlight(); // This triggers handleElementDeselected
  // FloatingIcon.removeFloatingIcon(); // This is now handled by handleElementDeselected
  // SummaryPopup.hidePopup(); // This is now handled by handleElementDeselected
  // Clear state variables
  lastSummary = "";
  lastModelUsed = "";
  lastSelectedDomSnippet = null; // ADDED: Clear stored snippet on dismiss
}

function handlePopupChat(targetLang = null) {
  if (DEBUG)
    console.log(
      `[LLM Content] handlePopupChat called. Target Language: ${targetLang}`,
    );
  // When the Chat button (or a flag) is clicked in the popup, open the chat context.
  // We no longer need to check for selectedElement here, as we'll use the stored snippet.
  openChatWithContext(targetLang); // Assume modules are loaded if popup exists
}

function handlePopupClose() {
  if (!SummaryPopup || !Highlighter || !FloatingIcon) return; // Check if modules are loaded
  if (DEBUG) console.log("[LLM Content] handlePopupClose called.");
  // When the Close button is clicked, hide the popup.
  SummaryPopup.hidePopup();
  Highlighter.removeSelectionHighlight(); // This will trigger handleElementDeselected
  FloatingIcon.removeFloatingIcon(); // Ensure icon is removed too
  // Clear state variables
  lastSummary = "";
  lastModelUsed = "";
  lastSelectedDomSnippet = null; // Clear stored snippet on close
}

function handlePopupOptions() {
  if (DEBUG) console.log("[LLM Content] handlePopupOptions called.");
  chrome.runtime.sendMessage({ action: "openOptionsPage" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[LLM Content] Error opening options page:", chrome.runtime.lastError);
      importedShowError("Error opening options page.");
    }
  });
  SummaryPopup.hidePopup();
  Highlighter.removeSelectionHighlight();
  FloatingIcon.removeFloatingIcon();
  lastSummary = "";
  lastSelectedDomSnippet = null;
}

// --- Chat Context Handling ---
function openChatWithContext(targetLang = "") {
  // REMOVED: Check for !Highlighter module loaded here, assume loaded if popup was shown.
  // REMOVED: Check for selectedElement being null.

  // Use the stored domSnippet instead of getting it from the element again
  const domSnippet = lastSelectedDomSnippet;

  // Check if we actually have a snippet to send
  if (!domSnippet || domSnippet.trim() === "") {
    importedShowError("Cannot open chat: No element content available."); // Use importedShowError
    if (DEBUG)
      console.warn(
        "[LLM Chat Context] Chat attempt failed: lastSelectedDomSnippet is null or empty.",
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
    importedShowError("Cannot open chat: No valid summary available."); // Use importedShowError
    if (DEBUG)
      console.warn(
        "[LLM Chat Context] Chat attempt failed: No valid summary found in lastSummary.",
        `lastSummary was: "${lastSummary}"`,
      );
    return;
  }

  const summaryForChat = lastSummary;

  const contextPayload = {
    domSnippet: domSnippet, // Use the stored snippet
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
          // Use importedShowError
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
            } else {
              if (DEBUG)
                console.log(
                  "[LLM Chat Context] Background ack openChatTab:",
                  openResponse,
                );
              // Successfully opened chat, now clean up the page interaction state
              if (SummaryPopup) SummaryPopup.hidePopup();
              // Highlight and icon removal are handled in handleIconClick/handlePopupClose
              lastSummary = "";
              lastModelUsed = "";
              lastSelectedDomSnippet = null; // ADDED: Clear stored snippet after successful chat open
            }
          },
        );
      } else {
        console.error(
          "[LLM Chat Context] Background did not confirm context storage:",
          response,
        );
        importedShowError("Failed to prepare chat context."); // Use importedShowError
      }
    },
  );
}


// --- Core Message Handling Logic ---
// Extracted from the listener to be reusable for queued messages
function handleMessage(req, sender, sendResponse) {
  if (DEBUG) console.log("[LLM Content] Handling message:", req.action);

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
      importedShowError("Error: No element selected. Use Alt+Click first."); // Use importedShowError
      // No need to await here, just show the error popup
      SummaryPopup.showPopup(
        "Error: No element selected. Use Alt+Click first.",
        { onCopy: () => {}, onChat: () => {}, onClose: SummaryPopup.hidePopup }, // Provide no-op for onCopy
        null,
        null, // Pass null for new params
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
    const pageURL = window.location.href; // Get current page URL

    if (req.error) {
      // Handle async error from background (e.g., fetch failed, or background validation)
      lastSummary = `Error: ${req.error}`; // Store error state
      importedShowError(`Error: ${req.error}`); // Use importedShowError
      SummaryPopup.updatePopupContent(`Error: ${req.error}`, null, pageURL); // Pass pageURL for potential copy of error + URL
      SummaryPopup.enableChatButton(false);
    } else if (req.summary && typeof req.summary === "string") {
      // Handle successful async summary response string
      const rawSummaryString = req.summary; // Keep original for potential raw display
      let combinedSummaryArray = [];
      let summaryHtml = "";

      try {
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
          summaryHtml =
            "<ul>" +
            combinedSummaryArray
              .map((item) => {
                const itemHtml = renderTextAsHtml(item);
                return `<li>${itemHtml}</li>`;
              })
              .join("") +
            "</ul>";
          lastSummary = JSON.stringify(combinedSummaryArray); // Store the structured data for chat
          SummaryPopup.updatePopupContent(
            summaryHtml,
            combinedSummaryArray,
            pageURL,
          );
          SummaryPopup.enableChatButton(true);
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
        console.error(
          `[LLM Content] Error processing summary string: ${e.message}`,
        );
        importedShowError(`Error processing summary: ${e.message}`);
        summaryHtml = rawSummaryString;
        SummaryPopup.updatePopupContent(
          summaryHtml +
            "<br><small>(Raw response shown due to parsing error)</small>",
          null, // No valid markdown array
          pageURL, // Still pass URL for potential copy
        );
        lastSummary = "Error: Could not parse summary response.";
        SummaryPopup.enableChatButton(false);
      }
    } else {
      lastSummary = "Error: No summary data received or invalid format.";
      importedShowError("Error: No summary data received or invalid format.");
      SummaryPopup.updatePopupContent(
        "Error: No summary data received or invalid format.",
        null, // No valid markdown array
        pageURL, // Still pass URL
      );
      SummaryPopup.enableChatButton(false);
    }

    return true; // Indicate message handled
  }
  return false; // Indicate message not handled by this listener
}

// --- Message Listener from Background ---
// Handles messages from the background script. Queues messages if modules are not ready.
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  // FIX: Check for importedShowError and renderTextAsHtml being loaded
  if (
    !modulesInitialized ||
    !SummaryPopup ||
    !importedShowError || // Check if importedShowError is loaded
    !Highlighter ||
    !renderTextAsHtml // Check if renderTextAsHtml is loaded
  ) {
    if (DEBUG) {
      console.warn(
        "[LLM Content] Message received before modules loaded, queuing:",
        req.action,
        "Queue size:",
        messageQueue.length + 1,
      );
    }
    messageQueue.push({ req, sender, sendResponse });
    return true;
  }

  return handleMessage(req, sender, sendResponse);
});

// --- Initialization Function ---
async function initialize() {
  try {
    const result = await chrome.storage.sync.get(["debug"]);
    DEBUG = !!result.debug;
    if (DEBUG) console.log("[LLM Content] Initial Debug mode:", DEBUG);

    let utilsModule;
    try {
      utilsModule = await import(chrome.runtime.getURL("./utils.js"));
      if (DEBUG) console.log("[LLM Content] utils.js loaded dynamically.");
    } catch (error) {
      console.error("[LLM Content] Failed to load utils.js:", error);
      const errorMsg =
        "Error loading utility functions. Some features may not work.";
      console.error(errorMsg, error);
      console.error(errorMsg);
    }
    const {
      showError: importedShowErrorFn,
      renderTextAsHtml: importedRenderTextAsHtmlFn,
    } = utilsModule || {};
    importedShowError = importedShowErrorFn || console.error;
    renderTextAsHtml = importedRenderTextAsHtmlFn;

    try {
      await import(chrome.runtime.getURL("./marked.min.js"));
      if (DEBUG) console.log("[LLM Content] marked.min.js loaded dynamically.");
      if (typeof marked === "undefined") {
        console.warn(
          "[LLM Content] marked.min.js loaded, but 'marked' is not defined globally.",
        );
      }
    } catch (error) {
      console.error("[LLM Content] Failed to load marked.min.js:", error);
      if (importedShowError) {
        importedShowError(
          "Error loading Markdown library. Markdown formatting may not work.",
        );
      } else {
        console.error(
          "Error loading Markdown library. Markdown formatting may not work.",
        );
      }
    }

    [Highlighter, FloatingIcon, SummaryPopup, constants] = await Promise.all([
      import(chrome.runtime.getURL("./highlighter.js")),
      import(chrome.runtime.getURL("./floatingIcon.js")),
      import(chrome.runtime.getURL("./summaryPopup.js")),
      import(chrome.runtime.getURL("./constants.js")),
    ]);
    if (DEBUG) console.log("[LLM Content] All modules loaded dynamically.");

    Highlighter.initializeHighlighter({
      onElementSelected: handleElementSelected,
      onElementDeselected: handleElementDeselected,
      initialDebugState: DEBUG,
    });
    FloatingIcon.initializeFloatingIcon({ initialDebugState: DEBUG });
    SummaryPopup.initializePopupManager({ initialDebugState: DEBUG });

    modulesInitialized = true;
    if (DEBUG)
      console.log("[LLM Content] Modules initialized flag set to true.");

    if (messageQueue.length > 0) {
      if (DEBUG)
        console.log(
          `[LLM Content] Processing ${messageQueue.length} queued messages.`,
        );
      while (messageQueue.length > 0) {
        const queuedMessage = messageQueue.shift();
        handleMessage(
          queuedMessage.req,
          queuedMessage.sender,
          queuedMessage.sendResponse,
        );
      }
      if (DEBUG)
        console.log("[LLM Content] Finished processing queued messages.");
    }

    console.log(`[LLM Content] Script Initialized. Modules ready.`);
  } catch (err) {
    console.error(
      "[LLM Content] CRITICAL: Failed to load modules dynamically or initialize.",
      err,
    );
    importedShowError(
      `Error: OpenRouter Summarizer failed to load components (${err.message}). Please try reloading the page or reinstalling the extension.`,
    );
  }
}

initialize();
