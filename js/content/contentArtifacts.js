/**
 * Content artifact helpers.
 *
 * This module defines the normalized shape produced by the future extraction
 * pipeline. Callers should consume named artifacts instead of re-cleaning or
 * slicing selected page HTML in feature modules.
 */

const DEFAULT_SOURCE_ELEMENT = Object.freeze({
  tagName: "",
  id: "",
  className: "",
  textLength: 0,
  htmlLength: 0,
});

const DEFAULT_RAW_HTML = Object.freeze({
  value: "",
  length: 0,
});

const normalizeString = (value) => (typeof value === "string" ? value : "");

const normalizeInteger = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const normalizeWarnings = (warnings) => {
  if (!Array.isArray(warnings)) return [];

  return warnings
    .filter((warning) => typeof warning === "string" && warning.trim() !== "")
    .map((warning) => warning.trim());
};

export const CONTENT_ARTIFACT_KEYS = Object.freeze({
  SOURCE_URL: "sourceUrl",
  TITLE: "title",
  RAW_HTML: "rawHtml",
  SAFE_HTML: "safeHtml",
  JOPLIN_NOTE_BODY_HTML: "joplinNoteBodyHtml",
  NEWSBLUR_STORY_HTML: "newsblurStoryHtml",
  LLM_MARKDOWN: "llmMarkdown",
  PLAIN_TEXT: "plainText",
  CHAT_SNIPPET: "chatSnippet",
  ESTIMATED_TOKENS: "estimatedTokens",
  WARNINGS: "warnings",
  SOURCE_ELEMENT: "sourceElement",
});

export const createSourceElementMetadata = (metadata = {}) => ({
  tagName: normalizeString(metadata.tagName).toLowerCase(),
  id: normalizeString(metadata.id),
  className: normalizeString(metadata.className),
  textLength: normalizeInteger(metadata.textLength),
  htmlLength: normalizeInteger(metadata.htmlLength),
});

export const createRawHtmlArtifact = (rawHtml = "") => {
  const value = normalizeString(rawHtml);
  return {
    value,
    length: value.length,
  };
};

export const createContentArtifacts = (input = {}) => {
  const rawHtml = input.rawHtml && typeof input.rawHtml === "object"
    ? {
        value: normalizeString(input.rawHtml.value),
        length: normalizeInteger(input.rawHtml.length),
      }
    : createRawHtmlArtifact(input.rawHtml);

  return {
    sourceUrl: normalizeString(input.sourceUrl),
    title: normalizeString(input.title),
    rawHtml: {
      ...DEFAULT_RAW_HTML,
      ...rawHtml,
    },
    safeHtml: normalizeString(input.safeHtml),
    joplinNoteBodyHtml: normalizeString(input.joplinNoteBodyHtml),
    newsblurStoryHtml: normalizeString(input.newsblurStoryHtml),
    llmMarkdown: normalizeString(input.llmMarkdown),
    plainText: normalizeString(input.plainText),
    chatSnippet: normalizeString(input.chatSnippet),
    estimatedTokens: normalizeInteger(input.estimatedTokens),
    warnings: normalizeWarnings(input.warnings),
    sourceElement: {
      ...DEFAULT_SOURCE_ELEMENT,
      ...createSourceElementMetadata(input.sourceElement),
    },
  };
};

export const addArtifactWarning = (artifacts, warning) => {
  const normalizedArtifacts = createContentArtifacts(artifacts);
  const normalizedWarning = normalizeString(warning).trim();

  if (!normalizedWarning) return normalizedArtifacts;

  return {
    ...normalizedArtifacts,
    warnings: [...normalizedArtifacts.warnings, normalizedWarning],
  };
};

export const hasArtifact = (artifacts, key) => {
  if (!artifacts || typeof artifacts !== "object") return false;

  const value = artifacts[key];

  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => {
      if (typeof item === "string") return item.trim() !== "";
      if (typeof item === "number") return Number.isFinite(item) && item > 0;
      return Boolean(item);
    });
  }

  return Boolean(value);
};

export const getContentArtifactText = (artifacts, key) => {
  const normalizedArtifacts = createContentArtifacts(artifacts);
  return normalizeString(normalizedArtifacts[key]).trim();
};

export const pickArtifacts = (artifacts, keys) => {
  const normalizedArtifacts = createContentArtifacts(artifacts);
  const selectedKeys = Array.isArray(keys) ? keys : [];

  return selectedKeys.reduce((result, key) => {
    if (Object.prototype.hasOwnProperty.call(normalizedArtifacts, key)) {
      result[key] = normalizedArtifacts[key];
    }
    return result;
  }, {});
};
