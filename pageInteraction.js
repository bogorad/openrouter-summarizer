// pageInteraction.js

console.log("[LLM Content] Script Start (v3.10.2)");

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
import {
  NOTIFICATION_TIMEOUT_MINOR_MS,
  NOTIFICATION_TIMEOUT_SUCCESS_MS,
  NOTIFICATION_TIMEOUT_CRITICAL_MS,
  SUMMARY_MAX_CONTENT_SIZE,
} from "./constants.js";
import { ErrorHandler, ErrorSeverity, setErrorNotifier } from "./js/errorHandler.js";
import { RuntimeMessageActions, TabMessageActions } from "./js/messaging/actions.js";
import { sendRuntimeAction } from "./js/messaging/runtimeClient.js";
import { createContentScriptMessageListener } from "./js/messaging/contentRouter.js";
import {
  applyCostTruncationPolicy,
  createCharacterTokenEstimatePolicy,
  TRUNCATION_DECISIONS,
} from "./js/content/truncationPolicy.js";
import { extractArtifactsFromSelectedElement } from "./js/content/extractionPipeline.js";
import { getIntegrationErrorMessage } from "./js/integrations/integrationErrors.js";
import {
  CONTENT_ARTIFACT_KEYS,
  getContentArtifactText,
} from "./js/content/contentArtifacts.js";

// --- Module-level variables (assignments will happen in initialize) ---
// These are assigned from the static imports for convenience if you prefer this pattern,
// or you can use utils.showError, constants.DEFAULT_MAX_REQUEST_PRICE directly.
let showError = importedShowError; // Directly use the imported function
let renderTextAsHtml = importedRenderTextAsHtml; // Directly use the imported function
setErrorNotifier(showError);

// --- Global State ---
let DEBUG = false;
let lastSummary = "";
let lastModelUsed = "";
let lastSelectedDomSnippet = null;
let lastProcessedMarkdown = null;
let lastContentArtifacts = null;
let activeSummaryRequestId = null;
let hasJoplinToken = false;

let messageQueue = [];
let modulesInitialized = false; // This flag is still useful to queue messages if initialization is async (e.g., fetching settings)

const extractCurrentContentArtifacts = (selectedElement) => extractArtifactsFromSelectedElement(
  selectedElement,
  {
    document,
    window,
    debug: DEBUG,
    chatSnippetMaxLength: SUMMARY_MAX_CONTENT_SIZE,
  },
);

async function getJoplinCapabilityFromBackground() {
  try {
    const { response } = await sendRuntimeAction(RuntimeMessageActions.getJoplinToken);

    if (!response || response.status !== "success") {
      if (DEBUG) {
        console.warn(
          "[LLM Content] Failed to load Joplin capability from background:",
          response?.message || "No response",
        );
      }
      return false;
    }

    return response.hasJoplinToken === true;
  } catch (error) {
    if (DEBUG) {
      console.warn(
        "[LLM Content] Failed to request Joplin capability from background:",
        error,
      );
    }
    return false;
  }
}

// Input validation limits to prevent DoS attacks
const MAX_NESTING_DEPTH = 100;
const MAX_ELEMENT_COUNT = 10000;
const PROCESSING_TIMEOUT_MS = 30000; // 30 seconds

const isActiveSummaryRequest = (requestId) =>
  activeSummaryRequestId && requestId === activeSummaryRequestId;

const logStaleSummaryRequest = (source, requestId) => {
  if (!DEBUG) return;
  console.log(
    `[LLM Content] Ignoring stale summary response in ${source}:`,
    requestId,
    "active:",
    activeSummaryRequestId,
  );
};

const clearSummaryState = () => {
  lastSummary = "";
  lastModelUsed = "";
  lastSelectedDomSnippet = null;
  lastProcessedMarkdown = null;
  lastContentArtifacts = null;
  activeSummaryRequestId = null;
};

