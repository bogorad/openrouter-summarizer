// pageInteraction.js

console.log(`[LLM Content] Script Start (v3.0.25 - Enhanced DOM Cleanup)`);

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
import * as JoplinManager from "./joplinManager.js"; // New: Import JoplinManager
import * as constants from "./constants.js"; // Assuming constants.js exports values
import { sanitizeHtml, sanitizeForSharing, quickCleanHtml } from "./js/htmlSanitizer.js";
import { ErrorHandler, ErrorSeverity, handleLastError } from "./js/errorHandler.js";

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
let joplinToken = null; // Store the actual Joplin token, not just its boolean presence

let messageQueue = [];
let modulesInitialized = false; // This flag is still useful to queue messages if initialization is async (e.g., fetching settings)

// Input validation limits to prevent DoS attacks
const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB limit
const MAX_NESTING_DEPTH = 100;
const MAX_ELEMENT_COUNT = 10000;
const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds

// --- Prompt Assembly Function (Placeholder - ensure constants is loaded if used here) ---
const numToWord = {
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
};

/**
 * Calculates the nesting depth of an element
 * @param {Element} element - DOM element to check
 * @param {number} currentDepth - Current depth in recursion
 * @returns {number} Maximum nesting depth
 */
const calculateNestingDepth = (element, currentDepth = 0) => {
  if (currentDepth > MAX_NESTING_DEPTH) return currentDepth;
  let maxDepth = currentDepth;
  for (const child of element.children) {
    maxDepth = Math.max(maxDepth, calculateNestingDepth(child, currentDepth + 1));
  }
  return maxDepth;
};

/**
 * Counts total elements in a DOM tree
 * @param {Element} element - Root element to count
 * @returns {number} Total element count
 */
const countElements = (element) => {
  let count = 1;
  for (const child of element.children) {
    count += countElements(child);
  }
  return count;
};

/**
 * Validates selected content meets size and complexity limits
 * @param {Element} element - Selected DOM element
 * @param {string} html - Element's outerHTML
 * @returns {object} Validation result {valid: boolean, error?: string}
 */
const validateContent = (element, html) => {
  // Check content size
  if (html.length > MAX_CONTENT_SIZE) {
    return {
      valid: false,
      error: `Error: Selected content exceeds maximum size of ${MAX_CONTENT_SIZE / 1024}KB. Please select a smaller section.`
    };
  }

  // Check nesting depth
  const nestingDepth = calculateNestingDepth(element);
  if (nestingDepth > MAX_NESTING_DEPTH) {
    return {
      valid: false,
      error: `Error: Selected content has excessive nesting depth (${nestingDepth}). Please select a simpler section.`
    };
  }

  // Check element count
  const elementCount = countElements(element);
  if (elementCount > MAX_ELEMENT_COUNT) {
    return {
      valid: false,
      error: `Error: Selected content contains too many elements (${elementCount}). Please select a smaller section.`
    };
  }

  return { valid: true };
};

