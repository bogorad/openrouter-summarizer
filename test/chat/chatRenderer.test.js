import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import domino from "@mixmark-io/domino";
import { marked } from "marked";

import {
  formatChatModelLabel,
  renderChatMessages,
  renderStreamingPlaceholder,
} from "../../js/chat/chatRenderer.js";

const patchElementQuerySelectorAll = (element) => {
  const originalQuerySelectorAll = element.querySelectorAll.bind(element);

  Object.defineProperty(element, "querySelectorAll", {
    configurable: true,
    value(selector) {
      return Array.from(originalQuerySelectorAll(selector));
    },
  });

  return element;
};

const installDom = () => {
  const document = domino.createDocument(
    "<!doctype html><html><body><div id=\"target\"></div></body></html>",
    "https://reader.example/chat-renderer",
  );
  const originalCreateElement = document.createElement.bind(document);

  Object.defineProperty(document, "createElement", {
    configurable: true,
    value(tagName) {
      return patchElementQuerySelectorAll(originalCreateElement(tagName));
    },
  });

  globalThis.window = document.defaultView;
  globalThis.document = document;
  globalThis.Node = domino.impl.Node;
  globalThis.marked = marked;

  return patchElementQuerySelectorAll(document.getElementById("target"));
};

describe("chatRenderer", () => {
  let target;

  beforeEach(() => {
    target = installDom();
  });

  afterEach(() => {
    globalThis.window?.close?.();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.marked;
  });

  it("renders the empty chat state through the system message renderer", () => {
    renderChatMessages(target, { messages: [] });

    const systemMessage = target.querySelector(".msg.system-info");
    assert.ok(systemMessage);
    assert.equal(systemMessage.textContent, "Chat started. Ask a follow-up question...");
  });

  it("renders assistant, user, and system messages", () => {
    renderChatMessages(target, {
      messages: [
        { role: "assistant", content: "Summary", model: "model/a" },
        { role: "user", content: "What next?" },
        { role: "system", content: "Status" },
      ],
    });

    assert.equal(target.querySelector(".assistant-model-label").textContent, "Model: model/a");
    assert.equal(target.querySelector(".msg.assistant .assistant-inner").textContent.trim(), "Summary");
    assert.equal(target.querySelector(".msg.user").textContent.trim(), "What next?");
    assert.equal(target.querySelector(".msg.system-info").textContent, "Status");
  });

  it("renders array content as a sanitized list", () => {
    renderChatMessages(target, {
      messages: [
        {
          role: "assistant",
          content: ["**One**", "<img src=x onerror=alert(1)>Two"],
          model: "model/a",
        },
      ],
    });

    assert.equal(target.querySelectorAll("li").length, 2);
    assert.equal(target.querySelector("strong").textContent, "One");
    assert.equal(target.querySelector("img").hasAttribute("onerror"), false);
    assert.equal(target.querySelector("img").hasAttribute("src"), false);
    assert.match(target.textContent, /Two/);
  });

  it("preserves code fence rendering through the shared render target", () => {
    renderChatMessages(target, {
      messages: [
        {
          role: "assistant",
          content: "```js\nconsole.log('ok');\n```",
          model: "model/a",
        },
      ],
    });

    assert.ok(target.querySelector("pre"));
    assert.equal(target.querySelector("code").textContent.trim(), "console.log('ok');");
  });

  it("sanitizes HTML message content", () => {
    renderChatMessages(target, {
      messages: [
        {
          role: "assistant",
          content: "<p onclick=\"alert(1)\">Safe</p><script>alert(1)</script>",
          model: "model/a",
        },
      ],
    });

    const paragraph = target.querySelector("p");
    assert.equal(paragraph.textContent, "Safe");
    assert.equal(paragraph.hasAttribute("onclick"), false);
    assert.equal(Boolean(target.querySelector("script")), false);
  });

  it("renders streaming placeholders with the shared model label", () => {
    const placeholder = renderStreamingPlaceholder(target, { model: "model/b" });

    assert.equal(formatChatModelLabel("model/b"), "Model: model/b");
    assert.equal(placeholder.wrap, target);
    assert.equal(placeholder.modelLabel.textContent, "Model: model/b");
    assert.equal(placeholder.container.querySelector("#activeStreamSpan").textContent, "(...)");
    assert.equal(target.children.length, 2);
  });
});
