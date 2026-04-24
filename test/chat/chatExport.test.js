import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatChatAsJson,
  formatChatAsMarkdown,
  normalizeChatMessageContent,
  serializeChatMessages,
} from "../../js/chat/chatExport.js";

describe("chatExport", () => {
  it("formats chat messages as Markdown with assistant model labels", () => {
    const markdown = formatChatAsMarkdown([
      { role: "user", content: "Explain this" },
      { role: "assistant", content: ["One", "Two"], model: "model/a" },
      { role: "system", content: "Status" },
    ]);

    assert.equal(markdown, [
      "**User:**\nExplain this",
      "**Assistant (model/a):**\nOne\nTwo",
      "**System:**\nStatus",
    ].join("\n\n---\n\n"));
  });

  it("serializes chat messages for JSON export", () => {
    const messages = serializeChatMessages([
      { role: "assistant", content: ["One", "Two"], model: "model/a" },
    ]);

    assert.deepEqual(messages, [
      { role: "assistant", content: "One\nTwo", model: "model/a" },
    ]);
    assert.equal(formatChatAsJson(messages), JSON.stringify(messages, null, 2));
  });

  it("normalizes invalid message content consistently", () => {
    assert.equal(normalizeChatMessageContent({ bad: true }), "[Invalid message content]");
  });
});