// --- Helper: Detect if content contains common HTML tags ---
function containsCommonHtmlTags(input) {
  const str = typeof input === "string" ? input : "";
  // Quick check for common structural/inline tags
  const tagPattern = /<\s*(p|div|span|br|ul|ol|li|a|img|h[1-6]|pre|code|table|thead|tbody|tr|td|th|blockquote|strong|b|em|i|section|article|header|footer|nav|figure|figcaption|hr)\b/i;
  const hasTags = tagPattern.test(str);
  if (DEBUG) {
    console.log("[LLM Content] containsCommonHtmlTags:", { hasTags, sample: str.substring(0, 120) });
  }
  return hasTags;
}

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

  // Validate content before processing
  const validation = validateContent(selectedElement, selectedElement.outerHTML);
  if (!validation.valid) {
    showError(validation.error, true, 5000);
    Highlighter.removeSelectionHighlight(); // Clean up highlight
    return;
  }

  // Remove highlight FIRST to get clean content
  Highlighter.removeSelectionHighlight();

  // Capture the full outerHTML for sharing/context
  const rawHtml = selectedElement.outerHTML;
  lastSelectedDomSnippet = rawHtml;

  if (!rawHtml || rawHtml.trim() === "") {
    if (DEBUG)
      console.warn(
        "[LLM Content] Selected element has no HTML content to summarize.",
      );
    showError("Error: Selected element has no content.");
    return;
  }

  // For processing, use the INNER content only
  const contentToProcess = selectedElement.innerHTML;

  // Apply sanitization to the inner content that we will process
  const sanitizedContent = sanitizeHtml(contentToProcess, { debug: DEBUG });

  if (DEBUG) {
    console.log(
      "[LLM Content] HTML sanitization complete - Original Inner HTML:",
      contentToProcess.length,
      "chars, Sanitized Inner HTML:",
      sanitizedContent.length,
      "chars"
    );
    console.log("[LLM Content] Checking for HTML tags in:", sanitizedContent.substring(0, 100));
  }

  // If the sanitized INNER content does NOT contain common HTML tags, treat as plain text and skip Markdown conversion
  if (!containsCommonHtmlTags(sanitizedContent)) {
    if (DEBUG) {
      console.log("[LLM Content] Detected plain text snippet. Skipping HTML→Markdown conversion and sending raw text.");
    }
    lastProcessedMarkdown = sanitizedContent; // The text is already clean
    sendToLLM(lastProcessedMarkdown);
    return;
  }

  let processedMarkdown;
  try {
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });

    // Enhanced cleanup for remaining unwanted elements
    turndown.remove(["script", "style", "nav", "aside", "footer", "header", "form"]);

    // Add custom rule to remove empty divs and spans
    turndown.addRule('removeEmptyElements', {
      filter: function (node) {
        return (node.nodeName === 'DIV' || node.nodeName === 'SPAN') &&
               !node.textContent.trim() &&
               !node.querySelector('img, video, audio, iframe');
      },
      replacement: function () {
        return '';
      }
    });

    processedMarkdown = turndown.turndown(sanitizedContent);
    if (DEBUG)
      console.log(
        "[LLM Content] Successfully converted HTML to Markdown:",
        processedMarkdown.substring(0, 200) +
          (processedMarkdown.length > 200 ? "..." : ""),
      );
    if (DEBUG) {
      console.log(
        "[LLM Content] Conversion Details - Sanitized Inner HTML Length: " +
          sanitizedContent.length +
          ", Markdown Length: " +
          processedMarkdown.length,
      );
      //console.log("[LLM Content] Full Markdown Content:", processedMarkdown);
    }
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
    // Fallback to sending the original outerHTML snippet
    sendToLLM(rawHtml);
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
  const pageTitle = document.title; // ADDED: Get page title

  try {
    await SummaryPopup.showPopup(
      "Thinking...",
      {
        onCopy: () => {},
        onChat: handlePopupChat,
        onClose: handlePopupClose,
        onOptions: handlePopupOptions,
        onNewsblur: handlePopupNewsblur, // New: Add NewsBlur callback
      },
      null, // parsedSummary - this will be set when updatePopupContent is called
      null, // pageURL - this will be set when updatePopupContent is called
      pageTitle, // ADDED: Pass pageTitle
      false, // errorState - not an error yet
      false, // hasNewsblurToken - assume false until settings are retrieved later on updatePopupContent
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

  SummaryPopup.enableButtons(false);

  chrome.runtime.sendMessage({ action: "getSettings" }, (response) => {
    if (handleLastError("getSettings", DEBUG) || !response) {
      const errorMsg = `Error getting settings: ${chrome.runtime.lastError?.message || "No response"}`;
      ErrorHandler.handle(new Error(errorMsg), "validateAndSendToLLM", ErrorSeverity.WARNING, true);
      SummaryPopup.updatePopupContent(
        errorMsg,
        null,
        null,
        pageTitle,
        true,
        false,
      ); // MODIFIED: Pass pageTitle
      FloatingIcon.removeFloatingIcon();
      Highlighter.removeSelectionHighlight();
      lastSummary = "";
      lastSelectedDomSnippet = null;
      return;
    }

    if (DEBUG) {
      const logResponse = { ...response };
      if (logResponse.apiKey) {
        logResponse.apiKey = "[Hidden]";
      }
      if (logResponse.newsblurToken) {
        logResponse.newsblurToken = "[Hidden]";
      }
      console.log("[LLM Content] getSettings response received:", logResponse);
    }
    //   console.log("[LLM Content] getSettings response received:", response);
    // }
    const maxRequestPrice =
      response.maxRequestPrice || constants.DEFAULT_MAX_REQUEST_PRICE || 0.01;
    const summaryModelId = response.summaryModelId || "";
    // Retrieve NewsBlur token status from settings to pass to updatePopupContent
    const hasNewsblurToken = !!response.newsblurToken;

    if (!summaryModelId) {
      const errorMsg = "Error: No summary model selected.";
      showError(errorMsg);
      if (DEBUG) {
        console.error(
          "[LLM Content] Critical: summaryModelId is empty after getSettings",
        );
      }
      SummaryPopup.updatePopupContent(
        errorMsg,
        null,
        null,
        pageTitle,
        true,
        false,
      ); // MODIFIED: Pass pageTitle
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
          handleLastError("getModelPricing", DEBUG) ||
          !priceResponse ||
          priceResponse.status !== "success"
        ) {
          const errorMsg = `Error fetching pricing data: ${chrome.runtime.lastError?.message || priceResponse?.message || "Unknown error"}`;
          ErrorHandler.handle(new Error(errorMsg), "validateAndSendToLLM", ErrorSeverity.WARNING, true);
          SummaryPopup.updatePopupContent(
            errorMsg,
            null,
            null,
            pageTitle,
            true,
            hasNewsblurToken,
          ); // MODIFIED: Pass pageTitle
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
          sendRequestToBackground(content, requestId, hasNewsblurToken);
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
          SummaryPopup.updatePopupContent(
            errorMsg,
            null,
            null,
            pageTitle,
            true,
            hasNewsblurToken,
          ); // MODIFIED: Pass pageTitle
          FloatingIcon.removeFloatingIcon();
          Highlighter.removeSelectionHighlight();
          lastSummary = "";
          lastSelectedDomSnippet = null;
          return;
        }
        sendRequestToBackground(content, requestId, hasNewsblurToken);
      },
    );
  });
}

