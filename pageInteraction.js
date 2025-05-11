// pageInteraction.js

console.log(`[LLM Content] Script Start (v3.0.22)`);

// --- Static Imports ---
// Webpack will bundle these and their dependencies.
import TurndownService from "turndown";
import {
  showError as importedShowError,
  renderTextAsHtml as importedRenderTextAsHtml,
} from "./utils.js";
import * as Highlighter from "./highlighter.js";
import * as FloatingIcon from "./floatingIcon.js";
import * as SummaryPopup from "./summaryPopup.js";
import * as constants from "./constants.js"; // Assuming constants.js exports values

// --- Module-level variables (assignments will happen in initialize) ---
// These are assigned from the static imports for convenience if you prefer this pattern,
// or you can use utils.showError, constants.DEFAULT_MAX_REQUEST_PRICE directly.
let showError = importedShowError; // Directly use the imported function
let renderTextAsHtml = importedRenderTextAsHtml; // Directly use the imported function

// --- Global State ---
let DEBUG = false;
let lastSummary = "";
let lastModelUsed = "";
let lastSelectedDomSnippet = null;
let lastProcessedMarkdown = null;

let messageQueue = [];
let modulesInitialized = false; // This flag is still useful to queue messages if initialization is async (e.g., fetching settings)

// --- Prompt Assembly Function (Placeholder - ensure constants is loaded if used here) ---
const numToWord = {
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
};

// --- Core Processing Function ---
function processSelectedElement() {
  // Modules are available due to static imports, check if they are defined (Webpack should ensure this)
  if (
    !Highlighter ||
    !Highlighter.getSelectedElement ||
    !SummaryPopup ||
    !SummaryPopup.showPopup || // Check for a key function
    !showError ||
    !TurndownService
  ) {
    const errorMsg =
      "Error: Core components (static imports) not properly loaded for processing.";
    console.error("[LLM Content]", errorMsg, {
      Highlighter,
      SummaryPopup,
      showError,
      TurndownService,
    });
    (showError || console.error)(errorMsg); // Use the showError from import
    return;
  }

  const selectedElement = Highlighter.getSelectedElement();
  if (!selectedElement) {
    if (DEBUG)
      console.warn(
        "[LLM Content] processSelectedElement called but no element is selected.",
      );
    showError("Error: No element selected to process.");
    return;
  }

  lastSelectedDomSnippet = selectedElement.outerHTML;
  if (DEBUG)
    console.log(
      "[LLM Content] Stored selected element snippet for chat context:",
      lastSelectedDomSnippet.substring(0, 200) +
        (lastSelectedDomSnippet.length > 200 ? "..." : ""),
    );

  Highlighter.removeSelectionHighlight();

  const selectedHtml = selectedElement.outerHTML;
  if (!selectedHtml || selectedHtml.trim() === "") {
    if (DEBUG)
      console.warn(
        "[LLM Content] Selected element has no HTML content to summarize.",
      );
    showError("Error: Selected element has no content.");
    return;
  }

  let processedMarkdown;
  try {
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    turndown.remove(["script", "style", "nav"]);
    processedMarkdown = turndown.turndown(selectedHtml);
    if (DEBUG)
      console.log(
        "[LLM Content] Successfully converted HTML to Markdown:",
        processedMarkdown.substring(0, 200) +
          (processedMarkdown.length > 200 ? "..." : ""),
      );
  } catch (error) {
    console.error("[LLM Content] Error converting HTML to Markdown:", error);
    showError("Error processing content for summarization.");
    return;
  }

  lastProcessedMarkdown = processedMarkdown;

  // Use constants directly from import if they are exported, e.g. constants.MIN_MARKDOWN_LENGTH
  const minMarkdownLength = constants.MIN_MARKDOWN_LENGTH || 50; // Assuming MIN_MARKDOWN_LENGTH is exported from constants.js
  if (!processedMarkdown || processedMarkdown.length < minMarkdownLength) {
    if (DEBUG)
      console.warn(
        "[LLM Content] Markdown output is empty or too short, falling back to raw HTML.",
        `Markdown length: ${processedMarkdown?.length || 0}`,
      );
    showError(
      "Warning: Content processing incomplete, using raw data.",
      false,
      3000,
    ); // Example: non-fatal, timed
    sendToLLM(selectedHtml);
  } else {
    sendToLLM(processedMarkdown);
  }
}

