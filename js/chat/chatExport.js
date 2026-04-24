// js/chat/chatExport.js
// Short Spec: Formats and exports chat messages for Markdown, clipboard, and JSON downloads.
// Called from: chat.js export button handlers.

const INVALID_MESSAGE_CONTENT = "[Invalid message content]";

/**
 * Converts message content to the same plain text shape used by chat rendering/export.
 * @param {string|string[]} content - Message content from chat state.
 * @returns {string} Plain text content.
 * @example Called by formatChatMessageAsMarkdown() and serializeChatMessages().
 */
export const normalizeChatMessageContent = (content) => {
  if (Array.isArray(content)) {
    return content.join("\n");
  }

  if (typeof content === "string") {
    return content;
  }

  return INVALID_MESSAGE_CONTENT;
};

/**
 * Formats one chat message as Markdown.
 * @param {Object} message - Chat message with role, content, and optional model.
 * @returns {string} Markdown section for the message.
 * @example Called by formatChatAsMarkdown().
 */
export const formatChatMessageAsMarkdown = (message = {}) => {
  const contentString = normalizeChatMessageContent(message.content);

  if (message.role === "user") {
    return `**User:**\n${contentString}`;
  }

  if (message.role === "assistant") {
    return `**Assistant (${message.model || "Unknown"}):**\n${contentString}`;
  }

  return `**System:**\n${contentString}`;
};

/**
 * Formats chat messages as Markdown content.
 * @param {Object[]} messages - Chat messages from chat state.
 * @returns {string} Markdown document body.
 * @example Called by handleDownloadMd() and handleCopyMd() in chat.js.
 */
export const formatChatAsMarkdown = (messages = []) => (
  Array.isArray(messages)
    ? messages.map(formatChatMessageAsMarkdown).join("\n\n---\n\n")
    : ""
);

/**
 * Serializes chat messages for JSON export.
 * @param {Object[]} messages - Chat messages from chat state.
 * @returns {Object[]} JSON-safe message objects.
 * @example Called by formatChatAsJson().
 */
export const serializeChatMessages = (messages = []) => (
  Array.isArray(messages)
    ? messages.map((message) => ({
      ...message,
      content: normalizeChatMessageContent(message.content),
    }))
    : []
);

/**
 * Formats chat messages as a JSON document.
 * @param {Object[]} messages - Chat messages from chat state.
 * @returns {string} Pretty-printed JSON document body.
 * @example Called by handleDownloadJson() in chat.js.
 */
export const formatChatAsJson = (messages = []) => (
  JSON.stringify(serializeChatMessages(messages), null, 2)
);

/**
 * Downloads text content as a file in the browser.
 * @param {string} filename - Download filename.
 * @param {string} mimeType - Blob MIME type.
 * @param {string} content - File content.
 * @returns {void}
 * @example Called by downloadChatMarkdown() and downloadChatJson().
 */
export const downloadTextFile = (filename, mimeType, content) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

/**
 * Downloads chat messages as Markdown.
 * @param {Object[]} messages - Chat messages from chat state.
 * @returns {void}
 * @example Called by handleDownloadMd() in chat.js.
 */
export const downloadChatMarkdown = (messages = []) => {
  downloadTextFile("chat.md", "text/markdown", formatChatAsMarkdown(messages));
};

/**
 * Downloads chat messages as JSON.
 * @param {Object[]} messages - Chat messages from chat state.
 * @returns {void}
 * @example Called by handleDownloadJson() in chat.js.
 */
export const downloadChatJson = (messages = []) => {
  downloadTextFile("chat.json", "application/json", formatChatAsJson(messages));
};

/**
 * Copies chat messages as Markdown.
 * @param {Object[]} messages - Chat messages from chat state.
 * @param {Clipboard} clipboard - Clipboard implementation.
 * @returns {Promise<void>} Resolves after clipboard write.
 * @example Called by handleCopyMd() in chat.js.
 */
export const copyChatMarkdown = (messages = [], clipboard = navigator.clipboard) => (
  clipboard.writeText(formatChatAsMarkdown(messages))
);
