// js/options/quickPromptSection.js
// Renders and manages the options page chat quick prompt list.

import { createElement } from "../ui/dom.js";
import {
  createInputRow,
  createRemoveButton,
  createRepeatedListRow,
  createTextareaRow,
  setAddButtonMaxState,
} from "../ui/formRows.js";

const DEFAULT_MAX_QUICK_PROMPTS = 10;

/**
 * Normalizes quick prompt rows for loading defaults and saving settings.
 *
 * Call sites: options.js load/reset/save flows and quick prompt section tests.
 *
 * @param {Array} items
 * @param {Object} options
 * @returns {Array}
 */
export const normalizeQuickPromptsForSave = (
  items,
  { maxQuickPrompts = DEFAULT_MAX_QUICK_PROMPTS } = {},
) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const title = typeof item.title === "string" ? item.title.trim() : "";
      const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
      if (title === "" || prompt === "") return null;

      return { title, prompt };
    })
    .filter((item) => item !== null)
    .slice(0, maxQuickPrompts);

/**
 * Creates the quick prompt section controller used by options.js.
 *
 * Call sites: options.js DOMContentLoaded initialization.
 *
 * @param {object} options
 * @returns {object}
 */
export const createOptionsQuickPromptSection = ({
  container,
  addButton,
  state,
  maxQuickPrompts = DEFAULT_MAX_QUICK_PROMPTS,
  onSaveSettings = () => {},
  alertUser = (message) => window.alert(message),
} = {}) => {
  const cleanupFns = [];

  const cleanupRows = () => {
    cleanupFns.splice(0).forEach((cleanup) => cleanup());
  };

  const setQuickPrompts = (quickPrompts) => {
    if (state.setQuickPrompts) {
      state.setQuickPrompts(quickPrompts);
      return;
    }
    state.quickPrompts = quickPrompts;
    state.markDirty?.();
  };

  const updateQuickPromptAt = (index, updates) => {
    if (index < 0 || index >= state.quickPrompts.length) return;

    setQuickPrompts(
      state.quickPrompts.map((quickPrompt, promptIndex) =>
        promptIndex === index ? { ...quickPrompt, ...updates } : quickPrompt,
      ),
    );
  };

  const handleTitleInput = (event) => {
    const index = parseInt(event.target.dataset.index, 10);
    updateQuickPromptAt(index, { title: event.target.value });
  };

  const handlePromptInput = (event) => {
    const index = parseInt(event.target.dataset.index, 10);
    updateQuickPromptAt(index, { prompt: event.target.value });
  };

  const removeQuickPrompt = (index) => {
    if (index < 0 || index >= state.quickPrompts.length) return;

    setQuickPrompts(
      state.quickPrompts.filter((_, promptIndex) => promptIndex !== index),
    );
    render();
    onSaveSettings();
  };

  const createQuickPromptRow = (item, index) => {
    const titleInput = createInputRow({
      id: `chatQuickPromptTitle_${index}`,
      value: item.title,
      placeholder: "Button title",
      label: "",
      className: "chat-quick-prompt-title-row",
      inputClassName: "chat-quick-prompt-title",
      inputAttrs: { "aria-label": "Quick prompt button title" },
      inputDataset: { index },
      onInput: handleTitleInput,
    });
    const promptInput = createTextareaRow({
      id: `chatQuickPromptText_${index}`,
      value: item.prompt,
      placeholder: "Prompt text sent when this button is clicked",
      rows: 3,
      label: "",
      className: "chat-quick-prompt-text-row",
      textareaClassName: "chat-quick-prompt-text",
      textareaAttrs: { "aria-label": "Quick prompt text" },
      textareaDataset: { index },
      onInput: handlePromptInput,
    });
    const fields = createElement("div", {
      className: "chat-quick-prompt-fields",
      children: [titleInput.element, promptInput.element],
    });
    const removeButton = createRemoveButton({
      label: "Remove this quick prompt",
      text: "x",
      title: "Remove this quick prompt",
      onClick: () => removeQuickPrompt(index),
      dataset: { index },
    });
    const row = createRepeatedListRow({
      index,
      children: [fields],
      actions: [removeButton],
      className: "option-group chat-quick-prompt-option",
    });

    cleanupFns.push(
      titleInput.cleanup,
      promptInput.cleanup,
      removeButton.cleanup,
      row.cleanup,
    );

    return row.element;
  };

  function render() {
    if (!container) return;

    cleanupRows();
    container.textContent = "";
    state.quickPrompts.forEach((item, index) => {
      container.appendChild(createQuickPromptRow(item, index));
    });

    if (addButton) {
      setAddButtonMaxState(addButton, {
        count: state.quickPrompts.length,
        max: maxQuickPrompts,
        noun: "quick prompt",
        addTitle: `Add another quick prompt (max ${maxQuickPrompts}).`,
        maxTitle: `Maximum limit of ${maxQuickPrompts} quick prompts reached.`,
      });
    }
  }

  const addQuickPrompt = () => {
    if (state.quickPrompts.length >= maxQuickPrompts) {
      alertUser(`Maximum limit of ${maxQuickPrompts} quick prompts reached.`);
      return;
    }

    setQuickPrompts([...state.quickPrompts, { title: "", prompt: "" }]);
    render();

    const newIndex = state.quickPrompts.length - 1;
    const titleInput = document.getElementById(
      `chatQuickPromptTitle_${newIndex}`,
    );
    if (titleInput) titleInput.focus();
  };

  return {
    addQuickPrompt,
    cleanup: cleanupRows,
    normalizeForSave: () =>
      normalizeQuickPromptsForSave(state.quickPrompts, { maxQuickPrompts }),
    render,
  };
};