// --- Validate and Send to LLM ---
async function validateAndSendToLLM(content) {
  if (!SummaryPopup || !FloatingIcon || !Highlighter || !showError) {
    console.error(
      "[LLM Content] validateAndSendToLLM called before essential modules loaded!",
    );
    return;
  }
  if (DEBUG)
    console.log(
      "[LLM Request] Validating cost before sending summarization request.",
    );

  const requestId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  lastSummary = "Thinking...";

  try {
    await SummaryPopup.showPopup(
      "Thinking...",
      {
        onCopy: () => {},
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
    showError("Error displaying summary popup.");
    FloatingIcon.removeFloatingIcon();
    Highlighter.removeSelectionHighlight();
    lastSummary = "";
    lastSelectedDomSnippet = null;
    return;
  }

  SummaryPopup.enableChatButton(false);

  chrome.runtime.sendMessage({ action: "getSettings" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      const errorMsg = `Error getting settings: ${chrome.runtime.lastError?.message || "No response"}`;
      showError(errorMsg);
      SummaryPopup.updatePopupContent(errorMsg, null, null, true);
      FloatingIcon.removeFloatingIcon();
      Highlighter.removeSelectionHighlight();
      lastSummary = "";
      lastSelectedDomSnippet = null;
      return;
    }

    const maxRequestPrice =
      response.maxRequestPrice || constants.DEFAULT_MAX_REQUEST_PRICE || 0.01;
    const summaryModelId = response.summaryModelId || "";

    if (!summaryModelId) {
      const errorMsg = "Error: No summary model selected.";
      showError(errorMsg);
      SummaryPopup.updatePopupContent(errorMsg, null, null, true);
      FloatingIcon.removeFloatingIcon();
      Highlighter.removeSelectionHighlight();
      lastSummary = "";
      lastSelectedDomSnippet = null;
      return;
    }

    const contentSize = content.length;
    const tokensPerChar = constants.TOKENS_PER_CHAR || 227.56 / 1024;
    const estimatedTokens = Math.ceil(contentSize * tokensPerChar);
    if (DEBUG)
      console.log(
        `[LLM Content] Estimated tokens for content: ${estimatedTokens}`,
      );

    chrome.runtime.sendMessage(
      { action: "getModelPricing", modelId: summaryModelId },
      (priceResponse) => {
        if (
          chrome.runtime.lastError ||
          !priceResponse ||
          priceResponse.status !== "success"
        ) {
          const errorMsg = `Error fetching pricing data: ${chrome.runtime.lastError?.message || priceResponse?.message || "Unknown error"}`;
          showError(errorMsg);
          SummaryPopup.updatePopupContent(errorMsg, null, null, true);
          FloatingIcon.removeFloatingIcon();
          Highlighter.removeSelectionHighlight();
          lastSummary = "";
          lastSelectedDomSnippet = null;
          return;
        }

        const pricePerToken = priceResponse.pricePerToken || 0;
        if (pricePerToken === 0) {
          if (DEBUG)
            console.log(
              `[LLM Content] Free model detected (${summaryModelId}), skipping cost validation.`,
            );
          sendRequestToBackground(content, requestId);
          return;
        }

        const estimatedCost = estimatedTokens * pricePerToken;
        if (DEBUG)
          console.log(
            `[LLM Content] Estimated cost: $${estimatedCost.toFixed(6)} (max allowed: $${maxRequestPrice.toFixed(3)})`,
          );

        if (estimatedCost > maxRequestPrice) {
          const errorMsg = `Error: Request exceeds max price of $${maxRequestPrice.toFixed(3)}. Estimated cost: $${estimatedCost.toFixed(6)}.`;
          showError(errorMsg);
          SummaryPopup.updatePopupContent(errorMsg, null, null, true);
          FloatingIcon.removeFloatingIcon();
          Highlighter.removeSelectionHighlight();
          lastSummary = "";
          lastSelectedDomSnippet = null;
          return;
        }
        sendRequestToBackground(content, requestId);
      },
    );
  });
}

// --- Send Request to Background ---
function sendRequestToBackground(content, requestId) {
  if (DEBUG)
    console.log("[LLM Request] Sending summarization request to background.");
  chrome.runtime.sendMessage(
    { action: "requestSummary", requestId: requestId, selectedHtml: content },
    (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = `Error sending request: ${chrome.runtime.lastError.message}`;
        showError(errorMsg);
        if (SummaryPopup)
          SummaryPopup.updatePopupContent(errorMsg, null, null, true);
        if (FloatingIcon) FloatingIcon.removeFloatingIcon();
        if (Highlighter) Highlighter.removeSelectionHighlight();
        lastSummary = "";
        lastSelectedDomSnippet = null;
        return;
      }
      if (response && response.status === "error") {
        const errorMsg = `Error: ${response.message || "Background validation failed."}`;
        showError(errorMsg);
        if (SummaryPopup)
          SummaryPopup.updatePopupContent(errorMsg, null, null, true);
        if (FloatingIcon) FloatingIcon.removeFloatingIcon();
        if (Highlighter) Highlighter.removeSelectionHighlight();
        lastSummary = "";
        lastSelectedDomSnippet = null;
      } else if (response && response.status === "processing") {
        if (DEBUG)
          console.log(
            "[LLM Content] Background acknowledged summary request processing.",
          );
      } else {
        const errorMsg = "Error: Unexpected response from background.";
        showError(errorMsg);
        if (SummaryPopup)
          SummaryPopup.updatePopupContent(errorMsg, null, null, true);
        if (FloatingIcon) FloatingIcon.removeFloatingIcon();
        if (Highlighter) Highlighter.removeSelectionHighlight();
        lastSummary = "";
        lastSelectedDomSnippet = null;
      }
    },
  );
}