// --- Prompt Assembly Function (Placeholder - ensure constants is loaded if used here) ---

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
  if (html.length > SUMMARY_MAX_CONTENT_SIZE) {
    return {
      valid: false,
      error: `Error: Selected content exceeds maximum size of ${SUMMARY_MAX_CONTENT_SIZE / 1024}KB. Please select a smaller section.`
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
    showError(validation.error, true, NOTIFICATION_TIMEOUT_CRITICAL_MS);
    Highlighter.removeSelectionHighlight(); // Clean up highlight
    return;
  }

  // Remove highlight FIRST to get clean content
  Highlighter.removeSelectionHighlight();

  const contentArtifacts = extractCurrentContentArtifacts(selectedElement);
  const rawHtml = contentArtifacts.rawHtml.value;
  lastSelectedDomSnippet = rawHtml;
  lastContentArtifacts = contentArtifacts;

  if (!rawHtml || rawHtml.trim() === "") {
    if (DEBUG)
      console.warn(
        "[LLM Content] Selected element has no HTML content to summarize.",
      );
    showError("Error: Selected element has no content.");
    return;
  }

  if (DEBUG) {
    console.log(
      "[LLM Content] Extracted content artifacts:",
      {
        rawHtmlLength: contentArtifacts.rawHtml.length,
        safeHtmlLength: contentArtifacts.safeHtml.length,
        llmMarkdownLength: contentArtifacts.llmMarkdown.length,
        chatSnippetLength: contentArtifacts.chatSnippet.length,
        warnings: contentArtifacts.warnings,
      },
    );
  }

  const summaryContent = contentArtifacts.llmMarkdown;
  lastProcessedMarkdown = summaryContent;

  // Use constants directly from import if they are exported, e.g. constants.MIN_MARKDOWN_LENGTH
  const minMarkdownLength = constants.MIN_MARKDOWN_LENGTH || 50; // Assuming MIN_MARKDOWN_LENGTH is exported from constants.js
  if (!summaryContent || summaryContent.length < minMarkdownLength) {
    if (DEBUG)
      console.warn(
        "[LLM Content] Markdown output is empty or too short, falling back to raw HTML.",
        `Markdown length: ${summaryContent?.length || 0}`,
      );
    showError(
      "Warning: Content processing incomplete, using raw data.",
      false,
      NOTIFICATION_TIMEOUT_SUCCESS_MS,
    ); // Example: non-fatal, timed
    // Fallback to sending the original outerHTML snippet
    sendToLLM(rawHtml);
  } else {
    sendToLLM(summaryContent);
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
  activeSummaryRequestId = requestId;
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
    clearSummaryState();
    return;
  }

  SummaryPopup.enableButtons(false);

  sendRuntimeAction(RuntimeMessageActions.getSettings).then(({ response }) => {
    if (!isActiveSummaryRequest(requestId)) {
      logStaleSummaryRequest("getSettings", requestId);
      return;
    }

    if (!response) {
      const errorMsg = "Error getting settings: No response";
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
      clearSummaryState();
      return;
    }

    if (DEBUG) console.log("[LLM Content] getSettings response received:", response);
    //   console.log("[LLM Content] getSettings response received:", response);
    // }
    const maxRequestPrice =
      response.maxRequestPrice || constants.DEFAULT_MAX_REQUEST_PRICE || 0.01;
    const maxPriceBehavior = response.maxPriceBehavior === "fail"
      ? "fail"
      : "truncate";
    const summaryModelId = response.summaryModelId || "";
    // Retrieve NewsBlur token status from settings to pass to updatePopupContent
    const hasNewsblurToken = response.hasNewsblurToken === true;

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
      clearSummaryState();
      return;
    }

    const tokensPerChar = constants.TOKENS_PER_CHAR || 227.56 / 1024;
    const tokenEstimatePolicy = createCharacterTokenEstimatePolicy(tokensPerChar);
    const estimatedTokens = tokenEstimatePolicy.estimateTokens(content);
    if (DEBUG)
      console.log(
        `[LLM Content] Estimated tokens for content: ${estimatedTokens}`,
      );

    sendRuntimeAction(RuntimeMessageActions.getModelPricing, {
      modelId: summaryModelId,
    }).then(({ response: priceResponse }) => {
        if (!isActiveSummaryRequest(requestId)) {
          logStaleSummaryRequest("getModelPricing", requestId);
          return;
        }

        if (
          !priceResponse ||
          priceResponse.status !== "success"
        ) {
          const errorMsg = `Error fetching pricing data: ${priceResponse?.message || "Unknown error"}`;
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
          clearSummaryState();
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

        const truncationDecision = applyCostTruncationPolicy({
          content,
          pricePerToken,
          maxRequestPrice,
          maxPriceBehavior,
          tokenEstimatePolicy,
        });
        const estimatedCost = truncationDecision.estimatedCost;
        if (DEBUG)
          console.log(
            `[LLM Content] Estimated cost: $${estimatedCost.toFixed(6)} (max allowed: $${maxRequestPrice.toFixed(3)})`,
          );

        if (truncationDecision.decision === TRUNCATION_DECISIONS.TRUNCATE) {
          showError(
            truncationDecision.warning,
            false,
            NOTIFICATION_TIMEOUT_SUCCESS_MS,
          );
          sendRequestToBackground(
            truncationDecision.content,
            requestId,
            hasNewsblurToken,
          );
          return;
        }

        if (truncationDecision.decision === TRUNCATION_DECISIONS.REJECT) {
          const errorMsg = truncationDecision.error;
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
          clearSummaryState();
          return;
        }
        sendRequestToBackground(
          truncationDecision.content,
          requestId,
          hasNewsblurToken,
        );
      }).catch((error) => {
        if (!isActiveSummaryRequest(requestId)) {
          logStaleSummaryRequest("getModelPricing catch", requestId);
          return;
        }

        const errorMsg = `Error fetching pricing data: ${error.message}`;
        ErrorHandler.handle(new Error(errorMsg), "validateAndSendToLLM", ErrorSeverity.WARNING, true);
        SummaryPopup.updatePopupContent(
          errorMsg,
          null,
          null,
          pageTitle,
          true,
          hasNewsblurToken,
        );
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        clearSummaryState();
      });
  }).catch((error) => {
    if (!isActiveSummaryRequest(requestId)) {
      logStaleSummaryRequest("getSettings catch", requestId);
      return;
    }

    const errorMsg = `Error getting settings: ${error.message}`;
    ErrorHandler.handle(new Error(errorMsg), "validateAndSendToLLM", ErrorSeverity.WARNING, true);
    SummaryPopup.updatePopupContent(
      errorMsg,
      null,
      null,
      pageTitle,
      true,
      false,
    );
    FloatingIcon.removeFloatingIcon();
    Highlighter.removeSelectionHighlight();
    clearSummaryState();
  });
}

