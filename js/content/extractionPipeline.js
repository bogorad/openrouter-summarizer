/**
 * Selected-element extraction pipeline.
 *
 * This module converts a selected DOM element into normalized content
 * artifacts without changing current content-script callers.
 */

import TurndownService from "turndown";
import { MIN_MARKDOWN_LENGTH, TOKENS_PER_CHAR } from "../../constants.js";
import { sanitizeHtml } from "../htmlSanitizer.js";
import {
  createContentArtifacts,
  createSourceElementMetadata,
} from "./contentArtifacts.js";

export {
  applyCostTruncationPolicy,
  createCharacterTokenEstimatePolicy,
  TRUNCATION_DECISIONS,
} from "./truncationPolicy.js";

const COMMON_HTML_TAG_PATTERN = /<\s*(p|div|span|br|ul|ol|li|a|img|h[1-6]|pre|code|table|thead|tbody|tr|td|th|blockquote|strong|b|em|i|section|article|header|footer|nav|figure|figcaption|hr)\b/i;
const EMPTY_CONTAINER_HTML = "<div></div>";
const DEFAULT_CHAT_SNIPPET_LENGTH = 12000;

const normalizeString = (value) => (typeof value === "string" ? value : "");

/**
 * Returns true when the DOM element contract needed for extraction is present.
 * @param {*} element - Candidate selected element.
 * @returns {boolean} Whether the value exposes DOM element-like fields.
 */
export const isElementLike = (element) => Boolean(
  element
    && typeof element === "object"
    && typeof element.tagName === "string"
);

/**
 * Checks whether a string still contains structural HTML after sanitization.
 * @param {string} input - HTML or text content.
 * @returns {boolean} Whether common HTML tags are present.
 */
export const containsCommonHtmlTags = (input) => COMMON_HTML_TAG_PATTERN.test(
  normalizeString(input),
);

/**
 * Creates source metadata from the selected DOM element.
 * @param {Element} element - Selected DOM element.
 * @returns {object} Normalized source element metadata.
 */
export const getSourceElementMetadata = (element) => {
  if (!isElementLike(element)) return createSourceElementMetadata();

  const textContent = normalizeString(element.textContent || element.innerText);
  const rawHtml = normalizeString(element.outerHTML);

  return createSourceElementMetadata({
    tagName: element.tagName,
    id: element.id,
    className: typeof element.className === "string" ? element.className : "",
    textLength: textContent.length,
    htmlLength: rawHtml.length,
  });
};

/**
 * Gets source page metadata from explicit options or a document context.
 * @param {object} context - Extraction context.
 * @param {Document} context.document - Document that owns the selected element.
 * @param {string} context.sourceUrl - Explicit source URL override.
 * @param {string} context.title - Explicit title override.
 * @returns {object} Source page metadata.
 */
export const getSourcePageMetadata = (context = {}) => {
  const contextDocument = context.document;
  const contextWindow = context.window;
  const sourceUrl = normalizeString(context.sourceUrl)
    || normalizeString(contextDocument?.location?.href)
    || normalizeString(contextWindow?.location?.href);
  const title = normalizeString(context.title)
    || normalizeString(contextDocument?.title);

  return { sourceUrl, title };
};

/**
 * Captures raw selected-element HTML for downstream sharing and chat context.
 * @param {Element} element - Selected DOM element.
 * @returns {object} Raw outer and inner HTML strings.
 */
export const getElementHtml = (element) => {
  if (!isElementLike(element)) {
    return {
      outerHtml: "",
      innerHtml: "",
    };
  }

  return {
    outerHtml: normalizeString(element.outerHTML),
    innerHtml: normalizeString(element.innerHTML),
  };
};

/**
 * Extracts plain text from the selected DOM element.
 * @param {Element} element - Selected DOM element.
 * @returns {string} Trimmed plain text.
 */