function sendToLLM(content) {
  validateAndSendToLLM(content);
}

// --- Callback Functions for Modules ---
function handleElementSelected(element, clickX, clickY) {
  if (!FloatingIcon || !FloatingIcon.createFloatingIcon) return;
  if (DEBUG)
    console.log("[LLM Content] handleElementSelected called for:", element);
  FloatingIcon.createFloatingIcon(
    clickX,
    clickY,
    handleIconClick,
    handleIconDismiss,
  );
}

function handleElementDeselected() {
  if (!SummaryPopup || !SummaryPopup.hidePopup) return;
  if (DEBUG) console.log("[LLM Content] handleElementDeselected called.");
  SummaryPopup.hidePopup();
  lastSummary = "";
  lastModelUsed = "";
  lastSelectedDomSnippet = null;
  lastProcessedMarkdown = null;
}

function handleIconClick() {
  if (!Highlighter || !FloatingIcon || !SummaryPopup || !constants) return;
  if (DEBUG) console.log("[LLM Content] handleIconClick called.");
  FloatingIcon.removeFloatingIcon();
  Highlighter.resetHighlightState();
  processSelectedElement();
}

function handleIconDismiss() {
  if (!Highlighter || !FloatingIcon || !SummaryPopup) return;
  if (DEBUG) console.log("[LLM Content] handleIconDismiss called.");
  Highlighter.resetHighlightState();
  Highlighter.removeSelectionHighlight();
  lastSummary = "";
  lastModelUsed = "";
  lastSelectedDomSnippet = null;
  lastProcessedMarkdown = null;
}

function handlePopupChat(targetLang = null) {
  if (DEBUG)
    console.log(
      `[LLM Content] handlePopupChat called. Target Language: ${targetLang}`,
    );
  openChatWithContext(targetLang);
}

function handlePopupClose() {
  if (!SummaryPopup || !Highlighter || !FloatingIcon) return;
  if (DEBUG) console.log("[LLM Content] handlePopupClose called.");
  SummaryPopup.hidePopup();
  Highlighter.removeSelectionHighlight();
  FloatingIcon.removeFloatingIcon();
  lastSummary = "";
  lastModelUsed = "";
  lastSelectedDomSnippet = null;
  lastProcessedMarkdown = null;
}

function handlePopupOptions() {
  if (DEBUG) console.log("[LLM Content] handlePopupOptions called.");
  chrome.runtime.sendMessage({ action: "openOptionsPage" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(
        "[LLM Content] Error opening options page:",
        chrome.runtime.lastError,
      );
      showError("Error opening options page.");
    }
  });
  if (SummaryPopup) SummaryPopup.hidePopup();
  if (Highlighter) Highlighter.removeSelectionHighlight();
  if (FloatingIcon) FloatingIcon.removeFloatingIcon();
  lastSummary = "";
  lastSelectedDomSnippet = null;
}