// --- Send Request to Background ---
function sendRequestToBackground(content, requestId, hasNewsblurTokenStatus) {
  // Added hasNewsblurTokenStatus parameter
  if (DEBUG)
    console.log("[LLM Request] Sending summarization request to background.");
  const pageURL = window.location.href;
  const pageTitle = document.title;
  sendRuntimeAction(
    RuntimeMessageActions.requestSummary,
    {
      requestId: requestId,
      selectedHtml: content,
      hasNewsblurToken: hasNewsblurTokenStatus,
    }, // Pass the token status
  ).then(({ response }) => {
      if (!isActiveSummaryRequest(requestId)) {
        logStaleSummaryRequest("requestSummary", requestId);
        return;
      }

      if (response && response.status === "error") {
        const errorMsg = `Error: ${response.message || "Background validation failed."}`;
        showError(errorMsg);
        if (SummaryPopup)
          SummaryPopup.updatePopupContent(
            errorMsg,
            null,
            pageURL,
            pageTitle,
            true,
            hasNewsblurTokenStatus,
          ); // Pass token status
        if (FloatingIcon) FloatingIcon.removeFloatingIcon();
        if (Highlighter) Highlighter.removeSelectionHighlight();
        clearSummaryState();
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
            pageURL,
            pageTitle,
            true,
            hasNewsblurTokenStatus,
          ); // Pass token status
        if (FloatingIcon) FloatingIcon.removeFloatingIcon();
        if (Highlighter) Highlighter.removeSelectionHighlight();
        clearSummaryState();
      }
    }).catch((error) => {
      if (!isActiveSummaryRequest(requestId)) {
        logStaleSummaryRequest("requestSummary catch", requestId);
        return;
      }

      const errorMsg = `Error sending request: ${error.message}`;
      ErrorHandler.handle(new Error(errorMsg), "sendRequestToBackground", ErrorSeverity.WARNING, true);
      if (SummaryPopup)
        SummaryPopup.updatePopupContent(
          errorMsg,
          null,
          pageURL,
          pageTitle,
          true,
          hasNewsblurTokenStatus,
        ); // Pass token status
      if (FloatingIcon) FloatingIcon.removeFloatingIcon();
      if (Highlighter) Highlighter.removeSelectionHighlight();
      clearSummaryState();
    });
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
    hasJoplinToken, // Pass the boolean indicating if Joplin token is set
    handleCopyHtmlIconClick, // Pass a handler for the Copy HTML icon
    true, // Always show the Copy HTML icon
  );
}