export const getElementPlainText = (element) => {
  if (!isElementLike(element)) return "";

  return normalizeString(element.textContent || element.innerText)
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Creates the configured Turndown instance used by pageInteraction today.
 * @returns {TurndownService} Configured Turndown service.
 */
export const createMarkdownConverter = () => {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  turndown.remove(["script", "style", "nav", "aside", "footer", "header", "form"]);
  turndown.addRule("removeEmptyElements", {
    filter(node) {
      return (node.nodeName === "DIV" || node.nodeName === "SPAN")
        && !normalizeString(node.textContent).trim()
        && !node.querySelector("img, video, audio, iframe");
    },
    replacement() {
      return "";
    },
  });

  return turndown;
};

/**
 * Converts sanitized inner HTML to LLM-ready markdown when markup remains.
 * @param {string} sanitizedInnerHtml - Sanitized selected element inner HTML.
 * @returns {object} Markdown and warning output.
 */
export const convertSanitizedHtmlToMarkdown = (sanitizedInnerHtml) => {
  const content = normalizeString(sanitizedInnerHtml);

  if (!content.trim()) {
    return {
      markdown: "",
      warnings: ["Selected element has no sanitized inner content."],
    };
  }

  if (!containsCommonHtmlTags(content)) {
    return {
      markdown: content.trim(),
      warnings: [],
    };
  }

  try {
    const markdown = createMarkdownConverter().turndown(content).trim();
    const warnings = markdown.length < MIN_MARKDOWN_LENGTH
      ? ["Markdown output is empty or below the minimum useful length."]
      : [];

    return { markdown, warnings };
  } catch (error) {
    return {
      markdown: content.trim(),
      warnings: [`Markdown conversion failed: ${error.message}`],
    };
  }
};

/**
 * Estimates token count using the content-script pricing approximation.
 * @param {string} content - Content being sent or stored.
 * @returns {number} Estimated token count.
 */
export const estimateTokens = (content) => Math.ceil(
  normalizeString(content).length * TOKENS_PER_CHAR,
);

/**
 * Creates a bounded chat snippet from the selected HTML.
 * @param {string} html - Selected element outer HTML.
 * @param {number} maxLength - Maximum snippet length.
 * @returns {object} Snippet and warning output.
 */
export const createChatSnippet = (html, maxLength = DEFAULT_CHAT_SNIPPET_LENGTH) => {
  const value = normalizeString(html);
  const normalizedMaxLength = Number.isFinite(maxLength)
    ? Math.max(0, Math.floor(maxLength))
    : DEFAULT_CHAT_SNIPPET_LENGTH;

  if (!value || normalizedMaxLength === 0 || value.length <= normalizedMaxLength) {
    return {
      value,
      warnings: [],
    };
  }

  return {
    value: value.substring(0, normalizedMaxLength),
    warnings: [`Chat snippet truncated to ${normalizedMaxLength} characters.`],
  };
};

/**
 * Builds warnings for missing or empty selected content.
 * @param {object} input - Pipeline input state.
 * @returns {string[]} Warning strings.
 */
export const collectExtractionWarnings = (input = {}) => {
  const warnings = [];

  if (!input.hasElement) warnings.push("No selected element provided.");
  if (input.hasElement && !normalizeString(input.outerHtml).trim()) {
    warnings.push("Selected element has no HTML content.");
  }
  if (input.hasElement && !normalizeString(input.plainText).trim()) {
    warnings.push("Selected element has no plain text content.");
  }
  if (input.hasElement && !normalizeString(input.safeHtml).trim()) {
    warnings.push("Selected element has no sanitized HTML content.");
  }
  if (normalizeString(input.safeHtml).trim() === EMPTY_CONTAINER_HTML) {
    warnings.push("Selected element sanitized to an empty container.");
  }

  return warnings;
};

/**
 * Converts a selected DOM element into normalized extraction artifacts.
 * @param {Element} element - Selected DOM element.
 * @param {object} context - Extraction options and page context.
 * @param {Document} context.document - Document that owns the selected element.
 * @param {Window} context.window - Window that owns the selected element.
 * @param {string} context.sourceUrl - Explicit source URL override.
 * @param {string} context.title - Explicit title override.
 * @param {boolean} context.debug - Enables sanitizer debug logging.
 * @param {number} context.chatSnippetMaxLength - Max chat snippet length.
 * @returns {object} Normalized content artifacts.
 */
export const extractArtifactsFromSelectedElement = (element, context = {}) => {
  const hasElement = isElementLike(element);
  const { outerHtml, innerHtml } = getElementHtml(element);
  const sourcePage = getSourcePageMetadata(context);
  const sourceElement = getSourceElementMetadata(element);
  const plainText = getElementPlainText(element);
  const safeHtml = sanitizeHtml(outerHtml, { debug: !!context.debug });
  const sanitizedInnerHtml = sanitizeHtml(innerHtml, { debug: !!context.debug });
  const markdownResult = convertSanitizedHtmlToMarkdown(sanitizedInnerHtml);
  const llmMarkdown = markdownResult.markdown || safeHtml || outerHtml;
  const chatSnippet = createChatSnippet(
    outerHtml,
    context.chatSnippetMaxLength,
  );
  const warnings = [
    ...collectExtractionWarnings({
      hasElement,
      outerHtml,
      plainText,
      safeHtml,
    }),
    ...markdownResult.warnings,
    ...chatSnippet.warnings,
  ];

  return createContentArtifacts({
    ...sourcePage,
    rawHtml: outerHtml,
    safeHtml,
    joplinNoteBodyHtml: safeHtml,
    newsblurStoryHtml: safeHtml,
    llmMarkdown,
    plainText,
    chatSnippet: chatSnippet.value,
    estimatedTokens: estimateTokens(llmMarkdown),
    warnings,
    sourceElement,
  });
};

export default extractArtifactsFromSelectedElement;