// --- Send Request to Background ---
function sendRequestToBackground(content, requestId, hasNewsblurTokenStatus) {
  // Added hasNewsblurTokenStatus parameter
  if (DEBUG)
    console.log("[LLM Request] Sending summarization request to background.");
  chrome.runtime.sendMessage(
    {
      action: "requestSummary",
      requestId: requestId,
      selectedHtml: content,
      hasNewsblurToken: hasNewsblurTokenStatus,
    }, // Pass the token status
    (response) => {
      if (handleLastError("requestSummary", DEBUG)) {
        const errorMsg = `Error sending request: ${chrome.runtime.lastError.message}`;
        ErrorHandler.handle(new Error(errorMsg), "sendRequestToBackground", ErrorSeverity.WARNING, true);
        if (SummaryPopup)
          SummaryPopup.updatePopupContent(
            errorMsg,
            null,
            null,
            true,
            hasNewsblurTokenStatus,
          ); // Pass token status
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
          SummaryPopup.updatePopupContent(
            errorMsg,
            null,
            null,
            true,
            hasNewsblurTokenStatus,
          ); // Pass token status
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
          SummaryPopup.updatePopupContent(
            errorMsg,
            null,
            null,
            true,
            hasNewsblurTokenStatus,
          ); // Pass token status
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
    handleJoplinIconClick, // Pass a handler for the Joplin icon
    !!joplinToken, // Pass the boolean indicating if Joplin token is set
    handleCopyHtmlIconClick, // Pass a handler for the Copy HTML icon
    true, // Always show the Copy HTML icon
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

// New handler function for the Copy HTML icon click
async function handleCopyHtmlIconClick() {
  if (DEBUG) console.log("[LLM Content] handleCopyHtmlIconClick called.");

  // Get the currently selected element
  const selectedElement = Highlighter.getSelectedElement();
  if (!selectedElement) {
    showError("No element selected to copy.", false, 2000);
    if (DEBUG) console.error("[LLM Content] No element selected for HTML copy.");
    return;
  }

  try {
    // Get the full HTML of the selected element
    const rawHtml = selectedElement.outerHTML;

    // Sanitize the HTML before copying
    const sanitizedHtml = sanitizeHtml(rawHtml, { debug: DEBUG });

    if (!sanitizedHtml || sanitizedHtml.trim() === "") {
      showError("Element HTML became empty after cleaning.", false, 2000);
      if (DEBUG) console.error("[LLM Content] HTML sanitization resulted in empty content.");
      return;
    }

    // Copy to clipboard with both HTML and plain text formats
    const textContent = selectedElement.textContent || selectedElement.innerText || "";
    const htmlBlob = new Blob([sanitizedHtml], { type: "text/html" });
    const textBlob = new Blob([textContent], { type: "text/plain" });

    const clipboardItem = new ClipboardItem({
      "text/html": htmlBlob,
      "text/plain": textBlob,
    });

    await navigator.clipboard.write([clipboardItem]);

    // Show success message
    showError("Element HTML copied to clipboard.", false, 2000);
    if (DEBUG) console.log("[LLM Content] Element HTML copied successfully.");

  } catch (error) {
    console.error("[LLM Content] Failed to copy element HTML:", error);
    showError("Failed to copy element HTML to clipboard.", false, 3000);
  } finally {
    // Clean up - remove floating icon, highlight, and deselect element
    FloatingIcon.removeFloatingIcon();
    Highlighter.removeSelectionHighlight();
  }
}

// New handler function for the Joplin icon click
async function handleJoplinIconClick() {
  if (DEBUG) console.log("[LLM Content] handleJoplinIconClick called.");

  // For Joplin, get the HTML snippet *before* clearing the highlight
  const rawContent = Highlighter.getSelectedElement()?.outerHTML;

  // Remove floating icon and highlight immediately
  FloatingIcon.removeFloatingIcon();
  Highlighter.removeSelectionHighlight();
  Highlighter.resetHighlightState();

  // Ensure the token is available
  if (!joplinToken) {
    showError(
      "Joplin API token is not set. Please go to extension options to set it.",
      true,
      5000,
    );
    if (DEBUG)
      console.error("[LLM Content] Joplin token is missing, cannot proceed.");
    return;
  }

  // Now, check if we have content
  if (!rawContent || rawContent.trim() === "") {
    showError("No content available to send to Joplin.", true, 3000);
    if (DEBUG)
      console.error("[LLM Content] No content (HTML) to send to Joplin.");
    return;
  }

  // Apply sanitization for Joplin content
  const contentToSend = sanitizeHtml(rawContent, {
    debug: DEBUG
  });

  // Check if sanitization left any content
  if (!contentToSend || contentToSend.trim() === "" || contentToSend.trim() === "<div></div>") {
    console.warn("[LLM Content] JOPLIN FALLBACK TRIGGERED - Sanitization removed all content");
    console.log("[LLM Content] Original content length:", rawContent.length);
    console.log("[LLM Content] Original content preview:", rawContent.substring(0, 300));
    console.log("[LLM Content] Sanitized content:", contentToSend);
    console.log("[LLM Content] Sanitized content length:", contentToSend ? contentToSend.length : 0);
    // Fallback to quick clean (only remove extension classes) if full sanitization removes everything
    const fallbackContent = quickCleanHtml(rawContent);
    if (!fallbackContent || fallbackContent.trim() === "") {
      showError("Content became empty after cleaning. Cannot send to Joplin.", true, 3000);
      if (DEBUG) console.error("[LLM Content] Even fallback cleaning resulted in empty content.");
      return;
    }
    // Use fallback content
    await JoplinManager.fetchAndShowNotebookSelection(
      joplinToken,
      fallbackContent,
      pageURL,
      true // isHtmlContent
    );
    return;
  }

  // Unconditionally set isHtmlContent to true for Joplin.
  const isHtmlContent = true;

  const pageURL = window.location.href; // Get current page URL
  if (DEBUG)
    console.log(
      "[LLM Content] Initiating Joplin note creation with cleaned HTML content and URL:",
      contentToSend.substring(0, 100),
      pageURL,
    );

  // Use JoplinManager to handle the notebook selection and note creation
  await JoplinManager.fetchAndShowNotebookSelection(
    joplinToken,
    contentToSend,
    pageURL,
    isHtmlContent,
  );
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
  lastSummary = "";
  lastModelUsed = "";
  lastSelectedDomSnippet = null;
  lastProcessedMarkdown = null;
}

function handlePopupOptions() {
  if (DEBUG) console.log("[LLM Content] handlePopupOptions called.");
  chrome.runtime.sendMessage({ action: "openOptionsPage" }, (response) => {
    if (handleLastError("openOptionsPage", DEBUG)) {
      ErrorHandler.handle(
        new Error(chrome.runtime.lastError.message),
        "handlePopupOptions",
        ErrorSeverity.WARNING,
        true
      );
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
      if (handleLastError("setChatContext", DEBUG)) {
        ErrorHandler.handle(
          new Error(chrome.runtime.lastError.message),
          "openChatWithContext",
          ErrorSeverity.WARNING,
          true
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
            if (handleLastError("openChatTab", DEBUG)) {
              ErrorHandler.handle(
                new Error(chrome.runtime.lastError.message),
                "openChatWithContext",
                ErrorSeverity.WARNING,
                false
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

/**
 * Handles processSelection action
 * @param {function} sendResponse - Response callback
 */
const handleProcessSelection = async (sendResponse) => {
  const currentSelectedElement = Highlighter?.getSelectedElement();

  if (!currentSelectedElement) {
    console.warn("[LLM Content] Received processSelection but no element selected.");
    showError("Error: No element selected. Use Alt+Click first.");
    if (SummaryPopup) {
      const pageTitleForError = document.title;
      SummaryPopup.showPopup(
        "Error: No element selected. Use Alt+Click first.",
        {
          onCopy: () => {},
          onChat: () => {},
          onClose: SummaryPopup.hidePopup,
          onNewsblur: handlePopupNewsblur,
        },
        null,
        null,
        pageTitleForError,
        true,
        false,
      );
      SummaryPopup.enableButtons(false);
      setTimeout(SummaryPopup.hidePopup, 3000);
    }
    sendResponse({ status: "error", message: "No element selected" });
    return;
  }

  try {
    await processSelectedElement();
    sendResponse({ status: "processing" });
  } catch (error) {
    sendResponse({ status: "error", message: error.message });
  }
};

/**
 * Handles summaryResult action
 * @param {object} req - Request data
 * @param {function} sendResponse - Response callback
 */
const handleSummaryResult = async (req, sendResponse) => {
  try {
    displaySummary(req);
    sendResponse({ status: "success" });
  } catch (error) {
    sendResponse({ status: "error", message: error.message });
  }
};

/**
 * Handles incoming messages from background script
 * @param {object} req - Message request
 * @param {object} sender - Message sender info
 * @param {function} sendResponse - Response callback
 * @returns {boolean} Always true to keep channel open
 */
const handleMessage = (req, sender, sendResponse) => {
  if (DEBUG) console.log("[LLM Content] Handling message:", req.action);

  // Always handle asynchronously and return true
  (async () => {
    try {
      if (req.action === "processSelection") {
        await handleProcessSelection(sendResponse);
      } else if (req.action === "summaryResult") {
        await handleSummaryResult(req, sendResponse);
      } else {
        sendResponse({ status: "error", message: `Unknown action: ${req.action}` });
      }
    } catch (error) {
      console.error("[LLM Content] Error handling message:", error);
      sendResponse({ status: "error", message: error.message });
    }
  })();

  // Always return true to indicate async response
  return true;
};

/**
 * Handles the successful summary response from the background script.
 * It parses the summary, updates the popup content, and enables the chat button.
 * @param {object} response - The message object received from the background script.
 */
function displaySummary(response) {
  if (DEBUG)
    console.log(
      "[LLM Content] Received summary result from background:",
      response.requestId,
      "Raw Summary:",
      response.summary,
    );

  lastModelUsed = response.model || "Unknown";
  const pageURL = window.location.href;
  const pageTitle = document.title;
  const hasNewsblurTokenFromBackground = response.hasNewsblurToken || false;

  if (!SummaryPopup) {
    console.error(
      "[LLM Content] SummaryPopup not available for summaryResult",
    );
    lastSummary = `Error: UI components not ready.`;
    return;
  }

  if (response.error) {
    lastSummary = `Error: ${response.error}`;
    showError(`Error: ${response.error}`);
    SummaryPopup.updatePopupContent(
      `Error: ${response.error}`,
      null,
      pageURL,
      pageTitle,
      true,
      hasNewsblurTokenFromBackground,
    );
    SummaryPopup.enableButtons(false);
  } else if (response.summary && typeof response.summary === "string") {
    const rawSummaryString = response.summary;

    if (!rawSummaryString || rawSummaryString.trim() === "") {
      showError("Error: No summary data received from the API.");
      SummaryPopup.enableButtons(false);
      return;
    }

    // The summary is now expected to be a direct HTML string (e.g., "<ul>...</ul>")
    const summaryHtml = rawSummaryString;

    // Store the HTML string directly for the chat context.
    // The chat context logic can handle raw HTML.
    lastSummary = summaryHtml;

    // The summary is ready, so enable the chat button.
    SummaryPopup.enableButtons(true);

    // Update the popup.
    // We pass `null` for `originalMarkdownArray` because we no longer generate it from JSON.
    // The popup's copy function has a fallback that will correctly use the `summaryHtml`.
    SummaryPopup.updatePopupContent(
      summaryHtml,
      null,
      pageURL,
      pageTitle,
      false,
      hasNewsblurTokenFromBackground,
      lastModelUsed,
    );

    if (DEBUG)
      console.log(
        "[LLM Content] Successfully processed HTML summary. Stored HTML for chat context:",
        lastSummary.substring(0, 100) + "...",
      );
  } else {
    lastSummary = "Error: No summary data received or invalid format.";
    showError("Error: No summary data received or invalid format.");
    SummaryPopup.updatePopupContent(
      "Error: No summary data received or invalid format.",
      null,
      pageURL,
      pageTitle,
      true,
      hasNewsblurTokenFromBackground,
    );
    SummaryPopup.enableButtons(false);
  }
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

// --- DOM Sanitization and Cleanup Functions ---
// Note: Main sanitization logic moved to js/htmlSanitizer.js for better modularity

// Helper to remove highlight classes from HTML string (legacy function for backward compatibility)
function cleanHtmlForNewsblur(htmlString) {
  return quickCleanHtml(htmlString);
}

// --- Callback Functions for NewsBlur ---
function handlePopupNewsblur(hasNewsblurToken) {
  if (DEBUG) console.log("[LLM Content] handlePopupNewsblur called.");

  if (!hasNewsblurToken) {
    const msg = "NewsBlur token is missing. Please set it in the options.";
    console.error("[LLM Content] NewsBlur share failed: " + msg);
    showError(msg);
    return;
  }

  if (
    !lastSummary ||
    lastSummary === "Thinking..." ||
    lastSummary.startsWith("Error:")
  ) {
    const msg = "No valid summary available to share.";
    console.error("[LLM Content] Share failed: " + msg);
    showError(msg);
    return;
  }

  if (!lastSelectedDomSnippet) {
    const msg = "No original content selected to share.";
    console.error("[LLM Content] Share failed: " + msg);
    showError(msg);
    return;
  }

      chrome.storage.sync.get(
    [constants.STORAGE_KEY_ALSO_SEND_TO_JOPLIN],
    (settings) => {
      if (handleLastError("getSettingsForShare", DEBUG)) {
        ErrorHandler.handle(
          new Error(chrome.runtime.lastError.message),
          "handlePopupNewsblur",
          ErrorSeverity.WARNING,
          true
        );
        return;
      }

      const alsoSendToJoplin =
        settings[constants.STORAGE_KEY_ALSO_SEND_TO_JOPLIN] ?? false;

      // lastSummary is now already the HTML string we need. No parsing required.
      const summaryHtml = lastSummary;

      const title = document.title;
      const story_url = window.location.href;

      // --- START OF NEW TWO-STAGE CLEANING IMPLEMENTATION ---

      // STAGE 1: Sanitize the original messy HTML to remove ads and junk.
      const sanitizedHtml = sanitizeForSharing(lastSelectedDomSnippet, DEBUG);

      // STAGE 2: Standardize the structure by converting it to Markdown and back to HTML.
      let finalCleanHtml = sanitizedHtml; // Fallback to sanitized HTML if conversion fails

      try {
        // Check if marked is available globally
        if (typeof marked !== "undefined") {
          const turndownService = new TurndownService();
          const markdownFromSanitizedHtml = turndownService.turndown(sanitizedHtml);
          finalCleanHtml = marked.parse(markdownFromSanitizedHtml);

          if (DEBUG) {
            console.log("[LLM Content] Two-stage cleaning completed successfully");
            console.log("[LLM Content] Original length:", lastSelectedDomSnippet.length);
            console.log("[LLM Content] After sanitization:", sanitizedHtml.length);
            console.log("[LLM Content] After standardization:", finalCleanHtml.length);
          }
        } else {
          console.warn("[LLM Content] marked library not available, using sanitized HTML only");
          if (DEBUG) console.log("[LLM Content] Falling back to Stage 1 cleaning only");
        }
      } catch (error) {
        console.error("[LLM Content] Error during Stage 2 cleaning:", error);
        if (DEBUG) console.log("[LLM Content] Falling back to Stage 1 cleaning due to error");
        // finalCleanHtml already set to sanitizedHtml as fallback
      }

      // --- END OF NEW TWO-STAGE CLEANING IMPLEMENTATION ---

      // Combine the AI summary with our new, super-clean version of the original content.
      const combinedContent = summaryHtml + "<hr>" + finalCleanHtml;

      chrome.runtime.sendMessage(
        {
          action: "shareToNewsblur",
          options: {
            title: title,
            story_url: story_url,
            content: combinedContent,
            comments: "",
          },
        },
        (response) => {
          if (handleLastError("shareToNewsblur", DEBUG)) {
            ErrorHandler.handle(
              new Error(chrome.runtime.lastError.message),
              "handlePopupNewsblur",
              ErrorSeverity.WARNING,
              true
            );
            return;
          }
          if (response.status === "success") {
            console.log(
              "[LLM Content] Successfully sent NewsBlur share request:",
              response.result,
            );
            showError("Shared to NewsBlur successfully!", false, 3000);
          } else {
            showError(
              `Failed to share to NewsBlur: ${response.message || "Unknown error"}`,
            );
            if (DEBUG)
              console.error(
                "[LLM Content] Failed to share to NewsBlur:",
                response,
              );
          }
        },
      );

      if (alsoSendToJoplin && joplinToken) {
        if (DEBUG) console.log("[LLM Content] Also sending content to Joplin.");
        JoplinManager.fetchAndShowNotebookSelection(
          joplinToken,
          combinedContent,
          story_url,
          true,
        );
      }

      SummaryPopup.hidePopup();
      Highlighter.removeSelectionHighlight();
      FloatingIcon.removeFloatingIcon();
      lastSummary = "";
      lastModelUsed = "";
      lastSelectedDomSnippet = null;
      lastProcessedMarkdown = null;
    },
  );
}

// --- Initialization Function ---
async function initialize() {
  try {
    const result = await chrome.storage.sync.get(["debug", "joplinToken"]); // Retrieve joplinToken
    DEBUG = !!result.debug;
    joplinToken = result.joplinToken || null; // Set actual Joplin token
    if (DEBUG)
      console.log(
        "[LLM Content] Initial Debug mode:",
        DEBUG,
        "Joplin Token Loaded:",
        joplinToken ? "Yes" : "No",
      );

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
    JoplinManager.initializeJoplinManager({ initialDebugState: DEBUG }); // New: Initialize JoplinManager

    modulesInitialized = true; // Set after all essential initializations
    if (DEBUG)
      console.log("[LLM Content] Modules initialized flag set to true.");

    // --- Create a dedicated container for notifications ---
    if (!document.getElementById("llm-notification-container")) {
      const notificationContainer = document.createElement("div");
      notificationContainer.id = "llm-notification-container";
      notificationContainer.className = "llm-notification-container";
      document.body.appendChild(notificationContainer);
    }
    // --- End notification container creation ---

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

// Add cleanup on window unload to prevent memory leaks
window.addEventListener('unload', () => {
  if (typeof Highlighter !== 'undefined' && Highlighter.cleanupHighlighter) {
    Highlighter.cleanupHighlighter();
  }
  if (typeof FloatingIcon !== 'undefined' && FloatingIcon.cleanup) {
    FloatingIcon.cleanup();
  }
  if (typeof SummaryPopup !== 'undefined' && SummaryPopup.cleanup) {
    SummaryPopup.cleanup();
  }
});