function handleElementDeselected() {
  if (DEBUG) console.log("[LLM Content] handleElementDeselected called.");

  // Clicking outside the selected element should fully dismiss extension UI.
  if (SummaryPopup?.hidePopup) {
    SummaryPopup.hidePopup();
  }
  if (FloatingIcon?.removeFloatingIcon) {
    FloatingIcon.removeFloatingIcon();
  }

  clearSummaryState();
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
  clearSummaryState();
}

// New handler function for the Copy HTML icon click
async function handleCopyHtmlIconClick() {
  if (DEBUG) console.log("[LLM Content] handleCopyHtmlIconClick called.");

  // Get the currently selected element
  const selectedElement = Highlighter.getSelectedElement();
  if (!selectedElement) {
    showError("No element selected to copy.", false, NOTIFICATION_TIMEOUT_MINOR_MS);
    if (DEBUG) console.error("[LLM Content] No element selected for HTML copy.");
    return;
  }

  try {
    const contentArtifacts = extractCurrentContentArtifacts(selectedElement);
    const sanitizedHtml = contentArtifacts.safeHtml;

    if (!sanitizedHtml || sanitizedHtml.trim() === "") {
      showError("Element HTML became empty after cleaning.", false, NOTIFICATION_TIMEOUT_MINOR_MS);
      if (DEBUG) console.error("[LLM Content] HTML sanitization resulted in empty content.");
      return;
    }

    // Copy to clipboard with both HTML and plain text formats
    const textContent = contentArtifacts.plainText;
    const htmlBlob = new Blob([sanitizedHtml], { type: "text/html" });
    const textBlob = new Blob([textContent], { type: "text/plain" });

    const clipboardItem = new ClipboardItem({
      "text/html": htmlBlob,
      "text/plain": textBlob,
    });

    await navigator.clipboard.write([clipboardItem]);

    // Show success message
    showError("Element HTML copied to clipboard.", false, NOTIFICATION_TIMEOUT_MINOR_MS);
    if (DEBUG) console.log("[LLM Content] Element HTML copied successfully.");

  } catch (error) {
    console.error("[LLM Content] Failed to copy element HTML:", error);
    showError("Failed to copy element HTML to clipboard.", false, NOTIFICATION_TIMEOUT_SUCCESS_MS);
  } finally {
    // Clean up - remove floating icon, highlight, and deselect element
    FloatingIcon.removeFloatingIcon();
    Highlighter.removeSelectionHighlight();
  }
}

