// js/chat/chatRenderer.js
// Renders chat messages and streaming placeholders using shared UI primitives.

import { createElement } from "../ui/dom.js";
import { renderTarget, RENDER_TARGET_MODES } from "../ui/renderTarget.js";

const EMPTY_CHAT_MESSAGE = "Chat started. Ask a follow-up question...";
const INVALID_MESSAGE_CONTENT = "[Error: Invalid message content]";
const STREAMING_PLACEHOLDER_TEXT = "(...)";

/**
 * Replaces element children without relying on newer DOM APIs.
 * @param {Element} target - Element receiving children.
 * @param {Node[]} children - New child nodes.
 * @returns {Element} Updated target.
 * @example Called by renderMessageContent() and renderChatMessages().
 */
const replaceElementChildren = (target, children = []) => {
  while (target.firstChild) {
    target.removeChild(target.firstChild);
  }

  children.forEach((child) => {
    target.appendChild(child);
  });

  return target;
};

/**
 * Formats a model id for display in assistant message labels.
 * @param {string} model - Model id to display.
 * @returns {string} User-facing model label.
 * @example Called by renderAssistantMessage() and renderStreamingPlaceholder().
 */
export const formatChatModelLabel = (model) => `Model: ${model || "Unknown"}`;

/**
 * Chooses the safest render mode for message strings.
 * @param {string} content - Message content.
 * @returns {string} Render target mode.
 * @example Called by renderMessageContent().
 */
const getStringRenderMode = (content) => {
  const trimmed = String(content || "").trimStart();
  return trimmed.startsWith("<")
    ? RENDER_TARGET_MODES.HTML
    : RENDER_TARGET_MODES.MARKDOWN;
};

/**
 * Creates a shared assistant model label.
 * @param {string} model - Model id to display.
 * @returns {HTMLElement} Model label element.
 * @example Called by assistant and streaming renderers.
 */
const createModelLabel = (model) => createElement("div", {
  className: "assistant-model-label",
  text: formatChatModelLabel(model),
});

/**
 * Renders a message content value into a target element.
 * @param {Element} target - Element receiving rendered content.
 * @param {string|string[]} content - Message content.
 * @returns {Element} Updated target.
 * @example Called by renderAssistantMessage() and renderUserMessage().
 */
const renderMessageContent = (target, content) => {
  if (Array.isArray(content)) {
    const list = createElement("ul");
    content.forEach((item) => {
      const listItem = createElement("li");
      renderTarget(listItem, {
        mode: getStringRenderMode(item),
        content: String(item || ""),
      });
      list.appendChild(listItem);
    });
    return replaceElementChildren(target, [list]);
  }

  if (typeof content === "string") {
    return renderTarget(target, {
      mode: getStringRenderMode(content),
      content,
    });
  }

  return renderTarget(target, {
    mode: RENDER_TARGET_MODES.TEXT,
    content: INVALID_MESSAGE_CONTENT,
  });
};

/**
 * Creates an assistant chat message element.
 * @param {Object} message - Chat message.
 * @returns {HTMLElement} Rendered assistant message.
 * @example Called by renderChatMessage().
 */
const renderAssistantMessage = (message) => {
  const contentSpan = createElement("span", {
    className: "assistant-inner",
  });
  renderMessageContent(contentSpan, message.content);

  const children = [];
  if (message.model) {
    children.push(createModelLabel(message.model));
  }
  children.push(contentSpan);

  return createElement("div", {
    className: ["msg", "assistant"],
    children,
  });
};

/**
 * Creates a user chat message element.
 * @param {Object} message - Chat message.
 * @returns {HTMLElement} Rendered user message.
 * @example Called by renderChatMessage().
 */
const renderUserMessage = (message) => {
  const messageDiv = createElement("div", {
    className: ["msg", "user"],
  });
  renderMessageContent(messageDiv, message.content);
  return messageDiv;
};

/**
 * Creates a system chat message element.
 * @param {Object} message - Chat message.
 * @returns {HTMLElement} Rendered system message.
 * @example Called by renderChatMessage() and renderEmptyChat().
 */
const renderSystemMessage = (message) => createElement("div", {
  className: ["msg", "system-info"],
  text: message.content,
});

/**
 * Creates an empty chat state message.
 * @returns {HTMLElement} Rendered empty state.
 * @example Called by renderChatMessages().
 */
const renderEmptyChat = () => renderSystemMessage({
  role: "system",
  content: EMPTY_CHAT_MESSAGE,
});

/**
 * Creates one chat message element.
 * @param {Object} message - Chat message.
 * @returns {HTMLElement} Rendered message.
 * @example Called by renderChatMessages().
 */
export const renderChatMessage = (message) => {
  if (message?.role === "assistant") {
    return renderAssistantMessage(message);
  }

  if (message?.role === "user") {
    return renderUserMessage(message);
  }

  return renderSystemMessage({
    ...message,
    content: message?.content || "",
  });
};

/**
 * Renders all chat messages into the supplied wrapper.
 * @param {Element} target - Message wrapper.
 * @param {Object} options - Render options.
 * @param {Object[]} options.messages - Chat messages.
 * @returns {Element} Updated target.
 * @example Called by chat.js renderMessages().
 */
export const renderChatMessages = (target, { messages = [] } = {}) => {
  if (!target) {
    throw new TypeError("renderChatMessages requires a target element.");
  }

  const renderedMessages = Array.isArray(messages) && messages.length > 0
    ? messages.map(renderChatMessage)
    : [renderEmptyChat()];

  return replaceElementChildren(target, renderedMessages);
};

/**
 * Renders a pending assistant response placeholder.
 * @param {Element} target - Message wrapper.
 * @param {Object} options - Render options.
 * @param {string} options.model - Model id for the pending response.
 * @returns {Object} Placeholder refs for lifecycle cleanup.
 * @example Called by chat.js sendChatRequestToBackground().
 */
export const renderStreamingPlaceholder = (target, { model = "" } = {}) => {
  if (!target) {
    throw new TypeError("renderStreamingPlaceholder requires a target element.");
  }

  const modelLabel = createModelLabel(model);
  const contentSpan = createElement("span", {
    className: "assistant-inner",
    attrs: { id: "activeStreamSpan" },
    text: STREAMING_PLACEHOLDER_TEXT,
  });
  const container = createElement("div", {
    className: ["msg", "assistant"],
    children: [contentSpan],
  });

  target.appendChild(modelLabel);
  target.appendChild(container);

  return {
    wrap: target,
    container,
    modelLabel,
  };
};
