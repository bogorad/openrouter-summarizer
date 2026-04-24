// js/ui/renderTarget.js
// Shared render target helpers for plain text, Markdown, and sanitized HTML.

import { sanitizeHtml, sanitizeInertText } from "../htmlSanitizer.js";
import { setSanitizedHtml, setText } from "./dom.js";

const MARKDOWN_ALLOWED_TAGS = [
  "b", "i", "em", "strong", "p", "br", "ul", "ol", "li",
  "blockquote", "pre", "code", "h1", "h2", "h3", "h4", "h5", "h6"
];
const MARKDOWN_ALLOWED_ATTR = ["title", "class"];

export const RENDER_TARGET_MODES = Object.freeze({
  TEXT: "text",
  MARKDOWN: "markdown",
  HTML: "html",
  ALREADY_SANITIZED_HTML: "alreadySanitizedHtml"
});

/**
 * Gets the page-provided marked parser when it is available.
 * @returns {Object|null} Global marked API or null.
 * @example Called by markdownToSanitizedHtml().
 */
const getMarked = () => {
  const markedApi = globalThis.marked;
  if (!markedApi || typeof markedApi.parse !== "function") return null;
  return markedApi;
};

/**
 * Gets the page-provided DOMPurify sanitizer when it is available.
 * @returns {Object|null} Global DOMPurify API or null.
 * @example Called by sanitizeMarkdownHtml().
 */
const getDOMPurify = () => {
  const domPurifyApi = globalThis.DOMPurify;
  if (!domPurifyApi || typeof domPurifyApi.sanitize !== "function") return null;
  return domPurifyApi;
};

/**
 * Sanitizes Markdown-rendered HTML with DOMPurify when present, then falls back
 * to the centralized sanitizer.
 * @param {string} html - Markdown-rendered HTML.
 * @returns {string} Sanitized HTML.
 * @example Called by markdownToSanitizedHtml().
 */
const sanitizeMarkdownHtml = (html) => {
  const domPurifyApi = getDOMPurify();
  if (domPurifyApi) {
    return domPurifyApi.sanitize(html, {
      ALLOWED_TAGS: MARKDOWN_ALLOWED_TAGS,
      ALLOWED_ATTR: MARKDOWN_ALLOWED_ATTR
    });
  }

  return sanitizeHtml(html);
};

/**
 * Converts Markdown to sanitized HTML, or inert text when Markdown rendering is
 * unavailable or fails.
 * @param {string} markdown - Markdown source.
 * @returns {string} Sanitized HTML or escaped inert text.
 * @example Called by renderMarkdown().
 */
export const markdownToSanitizedHtml = (markdown) => {
  if (typeof markdown !== "string" || !markdown.trim()) return "";

  const markedApi = getMarked();
  if (!markedApi) return sanitizeInertText(markdown);

  try {
    return sanitizeMarkdownHtml(markedApi.parse(markdown, { sanitize: false }));
  } catch (error) {
    return sanitizeInertText(markdown);
  }
};

/**
 * Renders plain text without interpreting markup.
 * @param {Element} target - Element receiving content.
 * @param {string|number|null|undefined} text - Text value to render.
 * @returns {Element} Updated target.
 * @example Called by renderTarget() and screen renderers.
 */
export const renderPlainText = (target, text) => setText(target, text);

/**
 * Renders Markdown through marked when available and sanitizes the result.
 * @param {Element} target - Element receiving content.
 * @param {string} markdown - Markdown source.
 * @returns {Element} Updated target.
 * @example Called by renderTarget() and screen renderers.
 */
export const renderMarkdown = (target, markdown) => {
  if (!target) {
    throw new TypeError("renderMarkdown requires a target element.");
  }

  target.innerHTML = markdownToSanitizedHtml(markdown);
  return target;
};

/**
 * Renders raw HTML after applying the centralized display sanitizer.
 * @param {Element} target - Element receiving content.
 * @param {string} html - Raw HTML source.
 * @returns {Element} Updated target.
 * @example Called by renderTarget() and screen renderers.
 */
export const renderSanitizedHtml = (target, html) => setSanitizedHtml(target, html);

/**
 * Renders HTML that a caller has already sanitized.
 * @param {Element} target - Element receiving content.
 * @param {string} html - Already-sanitized HTML.
 * @returns {Element} Updated target.
 * @example Called by renderTarget() only with trusted sanitizer output.
 */
export const renderAlreadySanitizedHtml = (target, html) => {
  if (!target) {
    throw new TypeError("renderAlreadySanitizedHtml requires a target element.");
  }

  target.innerHTML = String(html || "");
  return target;
};

/**
 * Renders content using an explicit safe rendering mode.
 * @param {Element} target - Element receiving content.
 * @param {Object} options - Render options.
 * @param {string} options.mode - Rendering mode from RENDER_TARGET_MODES.
 * @param {string|number|null|undefined} options.content - Content to render.
 * @returns {Element} Updated target.
 * @example Called by screen renderers that choose a render mode at runtime.
 */
export const renderTarget = (target, options = {}) => {
  const { mode = RENDER_TARGET_MODES.TEXT, content = "" } = options;

  if (mode === RENDER_TARGET_MODES.MARKDOWN) {
    return renderMarkdown(target, String(content || ""));
  }

  if (mode === RENDER_TARGET_MODES.HTML) {
    return renderSanitizedHtml(target, String(content || ""));
  }

  if (mode === RENDER_TARGET_MODES.ALREADY_SANITIZED_HTML) {
    return renderAlreadySanitizedHtml(target, String(content || ""));
  }

  return renderPlainText(target, content);
};