// New handler function for the Joplin icon click
async function handleJoplinIconClick() {
  if (DEBUG) console.log("[LLM Content] handleJoplinIconClick called.");

  // For Joplin, get the content artifacts *before* clearing the highlight
  const selectedElement = Highlighter.getSelectedElement();
  const contentArtifacts = selectedElement
    ? extractCurrentContentArtifacts(selectedElement)
    : null;
  const rawContent = contentArtifacts?.rawHtml?.value || "";
  const contentToSend = getContentArtifactText(
    contentArtifacts,
    CONTENT_ARTIFACT_KEYS.JOPLIN_NOTE_BODY_HTML,
  );

  // Remove floating icon and highlight immediately
  FloatingIcon.removeFloatingIcon();
  Highlighter.removeSelectionHighlight();
  Highlighter.resetHighlightState();

  // Ensure Joplin is configured before opening notebook selection.
  if (!hasJoplinToken) {
    showError(
      "Joplin API token is not set. Please go to extension options to set it.",
      true,
      NOTIFICATION_TIMEOUT_CRITICAL_MS,
    );
    if (DEBUG)
      console.error("[LLM Content] Joplin token is missing, cannot proceed.");
    return;
  }

  // Now, check if we have content
  if (!rawContent || rawContent.trim() === "") {
    showError("No content available to send to Joplin.", true, NOTIFICATION_TIMEOUT_SUCCESS_MS);
    if (DEBUG)
      console.error("[LLM Content] No content (HTML) to send to Joplin.");
    return;
  }

  const pageURL = window.location.href; // Get current page URL

  if (!contentToSend) {
    showError("Content became empty after cleaning. Cannot send to Joplin.", true, NOTIFICATION_TIMEOUT_SUCCESS_MS);
    if (DEBUG) {
      console.error("[LLM Content] Content artifacts did not include Joplin note body HTML.", {
        rawHtmlLength: rawContent.length,
        warnings: contentArtifacts?.warnings || [],
      });
    }
    return;
  }

  // Unconditionally set isHtmlContent to true for Joplin.
  const isHtmlContent = true;

  if (DEBUG)
    console.log(
      "[LLM Content] Initiating Joplin note creation with cleaned HTML content and URL:",
      contentToSend.substring(0, 100),
      pageURL,
    );

  // Use JoplinManager to handle the notebook selection and note creation
  await JoplinManager.fetchAndShowNotebookSelection(
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
  clearSummaryState();
}

function handlePopupOptions() {
  if (DEBUG) console.log("[LLM Content] handlePopupOptions called.");
  sendRuntimeAction(RuntimeMessageActions.openOptionsPage).catch((error) => {
      ErrorHandler.handle(
        error,
        "handlePopupOptions",
        ErrorSeverity.WARNING,
        true
      );
  });
  if (SummaryPopup) SummaryPopup.hidePopup();
  if (Highlighter) Highlighter.removeSelectionHighlight();
  if (FloatingIcon) FloatingIcon.removeFloatingIcon();
  clearSummaryState();
}

// --- Chat Context Handling ---
function openChatWithContext(targetLang = "") {
  const domSnippet = lastContentArtifacts?.chatSnippet || lastSelectedDomSnippet;
  const processedMarkdownContent = lastContentArtifacts?.llmMarkdown || lastProcessedMarkdown;

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

  sendRuntimeAction(
    RuntimeMessageActions.setChatContext,
    contextPayload,
  ).then(({ response }) => {
      if (response && response.status === "ok") {
        if (DEBUG)
          console.log(
            "[LLM Chat Context] Background confirmed context storage. Requesting tab open.",
          );
        sendRuntimeAction(RuntimeMessageActions.openChatTab)
          .then(({ response: openResponse }) => {
            if (DEBUG)
              console.log(
                "[LLM Chat Context] Background ack openChatTab:",
                openResponse,
            );
            if (SummaryPopup) SummaryPopup.hidePopup();
            clearSummaryState();
          })
          .catch((error) => {
              ErrorHandler.handle(
                error,
                "openChatWithContext",
                ErrorSeverity.WARNING,
                false
              );
          });
      } else {
        console.error(
          "[LLM Chat Context] Background did not confirm context storage:",
          response,
        );
        showError("Failed to prepare chat context.");
      }
    }).catch((error) => {
      ErrorHandler.handle(
        error,
        "openChatWithContext",
        ErrorSeverity.WARNING,
        true
      );
    });
}

// --- Core Message Handling Logic ---

/**
 * Handles processSelection action
 * @returns {object} Message response
 */
const handleProcessSelection = async () => {
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
          onOptions: handlePopupOptions,
          onNewsblur: handlePopupNewsblur,
        },
        null,
        null,
        pageTitleForError,
        true,
        false,
      );
      SummaryPopup.enableButtons(false);
      setTimeout(SummaryPopup.hidePopup, NOTIFICATION_TIMEOUT_SUCCESS_MS);
    }
    return { status: "error", message: "No element selected" };
  }

  try {
    await processSelectedElement();
    return { status: "processing" };
  } catch (error) {
    return { status: "error", message: error.message };
  }
};

/**
 * Handles summaryResult action
 * @param {object} req - Request data
 * @returns {object} Message response
 */
const handleSummaryResult = async (req) => {
  try {
    displaySummary(req);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: error.message };
  }
};

const contentMessageHandlers = Object.freeze({
  [TabMessageActions.processSelection]: handleProcessSelection,
  [TabMessageActions.summaryResult]: handleSummaryResult,
});

const routeContentMessage = createContentScriptMessageListener({
  handlers: contentMessageHandlers,
  onError: console.error,
});

