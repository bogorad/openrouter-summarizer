// pageInteraction.js
// FIX: Added missing closing brace in openChatWithContext function

// highlighter.js, floatingIcon.js, summaryPopup.js, constants.js, utils.js remain unchanged

console.log(`[LLM Content] Script Start (v3.0.18)`); // Updated version

// --- Module References (will be populated after dynamic import) ---
let Highlighter = null;
let FloatingIcon = null;
let SummaryPopup = null;
let constants = null;
let importedShowError = null;
let renderTextAsHtml = null; // Import renderTextAsHtml
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
  if (!Highlighter || !SummaryPopup || !importedShowError) {
    console.error(
      "[LLM Content] processSelectedElement called before modules loaded!",
    );
    importedShowError("Error: Core components not loaded.");
    return;
  }

  const selectedElement = Highlighter.getSelectedElement();
  if (!selectedElement) {
    if (DEBUG)
      console.warn(
        "[LLM Content] processSelectedElement called but no element is selected.",
      );
    importedShowError("Error: No element selected to process.");
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
    importedShowError("Error: Selected element has no content.");
    return;
  }

  // Send the HTML to the background script for LLM processing
  sendToLLM(selectedHtml);
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
  lastSelectedDomSnippet = null; // ADDED: Clear stored snippet on close
}

// --- Chat Context Handling ---
function openChatWithContext(targetLang = "") {
  // REMOVED: Check for !Highlighter module loaded here, assume loaded if popup was shown.
  // REMOVED: Check for selectedElement being null.

  // Use the stored domSnippet instead of getting it from the element again
  const domSnippet = lastSelectedDomSnippet;

  // Check if we actually have a snippet to send
  if (!domSnippet || !domSnippet.trim()) {
    importedShowError("Cannot open chat: No element content available.");
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
    importedShowError("Cannot open chat: No valid summary available.");
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
        importedShowError("Failed to prepare chat context.");
      }
    },
  );
}

// --- LLM Interaction (Delegated to background.js) ---
async function sendToLLM(selectedHtml) {
  // Made function async
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

  // Await the popup to be fully ready before proceeding
  try {
    await SummaryPopup.showPopup("Thinking...", {
      onCopy: () => {}, // Provide a no-op function instead of null
      onChat: handlePopupChat,
      onClose: handlePopupClose,
    });
    if (DEBUG) console.log("[LLM Content] Summary popup is now ready.");
  } catch (error) {
    console.error("[LLM Content] Error showing summary popup:", error);
    importedShowError("Error displaying summary popup.");
    FloatingIcon.removeFloatingIcon();
    Highlighter.removeSelectionHighlight();
    lastSummary = "";
    lastSelectedDomSnippet = null; // ADDED: Clear stored snippet on send error
    return; // Stop if popup failed to show
  }

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
        // Now that showPopup is awaited, updatePopupContent should work
        SummaryPopup.updatePopupContent(errorMsg);
        SummaryPopup.enableChatButton(false);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = ""; // Clear state on send error
        lastSelectedDomSnippet = null; // ADDED: Clear stored snippet on send error
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
        // Now that showPopup is awaited, updatePopupContent should work
        SummaryPopup.updatePopupContent(errorMsg);
        SummaryPopup.enableChatButton(false);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = ""; // Clear state on validation error
        lastSelectedDomSnippet = null; // ADDED: Clear stored snippet on validation error
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
        // Now that showPopup is awaited, updatePopupContent should work
        SummaryPopup.updatePopupContent(errorMsg);
        SummaryPopup.enableChatButton(false);
        FloatingIcon.removeFloatingIcon();
        Highlighter.removeSelectionHighlight();
        lastSummary = ""; // Clear state on unexpected response
        lastSelectedDomSnippet = null; // ADDED: Clear stored snippet on unexpected response
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
      importedShowError("Error: No element selected. Use Alt+Click first.");
      // No need to await here, just show the error popup
      SummaryPopup.showPopup(
        "Error: No element selected. Use Alt+Click first.",
        { onCopy: () => {}, onChat: () => {}, onClose: SummaryPopup.hidePopup }, // Provide no-op for onCopy
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
      // Now that showPopup is awaited in sendToLLM, updatePopupContent should work
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
          // Use the imported renderTextAsHtml function for Markdown rendering
          summaryHtml =
            "<ul>" +
            combinedSummaryArray
              .map((item) => {
                const itemHtml = renderTextAsHtml(item); // Use the imported function
                return `<li>${itemHtml}</li>`; // Wrap the resulting HTML in <li>
              })
              .join("") +
            "</ul>";
          // --- STORE FIXED JSON STRING ---
          lastSummary = JSON.stringify(combinedSummaryArray);
          // --- END STORE ---
          // Now that showPopup is awaited in sendToLLM, updatePopupContent should work
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
        // Now that showPopup is awaited in sendToLLM, updatePopupContent should work
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
      // Now that showPopup is awaited in sendToLLM, updatePopupContent should work
      SummaryPopup.updatePopupContent(
        "Error: No summary data received or invalid format.",
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
  // Check if essential modules are initialized
  if (
    !modulesInitialized ||
    !SummaryPopup ||
    !importedShowError ||
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
    // Queue the message and its sendResponse function
    messageQueue.push({ req, sender, sendResponse });
    // Return true to indicate that sendResponse will be called asynchronously
    // once the message is processed from the queue.
    return true;
  }

  // If modules are initialized, handle the message directly
  return handleMessage(req, sender, sendResponse);
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
        // Use console.error as a fallback if importedShowError is not available yet
        (importedShowError || console.error)(errorMsg);
      } catch {
        /* ignore */
      }
    }
    const { showError: importedShowErrorFn, renderTextAsHtml: importedRenderTextAsHtmlFn } = utilsModule || {};
    importedShowError = importedShowErrorFn || console.error; // Fallback to console.error
    renderTextAsHtml = importedRenderTextAsHtmlFn; // Assign the imported function

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

    // Set the flag indicating modules are initialized
    modulesInitialized = true;
    if (DEBUG)
      console.log("[LLM Content] Modules initialized flag set to true.");

    // Process any messages that were queued before initialization completed
    if (messageQueue.length > 0) {
      if (DEBUG)
        console.log(
          `[LLM Content] Processing ${messageQueue.length} queued messages.`,
        );
      while (messageQueue.length > 0) {
        const queuedMessage = messageQueue.shift(); // Get the oldest message
        // Process the message using the core handler
        // Note: We don't need to check the return value or call sendResponse here
        // because the original listener already returned true, indicating async response.
        // The handleMessage function will call sendResponse if needed.
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
    // Use the fallback showError if the imported one failed to load
    const errorDisplayFn = importedShowError || console.error;
    errorDisplayFn(
      `Error: OpenRouter Summarizer failed to load components (${err.message}). Please try reloading the page or reinstalling the extension.`,
    );
  }
}

// Start the initialization process
initialize();
