// js/chat/chatControls.js
// Renders and handles chat quick prompts and translation language actions.

import { NOTIFICATION_TIMEOUT_MINOR_MS } from "../../constants.js";
import { createButton } from "../ui/buttons.js";
import { createElement } from "../ui/dom.js";

const getLastAssistantMessage = (messages) =>
  Array.isArray(messages)
    ? messages.slice().reverse().find((message) => message.role === "assistant")
    : null;

const getDataValue = (element, key) => {
  const attrName = String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return element?.dataset?.[key] || element?.getAttribute?.(`data-${attrName}`) || "";
};

/**
 * Extracts translatable text from the latest assistant message.
 * @param {Object[]} messages - Chat messages.
 * @returns {Object} Result with ok/text or error.
 * @example Called by chat language action handlers.
 */
export const getLastAssistantTextForTranslation = (messages) => {
  const lastAssistantMessage = getLastAssistantMessage(messages);

  if (!lastAssistantMessage?.content) {
    return { ok: false, error: "No previous assistant message to translate." };
  }

  if (Array.isArray(lastAssistantMessage.content)) {
    return { ok: true, text: lastAssistantMessage.content.join("\n") };
  }

  if (typeof lastAssistantMessage.content === "string") {
    return { ok: true, text: lastAssistantMessage.content };
  }

  return { ok: false, error: "Cannot translate: Invalid format of the last message." };
};

/**
 * Creates the chat controls controller used by chat.js.
 * @param {Object} options - Controller dependencies.
 * @returns {Object} Chat controls API.
 * @example Called by chat.js DOMContentLoaded initialization.
 */
export const createChatControls = ({
  languageFlagsContainer,
  quickPromptsContainer,
  chatState,
  buildTranslationRequest,
  queueAndSendUserMessage,
  showError,
  logger = console,
  isDebug = () => false,
} = {}) => {
  const languageCleanupFns = [];
  const quickPromptCleanupFns = [];

  const cleanup = () => {
    languageCleanupFns.splice(0).forEach((cleanupFn) => cleanupFn());
    quickPromptCleanupFns.splice(0).forEach((cleanupFn) => cleanupFn());
  };

  const cleanupLanguageButtons = () => {
    languageCleanupFns.splice(0).forEach((cleanupFn) => cleanupFn());
  };

  const cleanupQuickPromptButtons = () => {
    quickPromptCleanupFns.splice(0).forEach((cleanupFn) => cleanupFn());
  };

  const debugLog = (...args) => {
    if (isDebug()) logger.log(...args);
  };

  const renderLanguageFlags = () => {
    if (!languageFlagsContainer) {
      logger.error("[LLM Chat] Language flags container not found.");
      return;
    }

    cleanupLanguageButtons();
    languageFlagsContainer.innerHTML = "";

    const { language_info } = chatState.getState();
    if (!Array.isArray(language_info) || language_info.length === 0) {
      debugLog("[LLM Chat] No configured languages to render flags.");
      return;
    }

    debugLog("[LLM Chat] Rendering language flags:", language_info);

    language_info.forEach((langInfo) => {
      const languageName = langInfo.language_name || "";
      const flagImg = createElement("img", {
        className: "language-flag",
        attrs: {
          src: langInfo.svg_path || "",
          alt: `${languageName} flag`,
        },
      });
      flagImg.style.pointerEvents = "none";

      const { element, cleanup: cleanupButton } = createButton({
        title: `Translate last assistant message to ${languageName}`,
        ariaLabel: `Translate last assistant message to ${languageName}`,
        className: "language-flag-button",
        dataset: { languageName },
        children: [flagImg],
        onClick: handleFlagButtonClick,
      });

      languageCleanupFns.push(cleanupButton);
      languageFlagsContainer.appendChild(element);
    });
  };

  const renderQuickPromptButtons = () => {
    if (!quickPromptsContainer) {
      logger.error("[LLM Chat] Quick prompts container not found.");
      return;
    }

    cleanupQuickPromptButtons();
    quickPromptsContainer.innerHTML = "";

    const { chatQuickPrompts, streaming } = chatState.getState();
    if (!Array.isArray(chatQuickPrompts) || chatQuickPrompts.length === 0) {
      return;
    }

    chatQuickPrompts.forEach((quickPrompt) => {
      const { element, cleanup: cleanupButton } = createButton({
        label: quickPrompt.title,
        title: quickPrompt.prompt,
        className: "quick-prompt-button",
        disabled: streaming,
        dataset: { quickPrompt: quickPrompt.prompt },
        onClick: handleQuickPromptButtonClick,
      });

      quickPromptCleanupFns.push(cleanupButton);
      quickPromptsContainer.appendChild(element);
    });
  };

  function handleFlagButtonClick(event) {
    const { messages, streaming } = chatState.getState();
    if (streaming) {
      debugLog("[LLM Chat] Flag click ignored: Chat is currently streaming.");
      showError(
        "Chat is busy. Please wait for the current response to finish.",
        false,
        NOTIFICATION_TIMEOUT_MINOR_MS,
      );
      return;
    }

    const targetLanguage = getDataValue(event.currentTarget, "languageName");
    if (!targetLanguage) {
      logger.error("[LLM Chat] Flag button missing language name data.");
      showError("Error: Could not determine target language for translation.");
      return;
    }

    const translationText = getLastAssistantTextForTranslation(messages);
    if (!translationText.ok) {
      showError(translationText.error, false);
      debugLog("[LLM Chat] Cannot translate:", translationText.error);
      return;
    }

    debugLog(
      `[LLM Chat] Flag clicked for translation to: ${targetLanguage}. Text to translate:`,
      translationText.text.substring(0, 200) +
        (translationText.text.length > 200 ? "..." : ""),
    );

    queueAndSendUserMessage(
      buildTranslationRequest(targetLanguage, translationText.text),
    );
  }

  function handleQuickPromptButtonClick(event) {
    const quickPromptText = getDataValue(event.currentTarget, "quickPrompt");
    if (!quickPromptText) {
      logger.error("[LLM Chat] Quick prompt button missing prompt text.");
      showError("Error: Could not load this quick prompt.");
      return;
    }

    queueAndSendUserMessage(quickPromptText);
  }

  const setQuickPromptButtonsBusy = (isBusy) => {
    if (!quickPromptsContainer) return;

    quickPromptsContainer
      .querySelectorAll(".quick-prompt-button")
      .forEach((button) => {
        button.disabled = isBusy;
        button.classList.toggle("quick-prompt-button-busy", isBusy);
      });
  };

  const setLanguageFlagButtonsBusy = (isBusy) => {
    if (!languageFlagsContainer) return;

    languageFlagsContainer
      .querySelectorAll(".language-flag-button")
      .forEach((button) => {
        button.classList.toggle("language-flag-button-busy", isBusy);
        button.title = isBusy
          ? "Chat is busy, cannot translate now"
          : `Translate last assistant message to ${getDataValue(button, "languageName")}`;
      });
  };

  const setBusy = (isBusy) => {
    setQuickPromptButtonsBusy(isBusy);
    setLanguageFlagButtonsBusy(isBusy);
  };

  return {
    cleanup,
    renderLanguageFlags,
    renderQuickPromptButtons,
    setBusy,
  };
};
