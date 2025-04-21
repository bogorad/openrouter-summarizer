const VER = "v2.30";

console.log(`[LLM Content] Script Start (${VER})`);

// --- Module References (will be populated after dynamic import) ---
let Highlighter = null;
let FloatingIcon = null;
let SummaryPopup = null;
let constants = null;
let importedTryParseJson = null;
let importedShowError = null;

// --- Global State Variables ---
let DEBUG = false; // Debug logging state
let lastSummary = ""; // Raw or Cleaned/Combined summary string for chat context
let lastModelUsed = ""; // Model used for the last summary

// --- Language Data (Fetched once during initialization) ---
let ALL_LANGUAGE_NAMES_MAP = {};
let svgPathPrefixUrl = "";
let fallbackSvgPathUrl = "";

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

// --- Helper Functions ---
function findLanguageByName(name) {
  if (!name || typeof name !== "string" || !ALL_LANGUAGE_NAMES_MAP)
    return undefined;
  const cleanName = name.trim().toLowerCase();
  const languageData = ALL_LANGUAGE_NAMES_MAP[cleanName];
  return languageData ? languageData : undefined;
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
function openChatWithContext(targetLang = null) {
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
  if (
    !lastSummary ||
    lastSummary === "Thinking..." ||
    lastSummary.startsWith("Error:")
  ) {
    importedShowError("Cannot open chat: No valid summary available.");
    if (DEBUG)
      console.warn(
        "[LLM Chat Context] Chat attempt failed: No valid summary found in lastSummary.",
      );
    return;
  }

  const domSnippet =
    selectedElement.outerHTML ||
    selectedElement.innerHTML ||
    selectedElement.textContent ||
    "";
  const summaryForChat = lastSummary; // Pass the RAW or CLEANED/COMBINED summary string

  const contextPayload = {
    domSnippet: domSnippet,
    summary: summaryForChat,
    chatTargetLanguage: targetLang,
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
              if (Highlighter) Highlighter.removeSelectionHighlight(); // This also clears selectedElement state in highlighter
              lastSummary = ""; // Clear summary state
              lastModelUsed = "";
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

// --- LLM Interaction (Corrected: Full response handling + Multi-array JSON parsing) ---
function sendToLLM(
  selectedHtml,
  apiKey,
  model,
  systemPrompt,
  availableLanguages,
) {
  // Ensure SummaryPopup is loaded before proceeding
  if (!SummaryPopup) {
    console.error(
      "[LLM Content] sendToLLM called before SummaryPopup module loaded!",
    );
    return;
  }
  if (DEBUG) console.log(`[LLM Request] Sending to model: ${model}`);

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: selectedHtml },
    ],
  };

  const payloadWithStructure = {
    ...payload,
    structured_outputs: "true",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "list_of_strings",
        strict: true,
        schema: {
          type: "array",
          items: {
            type: "string"
          },
          minItems: 5,
          maxItems: 9
        }
      }
    }
  };
  if (DEBUG) console.log("[LLM Content] Sending payload to OpenRouter:", payloadWithStructure);
  fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/bogorad/openrouter-summarizer",
      "X-Title": "OR-Summ",
    },
    body: JSON.stringify(payloadWithStructure),
  })
    .then((response) => {
      if (!response.ok) {
        return response.text().then((text) => {
          let errorDetail = text;
          try {
            const errJson = JSON.parse(text);
            errorDetail = errJson?.error?.message || text;
          } catch (e) {}
          throw new Error(
            `API Error: ${response.status} ${response.statusText} - ${errorDetail}`,
          );
        });
      }
      return response.json();
    })
    .then((data) => {
      if (DEBUG) console.log("[LLM Response] Received data:", data);
      const modelOutput = data.choices?.[0]?.message?.content?.trim();

      if (!modelOutput) {
        throw new Error("No response content received from LLM.");
      }

      const rawModelOutputForError = modelOutput;
      lastSummary = ""; // Reset

      let jsonArrayString = null;
      let trailingText = "";
      let summaryHtml = "";
      let parseError = null;
      let combinedSummaryItems = [];
      let successfullyParsedSomething = false;

      try {
        const fenceMatch = modelOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (fenceMatch?.[1]) {
          jsonArrayString = fenceMatch[1].trim();
          trailingText = "";
          const cleanedFenceContent = jsonArrayString.replace(
            /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
            "",
          );
          const parsedArray = importedTryParseJson
            ? importedTryParseJson(cleanedFenceContent)
            : null;
          if (Array.isArray(parsedArray)) {
            combinedSummaryItems = parsedArray;
            successfullyParsedSomething = true;
          } else {
            throw new Error("Fenced content was not a valid JSON array.");
          }
        } else {
          const startIndex = modelOutput.indexOf("[");
          if (startIndex !== -1) {
            let bracketBalance = 0;
            let endIndex = -1;
            for (let i = startIndex; i < modelOutput.length; i++) {
              if (modelOutput[i] === "[") {
                bracketBalance++;
              } else if (modelOutput[i] === "]") {
                bracketBalance--;
                if (bracketBalance === 0) {
                  endIndex = i;
                  break;
                }
              }
            }
            if (endIndex !== -1) {
              jsonArrayString = modelOutput
                .substring(startIndex, endIndex + 1)
                .trim();
              trailingText = modelOutput.substring(endIndex + 1).trim();
            }
          }
          if (jsonArrayString) {
            const cleanedString = jsonArrayString.replace(
              /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
              "",
            );
            const parsedArray = importedTryParseJson
              ? importedTryParseJson(cleanedString)
              : null;
            if (Array.isArray(parsedArray)) {
              combinedSummaryItems = parsedArray;
              successfullyParsedSomething = true;
              if (trailingText) {
                combinedSummaryItems.push(trailingText);
              }
            }
          } else if (trailingText) {
            combinedSummaryItems = [trailingText];
            successfullyParsedSomething = true;
          }
        }
        if (combinedSummaryItems.length > 0) {
          summaryHtml =
            "<ul>" +
            combinedSummaryItems.map((item) => `<li>${item}</li>`).join("") +
            "</ul>";
          lastSummary = JSON.stringify(combinedSummaryItems);
        } else {
          throw new Error(
            "LLM response parsed to an empty array or no valid content.",
          );
        }
      } catch (e) {
        parseError = e;
        lastSummary = rawModelOutputForError;
      }

      if (parseError || summaryHtml === "") {
        const detailMessage = parseError
          ? parseError.message
          : successfullyParsedSomething
            ? "Resulting summary was empty."
            : "Unknown processing issue.";
        importedShowError(
          `Error: Could not process LLM response. Details: ${detailMessage}`,
        );
        SummaryPopup.enableChatButton(false);
      } else {
        lastModelUsed = model;
        SummaryPopup.updatePopupContent(summaryHtml);
        SummaryPopup.enableChatButton(true);
      }
    })
    .catch((err) => {
      console.error("[LLM Fetch Error]", err);
      lastSummary = `Error: ${err.message}`;
      importedShowError(`Error: ${err.message}`);
      SummaryPopup.enableChatButton(false);
    });
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

  chrome.runtime.sendMessage({ action: "getSettings" }, (config) => {
    if (chrome.runtime.lastError || config?.error) {
      importedShowError(
        `Error fetching settings: ${chrome.runtime.lastError?.message || config?.error}`,
      );
      SummaryPopup.updatePopupContent(
        `Error: Could not load settings: ${chrome.runtime.lastError?.message || config?.error}`,
      );
      FloatingIcon.removeFloatingIcon();
      Highlighter.removeSelectionHighlight();
      return;
    }

    if (DEBUG) {
      const configToLog = { ...config };
      if (configToLog.apiKey) configToLog.apiKey = "[API Key Hidden]";
      console.log(
        "[LLM Content] Settings received from background:",
        configToLog,
      );
    }

    let validationErrors = [];
    if (!config.apiKey) validationErrors.push("API Key is missing.");
    if (!config.model) validationErrors.push("Default Model is not selected.");
    if (validationErrors.length > 0) {
      importedShowError(
        "Errors in options! Required settings are missing or invalid:\n- " +
          validationErrors.join("\n- "),
      );
      SummaryPopup.updatePopupContent(
        "Errors in options! Please configure the extension options.",
      );
      FloatingIcon.removeFloatingIcon();
      Highlighter.removeSelectionHighlight();
      return;
    }

    DEBUG = !!config.debug;

    const stillSelectedElement = Highlighter.getSelectedElement();
    if (
      stillSelectedElement !== currentSelectedElement ||
      !document.body.contains(currentSelectedElement)
    ) {
      if (DEBUG)
        console.warn(
          "[LLM Content] Element selection changed or removed during settings load. Aborting.",
        );
      SummaryPopup.hidePopup();
      return;
    }

    SummaryPopup.updatePopupFlags(config.availableLanguages || []);

    try {
      const {
        PROMPT_STORAGE_KEY_CUSTOM_FORMAT,
        PROMPT_STORAGE_KEY_PREAMBLE,
        PROMPT_STORAGE_KEY_POSTAMBLE,
        PROMPT_STORAGE_KEY_DEFAULT_FORMAT,
      } = constants;

      const apiKey = config.apiKey;
      const model = config.model;
      const bulletCount = config.bulletCount;
      const availableLanguages = config.availableLanguages;

      const firstConfiguredLanguage = availableLanguages
        .map((name) => name.trim())
        .filter((name) => name !== "")
        .find((name) => findLanguageByName(name));
      const targetLanguageForSummary = firstConfiguredLanguage || "English";

      const customFormatInstructions = config[PROMPT_STORAGE_KEY_CUSTOM_FORMAT];
      const preambleTemplate = config[PROMPT_STORAGE_KEY_PREAMBLE];
      const postambleText = config[PROMPT_STORAGE_KEY_POSTAMBLE];
      const defaultFormatInstructions =
        config[PROMPT_STORAGE_KEY_DEFAULT_FORMAT];

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

      const systemPrompt = getSystemPrompt(
        bulletCount,
        customFormatInstructions,
        preambleTemplate,
        postambleText,
        defaultFormatInstructions,
        targetLanguageForSummary,
      );

      sendToLLM(htmlContent, apiKey, model, systemPrompt, availableLanguages);
    } catch (error) {
      console.error(
        "[LLM Content] Error processing settings or generating prompt:",
        error,
      );
      importedShowError(
        `Error processing selection: ${error.message || "Unknown error"}`,
      );
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
      importedShowError(
        "Error loading utility functions. Some features may not work.",
      );
    }
    const {
      tryParseJson: importedTryParseJsonFn,
      showError: importedShowErrorFn,
    } = utilsModule || {};
    importedTryParseJson = importedTryParseJsonFn;
    importedShowError = importedShowErrorFn;

    [Highlighter, FloatingIcon, SummaryPopup, constants] = await Promise.all([
      import(chrome.runtime.getURL("./highlighter.js")),
      import(chrome.runtime.getURL("./floatingIcon.js")),
      import(chrome.runtime.getURL("./summaryPopup.js")),
      import(chrome.runtime.getURL("./constants.js")),
    ]);
    if (DEBUG) console.log("[LLM Content] All modules loaded dynamically.");

    try {
      const languageDataResponse = await chrome.runtime.sendMessage({
        action: "getLanguageData",
      });
      if (chrome.runtime.lastError) throw chrome.runtime.lastError;
      if (languageDataResponse && languageDataResponse.ALL_LANGUAGE_NAMES_MAP) {
        ALL_LANGUAGE_NAMES_MAP = languageDataResponse.ALL_LANGUAGE_NAMES_MAP;
        svgPathPrefixUrl = languageDataResponse.SVG_PATH_PREFIX || "";
        fallbackSvgPathUrl = languageDataResponse.FALLBACK_SVG_PATH || "";
        if (DEBUG)
          console.log(
            `[LLM Content] Fetched ${Object.keys(ALL_LANGUAGE_NAMES_MAP).length} languages and SVG paths.`,
          );
      } else {
        throw new Error("Invalid language data response from background.");
      }
    } catch (error) {
      console.error("[LLM Content] Error fetching language data:", error);
      ALL_LANGUAGE_NAMES_MAP = {};
      svgPathPrefixUrl = "";
      fallbackSvgPathUrl = "";
    }

    Highlighter.initializeHighlighter({
      onElementSelected: handleElementSelected,
      onElementDeselected: handleElementDeselected,
      initialDebugState: DEBUG,
    });
    FloatingIcon.initializeFloatingIcon({ initialDebugState: DEBUG });
    SummaryPopup.initializePopupManager({
      languageData: {
        ALL_LANGUAGE_NAMES_MAP,
        svgPathPrefixUrl,
        fallbackSvgPathUrl,
      },
      initialDebugState: DEBUG,
    });

    console.log(`[LLM Content] Script Initialized (${VER}). Modules ready.`);
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

// Start the initialization process
initialize();
