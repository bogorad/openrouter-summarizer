/**
 * @fileoverview Pure helpers for building NewsBlur share content.
 * @module js/integrations/newsblurShareContent
 */

export const NEWSBLUR_PREFACE_MODEL_TOKEN = "@LLMNAME@";

const UNKNOWN_MODEL_NAME = "Unknown";

/**
 * Escapes user-controlled text before inserting it into an HTML payload.
 * @param {unknown} value - Value to escape.
 * @returns {string} HTML-escaped text.
 */
const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

/**
 * Builds the NewsBlur share content from the existing summary/story payload.
 * @param {object} options - Share content options.
 * @param {string} options.summaryHtml - Rendered summary HTML.
 * @param {string} options.newsblurStoryHtml - Rendered original story HTML.
 * @param {boolean} options.prefaceEnabled - Whether to add the preface.
 * @param {string} options.prefaceTemplate - User-configured preface template.
 * @param {string} options.modelName - Model name used for the summary.
 * @returns {string} NewsBlur content HTML.
 */
export const buildNewsblurShareContent = ({
  summaryHtml,
  newsblurStoryHtml,
  prefaceEnabled,
  prefaceTemplate,
  modelName,
}) => {
  const combinedContent = summaryHtml + "<hr>" + newsblurStoryHtml;
  const template = typeof prefaceTemplate === "string"
    ? prefaceTemplate.trim()
    : "";

  if (prefaceEnabled !== true || template === "") {
    return combinedContent;
  }

  const renderedPreface = template.replaceAll(
    NEWSBLUR_PREFACE_MODEL_TOKEN,
    modelName || UNKNOWN_MODEL_NAME,
  );

  return `<p>${escapeHtml(renderedPreface)}</p>${combinedContent}`;
};
