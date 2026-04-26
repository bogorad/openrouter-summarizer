import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildNewsblurShareContent } from "../../js/integrations/newsblurShareContent.js";

describe("newsblurShareContent", () => {
  it("keeps the previous content shape when the preface is disabled", () => {
    const content = buildNewsblurShareContent({
      summaryHtml: "<ul><li>Summary</li></ul>",
      newsblurStoryHtml: "<article>Story</article>",
      prefaceEnabled: false,
      prefaceTemplate: "LLM (@LLMNAME@) says:",
      modelName: "openai/gpt-4.1-mini",
    });

    assert.equal(
      content,
      "<ul><li>Summary</li></ul><hr><article>Story</article>",
    );
  });

  it("keeps the previous content shape when the preface template is blank", () => {
    const content = buildNewsblurShareContent({
      summaryHtml: "<p>Summary</p>",
      newsblurStoryHtml: "<article>Story</article>",
      prefaceEnabled: true,
      prefaceTemplate: "   ",
      modelName: "openai/gpt-4.1-mini",
    });

    assert.equal(content, "<p>Summary</p><hr><article>Story</article>");
  });

  it("adds the rendered model preface when enabled", () => {
    const content = buildNewsblurShareContent({
      summaryHtml: "<ul><li>Summary</li></ul>",
      newsblurStoryHtml: "<article>Story</article>",
      prefaceEnabled: true,
      prefaceTemplate: "LLM (@LLMNAME@) says:",
      modelName: "openai/gpt-4.1-mini",
    });

    assert.equal(
      content,
      "<p>LLM (openai/gpt-4.1-mini) says:</p>" +
        "<ul><li>Summary</li></ul><hr><article>Story</article>",
    );
  });

  it("replaces every model placeholder occurrence", () => {
    const content = buildNewsblurShareContent({
      summaryHtml: "<p>S</p>",
      newsblurStoryHtml: "<p>B</p>",
      prefaceEnabled: true,
      prefaceTemplate: "@LLMNAME@ / @LLMNAME@:",
      modelName: "model/x",
    });

    assert.match(content, /^<p>model\/x \/ model\/x:<\/p>/);
  });

  it("escapes HTML in the user-controlled template", () => {
    const content = buildNewsblurShareContent({
      summaryHtml: "<p>S</p>",
      newsblurStoryHtml: "<p>B</p>",
      prefaceEnabled: true,
      prefaceTemplate: "<script>alert(1)</script> @LLMNAME@",
      modelName: "model/x",
    });

    assert.match(
      content,
      /^<p>&lt;script&gt;alert\(1\)&lt;\/script&gt; model\/x<\/p>/,
    );
  });

  it("uses Unknown when no model name is available", () => {
    const content = buildNewsblurShareContent({
      summaryHtml: "<p>S</p>",
      newsblurStoryHtml: "<p>B</p>",
      prefaceEnabled: true,
      prefaceTemplate: "LLM (@LLMNAME@) says:",
      modelName: "",
    });

    assert.match(content, /^<p>LLM \(Unknown\) says:<\/p>/);
  });
});
