// js/chat/chatContextBuilder.js
/**
 * Short Spec: Builds OpenRouter chat request messages from chat state.
 * Called from: chat.js and chat context builder unit tests.
 */

import {
  CHAT_SYSTEM_PROMPT_TEMPLATE,
  CHAT_TRANSLATION_REQUEST_TEMPLATE,
  CHAT_USER_CONTEXT_TEMPLATE,
  SNIPPET_TRUNCATION_LIMIT,
} from "../../constants.js";

const RECENT_HISTORY_LIMIT = 10;
const TRUNCATION_SUFFIX = "[...truncated]";

/**
 * Converts message content or context values into API-safe text.
 * @param {*} value - Message content or context value.
 * @returns {string} Text content for API messages.
 */
const formatText = (value) => {
  if (Array.isArray(value)) {
    return value.map(formatText).join("\n");
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
};

/**
 * Truncates a DOM snippet when it exceeds the chat context limit.
 * @param {*} domSnippet - DOM snippet from session context.
 * @param {number} limit - Maximum untruncated snippet length.
 * @returns {string} Snippet text for the API context block.
 */
export const truncateSnippet = (
  domSnippet,
  limit = SNIPPET_TRUNCATION_LIMIT,
) => {
  const snippet = formatText(domSnippet);

  if (snippet.length <= limit) {
    return snippet;
  }

  return `${snippet.substring(0, limit)}${TRUNCATION_SUFFIX}`;
};

/**
 * Creates the context message used for the first user request.
 * @param {object} chatContext - DOM snippet and summary context.
 * @returns {object} User-role API message containing context.
 */
export const buildFirstMessageContext = (chatContext = {}) => ({
  role: "user",
  content: CHAT_USER_CONTEXT_TEMPLATE
    .replace("${domSnippet}", formatText(chatContext.domSnippet))
    .replace("${summary}", formatText(chatContext.summary)),
});

/**
 * Creates the condensed context message used for follow-up requests.
 * @param {object} chatContext - DOM snippet and summary context.
 * @returns {object} User-role API message containing truncated context.
 */
export const buildFollowUpContext = (chatContext = {}) => ({
  role: "user",
  content: CHAT_USER_CONTEXT_TEMPLATE
    .replace("${domSnippet}", truncateSnippet(chatContext.domSnippet))
    .replace("\n\nInitial Summary:\n${summary}", ""),
});

/**
 * Selects recent user and assistant messages before the latest queued user message.
 * @param {Array} messages - Current chat messages, including the latest user message.
 * @returns {Array} API-safe recent history messages.
 */
export const selectRecentHistory = (messages = []) => {
  const priorMessages = Array.isArray(messages) ? messages.slice(0, -1) : [];
  const historyWithoutInitialSummary = priorMessages[0]?.role === "assistant"
    ? priorMessages.slice(1)
    : priorMessages;

  return historyWithoutInitialSummary
    .filter((message) => message?.role === "user" || message?.role === "assistant")
    .slice(-RECENT_HISTORY_LIMIT)
    .map((message) => ({
      role: message.role,
      content: formatText(message.content),
    }));
};

/**
 * Builds the array of messages sent to the chat API.
 * @param {string} userText - The latest message from the user.
 * @param {Array} messages - Chat history including the latest user message.
 * @param {object} chatContext - DOM snippet and summary context.
 * @returns {Array} API request messages.
 */
export const buildApiMessages = (userText, messages = [], chatContext = {}) => {
  const apiMessages = [{ role: "system", content: CHAT_SYSTEM_PROMPT_TEMPLATE }];
  const userMessageCount = Array.isArray(messages)
    ? messages.filter((message) => message?.role === "user").length
    : 0;

  if (userMessageCount === 1) {
    return [
      ...apiMessages,
      buildFirstMessageContext(chatContext),
      { role: "user", content: formatText(userText) },
    ];
  }

  return [
    ...apiMessages,
    buildFollowUpContext(chatContext),
    ...selectRecentHistory(messages),
    { role: "user", content: formatText(userText) },
  ];
};

/**
 * Builds the user message used by translation flag actions.
 * @param {string} targetLanguage - Translation target language name.
 * @param {*} textToTranslate - Assistant message content to translate.
 * @returns {string} Prompt text for the queued user message.
 */
export const buildTranslationRequest = (targetLanguage, textToTranslate) => (
  CHAT_TRANSLATION_REQUEST_TEMPLATE
    .replace("${targetLanguage}", formatText(targetLanguage))
    .replace("${textToTranslate}", formatText(textToTranslate))
);
