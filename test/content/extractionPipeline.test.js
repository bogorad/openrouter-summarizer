import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import domino from "@mixmark-io/domino";

const readFixture = (name) => readFileSync(
  new URL(`../fixtures/content/${name}`, import.meta.url),
  "utf8",
);

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

const createFixtureDocument = (bodyHtml = "") => {
  const document = domino.createDocument(
    `<!doctype html><html><head><title>Reader Fixture</title></head><body>${bodyHtml}</body></html>`,
    "https://reader.example/articles/open-standards",
  );
  const originalCreateElement = document.createElement.bind(document);

  Object.defineProperty(document, "createElement", {
    configurable: true,
    value(tagName) {
      return patchElementQuerySelectorAll(originalCreateElement(tagName));
    },
  });

  return document;
};

let extractArtifactsFromSelectedElement;

before(async () => {
  const document = createFixtureDocument();
  globalThis.document = document;
  globalThis.window = document.defaultView;

  const module = await import("../../js/content/extractionPipeline.js");
  extractArtifactsFromSelectedElement = module.extractArtifactsFromSelectedElement;
});

test("extractArtifactsFromSelectedElement creates summary and sharing artifacts from article markup", () => {
  const document = createFixtureDocument(readFixture("representative-article.html"));
  globalThis.document = document;
  globalThis.window = document.defaultView;

  const element = document.getElementById("story");
  const artifacts = extractArtifactsFromSelectedElement(element, {
    document,
    sourceUrl: "https://reader.example/articles/open-standards",
    title: "Reader Fixture",
    chatSnippetMaxLength: 120,
  });

  assert.equal(artifacts.sourceUrl, "https://reader.example/articles/open-standards");
  assert.equal(artifacts.title, "Reader Fixture");
  assert.equal(artifacts.sourceElement.tagName, "article");
  assert.equal(artifacts.sourceElement.id, "story");

  assert.match(artifacts.llmMarkdown, /# Open standards make reader tools safer/);
  assert.match(artifacts.llmMarkdown, /A compact article keeps the headline/);
  assert.match(artifacts.llmMarkdown, /> Fixture coverage protects the extraction contract\./);

  assert.match(artifacts.safeHtml, /<h1>Open standards make reader tools safer<\/h1>/);
  assert.match(artifacts.safeHtml, /<blockquote>Fixture coverage protects/);
  assert.doesNotMatch(artifacts.safeHtml, /advertising|related-news|Footer boilerplate/);
  assert.equal(artifacts.joplinNoteBodyHtml, artifacts.safeHtml);
  assert.equal(artifacts.newsblurStoryHtml, artifacts.safeHtml);

  assert.match(artifacts.rawHtml.value, /<article id="story"/);
  assert.match(artifacts.plainText, /Open standards make reader tools safer/);
  assert.match(artifacts.chatSnippet, /^<article id="story"/);
  assert.ok(artifacts.chatSnippet.length <= 120);
  assert.ok(artifacts.estimatedTokens > 0);
  assert.deepEqual(artifacts.warnings, ["Chat snippet truncated to 120 characters."]);
});

test("extractArtifactsFromSelectedElement reports empty sanitizer output without unsafe sharing HTML", () => {
  const document = createFixtureDocument(`
    <section id="empty-selection">
      <script>alert("x")</script>
      <style>body { display: none; }</style>
      <aside class="advertising">Advertisement</aside>
    </section>
  `);
  globalThis.document = document;
  globalThis.window = document.defaultView;

  const artifacts = extractArtifactsFromSelectedElement(
    document.getElementById("empty-selection"),
    { document },
  );

  assert.equal(artifacts.safeHtml.trim(), "");
  assert.equal(artifacts.joplinNoteBodyHtml.trim(), "");
  assert.equal(artifacts.newsblurStoryHtml.trim(), "");
  assert.equal(artifacts.llmMarkdown.trim(), "");
  assert.match(artifacts.rawHtml.value, /<section id="empty-selection">/);
  assert.match(artifacts.chatSnippet, /<section id="empty-selection">/);
  assert.ok(artifacts.warnings.includes("Selected element has no sanitized HTML content."));
  assert.ok(artifacts.warnings.includes("Selected element has no sanitized inner content."));
});