// --- Chat Context Handling ---
function openChatWithContext(targetLang = "") {
  const domSnippet = lastSelectedDomSnippet;
  const processedMarkdownContent = lastProcessedMarkdown;

  if (!domSnippet || domSnippet.trim() === "") {
    showError("Cannot open chat: No element content available.");
    if (DEBUG)
      console.warn(
        "[LLM Chat Context] Chat attempt failed: lastSelectedDomSnippet is null or empty.",
      );
    return;
  }
  if (
    !lastSummary ||
    lastSummary === "Thinking..." ||
    lastSummary.startsWith("Error:") ||
    lastSummary === "Error: Could not parse summary response."
  ) {
    showError("Cannot open chat: No valid summary available.");
    if (DEBUG)
      console.warn(
        "[LLM Chat Context] Chat attempt failed: No valid summary found in lastSummary.",
      );
    return;
  }

  const contextPayload = {
    domSnippet: domSnippet,
    summary: lastSummary,
    chatTargetLanguage: targetLang,
    modelUsedForSummary: lastModelUsed,
    processedMarkdown: processedMarkdownContent || "",
  };

  if (DEBUG)
    console.log(
      "[LLM Chat Context] Preparing context payload for background:",
      contextPayload,
    );

  chrome.runtime.sendMessage(
    { action: "setChatContext", ...contextPayload },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[LLM Chat Context] Error sending context:",
          chrome.runtime.lastError,
        );
        showError(`Error preparing chat: ${chrome.runtime.lastError.message}`);
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
              if (SummaryPopup) SummaryPopup.hidePopup();
              lastSummary = "";
              lastModelUsed = "";
              lastSelectedDomSnippet = null;
              lastProcessedMarkdown = null;
            }
          },
        );
      } else {
        console.error(
          "[LLM Chat Context] Background did not confirm context storage:",
          response,
        );
        showError("Failed to prepare chat context.");
      }
    },
  );
}

// --- Core Message Handling Logic ---
function handleMessage(req, sender, sendResponse) {
  if (DEBUG) console.log("[LLM Content] Handling message:", req.action);

  if (req.action === "processSelection") {
    if (DEBUG) console.log("[LLM Content] Received processSelection command.");
    const currentSelectedElement = Highlighter
      ? Highlighter.getSelectedElement()
      : null;
    if (currentSelectedElement) {
      processSelectedElement();
      sendResponse({ status: "processing started" });
      return true;
    } else {
      console.warn(
        "[LLM Content] Received processSelection but no element is selected.",
      );
      showError("Error: No element selected. Use Alt+Click first.");
      if (SummaryPopup) {
        SummaryPopup.showPopup(
          "Error: No element selected. Use Alt+Click first.",
          {
            onCopy: () => {},
            onChat: () => {},
            onClose: SummaryPopup.hidePopup,
          },
          null,
          null,
        );
        SummaryPopup.enableChatButton(false);
        setTimeout(SummaryPopup.hidePopup, 3000);
      }
      sendResponse({ status: "no element selected" });
      return false;
    }
  } else if (req.action === "summaryResult") {
    if (DEBUG)
      console.log(
        "[LLM Content] Received summary result from background:",
        req.requestId,
        "Raw Summary:",
        req.summary,
      );

    lastModelUsed = req.model || "Unknown";
    const pageURL = window.location.href;

    if (!SummaryPopup || !renderTextAsHtml) {
      console.error(
        "[LLM Content] SummaryPopup or renderTextAsHtml not available for summaryResult",
      );
      lastSummary = `Error: UI components not ready.`;
      return true;
    }

    if (req.error) {
      lastSummary = `Error: ${req.error}`;
      showError(`Error: ${req.error}`);
      SummaryPopup.updatePopupContent(
        `Error: ${req.error}`,
        null,
        pageURL,
        true,
      );
      SummaryPopup.enableChatButton(false);
    } else if (req.summary && typeof req.summary === "string") {
      const rawSummaryString = req.summary;
      let combinedSummaryArray = [];
      let summaryHtml = "";

      try {
        const parsed = JSON.parse(rawSummaryString);
        if (Array.isArray(parsed)) {
          combinedSummaryArray = parsed.map(String);
        } else {
          throw new Error("Parsed summary is not an array.");
        }

        if (combinedSummaryArray.length > 0) {
          summaryHtml =
            "<ul>" +
            combinedSummaryArray
              .map((item) => `<li>${renderTextAsHtml(item)}</li>`)
              .join("") +
            "</ul>";
          lastSummary = JSON.stringify(combinedSummaryArray);
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
          `[LLM Content] Error processing summary string: ${e.message}. Raw: ${rawSummaryString.substring(0, 100)}`,
        );
        showError(`Error processing summary: ${e.message}`);
        summaryHtml = renderTextAsHtml(rawSummaryString);
        SummaryPopup.updatePopupContent(
          summaryHtml +
            "<br><small>(Raw response shown due to parsing error)</small>",
          null,
          pageURL,
          true,
        );
        lastSummary = "Error: Could not parse summary response.";
        SummaryPopup.enableChatButton(false);
      }
    } else {
      lastSummary = "Error: No summary data received or invalid format.";
      showError("Error: No summary data received or invalid format.");
      SummaryPopup.updatePopupContent(
        "Error: No summary data received or invalid format.",
        null,
        pageURL,
        true,
      );
      SummaryPopup.enableChatButton(false);
    }
    return true;
  }
  return false;
}

