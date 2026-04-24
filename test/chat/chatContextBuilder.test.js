import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildApiMessages,
  buildTranslationRequest,
  truncateSnippet,
} from "../../js/chat/chatContextBuilder.js";

describe("chatContextBuilder", () => {
  it("builds first-message context with original snippet and summary", () => {
    const messages = [{ role: "user", content: "What matters here?" }];
    const apiMessages = buildApiMessages("What matters here?", messages, {
      domSnippet: "<article>Primary source</article>",
      summary: "Summary text",
    });

    assert.equal(apiMessages.length, 3);
    assert.equal(apiMessages[0].role, "system");
    assert.equal(apiMessages[1].role, "user");
    assert.match(apiMessages[1].content, /Context - Original HTML Snippet:/);
    assert.match(apiMessages[1].content, /<article>Primary source<\/article>/);
    assert.match(apiMessages[1].content, /Initial Summary:\nSummary text/);
    assert.deepEqual(apiMessages[2], {
      role: "user",
      content: "What matters here?",
    });
  });

  it("builds follow-up context with recent chat history", () => {
    const messages = [
      { role: "assistant", content: "Initial summary", model: "summary/model" },
      { role: "user", content: "First question" },
      { role: "assistant", content: ["First", "answer"] },
      { role: "user", content: "Follow-up question" },
    ];

    const apiMessages = buildApiMessages("Follow-up question", messages, {
      domSnippet: "<main>Article body</main>",
      summary: "Initial summary",
    });

    assert.equal(apiMessages.length, 5);
    assert.match(apiMessages[1].content, /<main>Article body<\/main>/);
    assert.doesNotMatch(apiMessages[1].content, /Initial Summary:/);
    assert.deepEqual(apiMessages.slice(2), [
      { role: "user", content: "First question" },
      { role: "assistant", content: "First\nanswer" },
      { role: "user", content: "Follow-up question" },
    ]);
  });

  it("truncates long snippets for follow-up context", () => {
    const longSnippet = "x".repeat(12);

    assert.equal(truncateSnippet(longSnippet, 5), "xxxxx[...truncated]");
  });

  it("handles missing summary without leaking nullish text", () => {
    const apiMessages = buildApiMessages("Question", [
      { role: "user", content: "Question" },
    ], {
      domSnippet: "<section>No summary</section>",
      summary: null,
    });

    assert.match(apiMessages[1].content, /Initial Summary:\n$/);
    assert.doesNotMatch(apiMessages[1].content, /null|undefined/);
  });

  it("limits follow-up history to the ten most recent prior messages", () => {
    const priorMessages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message ${index}`,
    }));
    const messages = [
      { role: "assistant", content: "Initial summary" },
      ...priorMessages,
      { role: "user", content: "Latest" },
    ];

    const apiMessages = buildApiMessages("Latest", messages, {
      domSnippet: "<article>Body</article>",
      summary: "Initial summary",
    });
    const history = apiMessages.slice(2, -1);

    assert.equal(history.length, 10);
    assert.equal(history[0].content, "message 2");
    assert.equal(history[9].content, "message 11");
    assert.deepEqual(apiMessages.at(-1), { role: "user", content: "Latest" });
  });

  it("builds translation prompts for language flag actions", () => {
    const userMessage = buildTranslationRequest("Spanish", ["Hello", "World"]);

    assert.equal(
      userMessage,
      "Translate the following text to Spanish and let's continue our conversation in that language: \n\nHello\nWorld",
    );
  });
});
