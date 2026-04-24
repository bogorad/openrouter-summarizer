// js/options/promptSection.js
// Renders and manages the XML prompt customization fields on the options page.

/**
 * Normalizes editable prompt text without stripping meaningful indentation.
 *
 * Called by: prompt section render/save paths and tests.
 *
 * @param {string} content
 * @returns {string}
 */
export const normalizePromptEditableContent = (content) => {
  if (typeof content !== "string") return "";
  const normalized = content.replace(/\r\n/g, "\n");

  return normalized
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/(?:\n[ \t]*)+$/, "");
};

/**
 * Creates the prompt section controller used by options.js.
 *
 * Call sites: options.js DOMContentLoaded initialization.
 *
 * @param {object} options
 * @returns {object}
 */
export const createOptionsPromptSection = ({
  prefixElement,
  editableElement,
  suffixElement,
  state,
  onSaveSettings = () => {},
  onDebug = () => false,
} = {}) => {
  const render = () => {
    const parts = state.promptParts;
    if (prefixElement) prefixElement.textContent = parts.prefix;
    if (editableElement) {
      editableElement.value = normalizePromptEditableContent(parts.editableContent);
    }
    if (suffixElement) suffixElement.textContent = parts.suffix;
  };

  const syncStateFromInput = ({ dirty = true } = {}) => {
    const editableContent = normalizePromptEditableContent(
      editableElement ? editableElement.value : "",
    );

    state.setPromptEditableContent(editableContent, { dirty });
  };

  const attach = () => {
    if (!editableElement) {
      console.error("[LLM Options] User formatting editable textarea not found.");
      return;
    }

    editableElement.addEventListener("input", () => {
      if (onDebug()) {
        console.log("[LLM Options] User formatting instructions changed");
      }
      syncStateFromInput();
      onSaveSettings();
    });
  };

  return {
    attach,
    render,
    syncStateFromInput,
  };
};