// --- Message Listener from Background ---
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (!modulesInitialized) {
    // Check if core modules are ready from initialize()
    if (DEBUG)
      console.warn(
        "[LLM Content] Message received before modules initialized, queuing:",
        req.action,
        "Queue size:",
        messageQueue.length + 1,
      );
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

    // showError and renderTextAsHtml are available from static imports at the top.
    // No need to dynamically import utils.js here.

    // Handle marked.min.js (assuming it's loaded via manifest <script> tag)
    try {
      if (DEBUG)
        console.log(
          "[LLM Content] Checking for global 'marked' (should be pre-loaded via manifest).",
        );
      if (typeof marked === "undefined") {
        console.warn(
          "[LLM Content] Global 'marked' is not defined. Markdown rendering might be affected if utils.js relies on it solely.",
        );
        // If showError is available and marked is critical for renderTextAsHtml's primary path:
        if (
          showError &&
          renderTextAsHtml.toString().includes('typeof marked !== "undefined"')
        ) {
          // Heuristic check
          showError(
            "Warning: Markdown library (marked.js) not fully loaded. Some formatting may be basic.",
            false,
            7000,
          );
        }
      } else {
        if (DEBUG) console.log("[LLM Content] Global 'marked' is available.");
      }
    } catch (error) {
      console.error("[LLM Content] Error during marked.min.js check:", error);
      if (showError)
        showError(
          "Error with Markdown library. Formatting may not work.",
          false,
          7000,
        );
    }

    // TurndownService, Highlighter, FloatingIcon, SummaryPopup, constants are available from static imports.
    // No need for Promise.all([...]) to dynamically load them.

    // Perform checks to ensure static imports were successful (Webpack should handle this)
    if (typeof TurndownService === "undefined")
      throw new Error("TurndownService (static import) is undefined.");
    if (!Highlighter || typeof Highlighter.initializeHighlighter !== "function")
      throw new Error(
        "Highlighter module not correctly imported or initializeHighlighter is missing.",
      );
    if (
      !FloatingIcon ||
      typeof FloatingIcon.initializeFloatingIcon !== "function"
    )
      throw new Error(
        "FloatingIcon module not correctly imported or initializeFloatingIcon is missing.",
      );
    if (
      !SummaryPopup ||
      typeof SummaryPopup.initializePopupManager !== "function"
    )
      throw new Error(
        "SummaryPopup module not correctly imported or initializePopupManager is missing.",
      );
    if (!constants) throw new Error("constants module not correctly imported.");
    if (typeof showError !== "function")
      throw new Error("showError function not correctly imported from utils.");
    if (typeof renderTextAsHtml !== "function")
      throw new Error(
        "renderTextAsHtml function not correctly imported from utils.",
      );

    if (DEBUG)
      console.log(
        "[LLM Content] Statically imported modules appear to be available.",
      );

    // Initialize your modules
    Highlighter.initializeHighlighter({
      onElementSelected: handleElementSelected,
      onElementDeselected: handleElementDeselected,
      initialDebugState: DEBUG,
    });
    FloatingIcon.initializeFloatingIcon({ initialDebugState: DEBUG });
    SummaryPopup.initializePopupManager({ initialDebugState: DEBUG });

    modulesInitialized = true; // Set after all essential initializations
    if (DEBUG)
      console.log("[LLM Content] Modules initialized flag set to true.");

    // Process message queue if any
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
      "[LLM Content] CRITICAL: Failed to load/initialize components.",
      err,
    );
    // Use the showError from static import if available, otherwise console.error
    const logError = showError || console.error;
    logError(
      `Error: OpenRouter Summarizer failed to load components (${err.message}). Please try reloading the page or reinstalling the extension.`,
    );
    modulesInitialized = false; // Ensure this is false on critical failure
  }
}

// --- Start Initialization ---
initialize();
