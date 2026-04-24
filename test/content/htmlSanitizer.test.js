import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import domino from "@mixmark-io/domino";

import { sanitizeHtml } from "../../js/htmlSanitizer.js";

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

const installDom = () => {
  const document = domino.createDocument(
    "<!doctype html><html><head><title>Fixture</title></head><body></body></html>",
    "https://reader.example/articles/fixture",
  );
  const originalCreateElement = document.createElement.bind(document);

  Object.defineProperty(document, "createElement", {
    configurable: true,
    value(tagName) {
      return patchElementQuerySelectorAll(originalCreateElement(tagName));
    },
  });

  globalThis.document = document;
  globalThis.window = document.defaultView;

  return document;
};

test("sanitizeHtml removes scripts, event handlers, and unsafe URL protocols", () => {
  installDom();

  const sanitized = sanitizeHtml(readFixture("dangerous-selection.html"));

  assert.match(sanitized, /Useful body text remains/);
  assert.doesNotMatch(sanitized, /<script/i);
  assert.doesNotMatch(sanitized, /<style/i);
  assert.doesNotMatch(sanitized, /<iframe/i);
  assert.doesNotMatch(sanitized, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(sanitized, /javascript:/i);
  assert.doesNotMatch(sanitized, /data:text\/html/i);
  assert.doesNotMatch(sanitized, /srcdoc/i);
});

test("sanitizeHtml preserves representative article markup while removing clutter", () => {
  installDom();

  const sanitized = sanitizeHtml(readFixture("representative-article.html"));

  assert.match(sanitized, /<h1>Open standards make reader tools safer<\/h1>/);
  assert.match(sanitized, /<p>A compact article keeps the headline/);
  assert.match(sanitized, /<blockquote>Fixture coverage protects/);
  assert.match(sanitized, /<img alt="Adoption chart" width="640" height="360">/);
  assert.doesNotMatch(sanitized, /advertising/);
  assert.doesNotMatch(sanitized, /related-news/);
  assert.doesNotMatch(sanitized, /Footer boilerplate/);
  assert.doesNotMatch(sanitized, /data-testid/);
});

test("sanitizeHtml returns an empty string when only removable content remains", () => {
  installDom();

  const sanitized = sanitizeHtml(`
    <script>alert("x")</script>
    <style>body { color: red; }</style>
    <nav>Navigation</nav>
    <aside class="advertising">Ad</aside>
    <footer>Footer</footer>
  `);

  assert.equal(sanitized.trim(), "");
});