/**
 * Handles incoming messages from background script
 * @param {object} req - Message request
 * @param {object} sender - Message sender info
 * @param {function} sendResponse - Response callback
 * @returns {boolean} Always true to keep channel open
 */
const handleMessage = (req, sender, sendResponse) => {
  if (DEBUG) console.log("[LLM Content] Handling message:", req.action);
  return routeContentMessage(req, sender, sendResponse);
};

/**
 * Handles the successful summary response from the background script.
 * It parses the summary, updates the popup content, and enables the chat button.
 * @param {object} response - The message object received from the background script.
 */
function displaySummary(response) {
  if (!isActiveSummaryRequest(response.requestId)) {
    logStaleSummaryRequest("displaySummary", response.requestId);
    return;
  }

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

// --- Callback Functions for NewsBlur ---
async function handlePopupNewsblur(hasNewsblurToken) {
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

  let settings;
  try {
    const result = await sendRuntimeAction(RuntimeMessageActions.getSettings);
    settings = result.response || {};
  } catch (error) {
    ErrorHandler.handle(
      error,
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

  const newsblurStoryHtml = getContentArtifactText(
    lastContentArtifacts,
    CONTENT_ARTIFACT_KEYS.NEWSBLUR_STORY_HTML,
  );
  if (DEBUG) {
    console.log("[LLM Content] Using NewsBlur story artifact for NewsBlur share", {
      rawHtmlLength: lastSelectedDomSnippet.length,
      newsblurStoryHtmlLength: newsblurStoryHtml.length,
      warnings: lastContentArtifacts?.warnings || [],
    });
  }

  // Combine the AI summary with the NewsBlur original-content artifact.
  const combinedContent = summaryHtml + "<hr>" + newsblurStoryHtml;

  try {
    const { response } = await sendRuntimeAction(
      RuntimeMessageActions.shareToNewsblur,
      {
        options: {
          title: title,
          story_url: story_url,
          content: combinedContent,
          comments: "",
        },
      },
    );

    if (response.status === "success") {
      console.log(
        "[LLM Content] Successfully sent NewsBlur share request:",
        response.result,
      );
      showError("Shared to NewsBlur successfully!", false, NOTIFICATION_TIMEOUT_SUCCESS_MS);
    } else {
      const message = getIntegrationErrorMessage(response, "Unknown error");
      showError(
        `Failed to share to NewsBlur: ${message}`,
      );
      if (DEBUG)
        console.error(
          "[LLM Content] Failed to share to NewsBlur:",
          response,
        );
    }
  } catch (error) {
    ErrorHandler.handle(
      error,
      "handlePopupNewsblur",
      ErrorSeverity.WARNING,
      true
    );
  }

  if (alsoSendToJoplin && hasJoplinToken) {
    if (DEBUG) console.log("[LLM Content] Also sending content to Joplin.");
    JoplinManager.fetchAndShowNotebookSelection(
      combinedContent,
      story_url,
      true,
    );
  }

  SummaryPopup.hidePopup();
  Highlighter.removeSelectionHighlight();
  FloatingIcon.removeFloatingIcon();
  clearSummaryState();
}

// --- Initialization Function ---
async function initialize() {
  try {
    const syncResult = await chrome.storage.sync.get(["debug"]);

    DEBUG = !!syncResult.debug;
    hasJoplinToken = await getJoplinCapabilityFromBackground();
    if (DEBUG)
      console.log(
        "[LLM Content] Initial Debug mode:",
        DEBUG,
        "Joplin Token Loaded:",
        hasJoplinToken ? "Yes" : "No",
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

const cleanupInjectedUiAndListeners = () => {
  if (Highlighter?.cleanupHighlighter) {
    Highlighter.cleanupHighlighter();
  }
  if (FloatingIcon?.cleanup) {
    FloatingIcon.cleanup();
  }
  if (SummaryPopup?.cleanup) {
    SummaryPopup.cleanup();
  }
  modulesInitialized = false;
};

// Some documents disable `unload` via Permissions Policy, which triggers a console violation
// when attempting to register an unload handler. Use `pagehide` instead.
window.addEventListener("pagehide", () => {
  cleanupInjectedUiAndListeners();
});

// If the page is restored from the back/forward cache, re-initialize so the extension
// remains usable after we removed listeners on pagehide.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  cleanupInjectedUiAndListeners();
  initialize();
});
