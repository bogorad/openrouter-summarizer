// js/options/languageSection.js
// Renders and manages the options page language list.

import { DEFAULT_PREPOPULATE_LANGUAGES } from "../../constants.js";
import { createAutocomplete } from "../ui/autocomplete.js";
import { addManagedEventListener, createElement } from "../ui/dom.js";
import {
  createRemoveButton,
  setAddButtonMaxState,
} from "../ui/formRows.js";

const DEFAULT_MAX_LANGUAGES = 5;
const LANGUAGE_FLAG_CLASS = "language-flag";
const FALLBACK_FLAG_PATH = "country-flags/svg/un.svg";

/**
 * Resolves a Chrome extension URL for a language flag.
 *
 * Call sites: language row rendering, autocomplete suggestions, defaults, and save normalization.
 *
 * @param {string} languageCode
 * @returns {string}
 */
export const resolveLanguageFlagUrl = (languageCode) => {
  const normalizedCode =
    typeof languageCode === "string" ? languageCode.trim().toLowerCase() : "";
  const path = normalizedCode
    ? `country-flags/svg/${normalizedCode}.svg`
    : FALLBACK_FLAG_PATH;

  return chrome.runtime.getURL(path);
};

const normalizeLanguageName = (value) =>
  typeof value === "string" ? value.trim() : "";

const findLanguageByName = (languages, languageName) => {
  const normalizedName = normalizeLanguageName(languageName).toLowerCase();
  if (normalizedName === "" || !Array.isArray(languages)) return null;

  return (
    languages.find(
      (language) =>
        typeof language?.name === "string" &&
        language.name.toLowerCase() === normalizedName,
    ) || null
  );
};

/**
 * Builds the default language rows for the options page.
 *
 * Call sites: options.js load/reset flows and language removal fallback.
 *
 * @param {Array} languages
 * @returns {Array}
 */
export const createDefaultLanguageInfo = (languages) =>
  DEFAULT_PREPOPULATE_LANGUAGES.map((languageName) => {
    const language = findLanguageByName(languages, languageName);

    return {
      language_name: languageName,
      svg_path: resolveLanguageFlagUrl(language?.code),
    };
  });

/**
 * Filters and normalizes language rows before saving settings.
 *
 * Call sites: options.js save flow and tests.
 *
 * @param {Array} selectedLanguages
 * @param {Array} availableLanguages
 * @param {Object} options
 * @returns {Array}
 */
export const normalizeLanguageInfoForSave = (
  selectedLanguages,
  availableLanguages,
  { maxLanguages = DEFAULT_MAX_LANGUAGES, onInvalidLanguage = () => {} } = {},
) =>
  (Array.isArray(selectedLanguages) ? selectedLanguages : [])
    .map((language) => {
      const name = normalizeLanguageName(language?.language_name);
      if (name === "") return null;

      const foundLanguage = findLanguageByName(availableLanguages, name);
      if (!foundLanguage) {
        onInvalidLanguage(name);
        return null;
      }

      return {
        language_name: foundLanguage.name,
        svg_path: resolveLanguageFlagUrl(foundLanguage.code),
      };
    })
    .filter((language) => language !== null)
    .slice(0, maxLanguages);

const filterLanguages = (query, languages) => {
  const lowerQuery = String(query || "").toLowerCase().trim();
  if (!lowerQuery || !Array.isArray(languages)) return [];

  return languages
    .filter((language) => language.name.toLowerCase().includes(lowerQuery))
    .map((language) => ({ name: language.name, code: language.code }));
};

const createFlagImage = ({ code = "", name = "Language", src = "" } = {}) => {
  const flagImg = createElement("img", {
    className: LANGUAGE_FLAG_CLASS,
    attrs: {
      src: src || resolveLanguageFlagUrl(code),
      alt: `${name} flag`,
    },
  });

  flagImg.onerror = () => {
    flagImg.src = resolveLanguageFlagUrl("");
    flagImg.alt = "Flag not found";
  };

  return flagImg;
};

const renderLanguageSuggestion = (language) => [
  createFlagImage({ code: language.code, name: language.name }),
  createElement("span", {
    className: "language-name",
    text: language.name,
  }),
];

const createGrabHandle = () => {
  const dotsContainer = createElement("div", {
    className: "grab-handle-dots",
  });

  for (let i = 0; i < 3; i++) {
    dotsContainer.appendChild(
      createElement("div", {
        className: "grab-handle-dot",
      }),
    );
  }

  return createElement("div", {
    className: "grab-handle",
    attrs: {
      draggable: "true",
      title: "Drag to reorder",
      "aria-label": "Drag to reorder language",
      role: "button",
      tabindex: "0",
    },
    children: [dotsContainer],
  });
};

/**
 * Creates the language section controller used by options.js.
 *
 * Call sites: options.js DOMContentLoaded initialization.
 *
 * @param {object} options
 * @returns {object}
 */
export const createOptionsLanguageSection = ({
  container,
  addButton,
  state,
  maxLanguages = DEFAULT_MAX_LANGUAGES,
  getAutocompleteLanguages = () => [],
  onDebug = () => false,
  alertUser = (message) => window.alert(message),
} = {}) => {
  const cleanupFns = [];
  let draggedItemIndex = null;

  const cleanupRows = () => {
    cleanupFns.splice(0).forEach((cleanup) => cleanup());
  };

  const debugLog = (...args) => {
    if (onDebug()) console.log(...args);
  };

  const setLanguages = (languages) => {
    if (state.setLanguages) {
      state.setLanguages(languages);
      return;
    }
    state.languages = languages;
    state.markDirty?.();
  };

  const updateLanguageAt = (index, nextLanguage) => {
    const nextLanguages = state.languages.map((language, languageIndex) =>
      languageIndex === index ? nextLanguage : language,
    );
    setLanguages(nextLanguages);
  };

  const getDefaultLanguages = () =>
    createDefaultLanguageInfo(getAutocompleteLanguages());

  const handleLanguageTextChange = (event) => {
    const newLanguageName = event.target.value.trim();
    const index = parseInt(event.target.dataset.index, 10);
    if (index < 0 || index >= state.languages.length) return;

    const currentLanguage = state.languages[index] || {};
    const nextLanguage = {
      ...currentLanguage,
      language_name: newLanguageName,
    };
    const foundLanguage = findLanguageByName(
      getAutocompleteLanguages(),
      newLanguageName,
    );

    if (foundLanguage) {
      nextLanguage.svg_path = resolveLanguageFlagUrl(foundLanguage.code);
      const flagImg = event.target.parentElement.querySelector(
        `.${LANGUAGE_FLAG_CLASS}`,
      );
      if (flagImg) {
        flagImg.src = nextLanguage.svg_path;
        flagImg.alt = `${newLanguageName} flag`;
      }
    }

    updateLanguageAt(index, nextLanguage);
  };

  const removeLanguage = (index) => {
    if (index < 0 || index >= state.languages.length) return;

    const nextLanguages = state.languages.filter(
      (_, languageIndex) => languageIndex !== index,
    );
    setLanguages(nextLanguages.length > 0 ? nextLanguages : getDefaultLanguages());
    render();
  };

  const handleDragStart = (event) => {
    const languageOption = event.target.closest(".language-option");
    if (!languageOption) return;

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", languageOption.dataset.index);
    draggedItemIndex = parseInt(languageOption.dataset.index, 10);
    debugLog(`[LLM Options] Drag started on language index: ${draggedItemIndex}`);

    setTimeout(() => {
      languageOption.classList.add("dragging");
    }, 0);
  };

  const handleDragEnd = () => {
    if (!container) return;

    const draggedElement = container.querySelector(
      `.language-option[data-index="${draggedItemIndex}"]`,
    );
    if (draggedElement) {
      draggedElement.classList.remove("dragging");
    } else {
      container
        .querySelectorAll(".language-option.dragging")
        .forEach((element) => element.classList.remove("dragging"));
    }

    container.querySelectorAll(".language-option").forEach((element) => {
      element.classList.remove("drag-over-top", "drag-over-bottom");
    });
    draggedItemIndex = null;
    debugLog("[LLM Options] Drag ended for language.");
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const targetElement = event.target.closest(".language-option");
    if (!targetElement || draggedItemIndex === null) return;

    const targetIndex = parseInt(targetElement.dataset.index, 10);
    container.querySelectorAll(".language-option").forEach((element) => {
      if (element !== targetElement) {
        element.classList.remove("drag-over-top", "drag-over-bottom");
      }
    });

    if (draggedItemIndex === targetIndex) {
      targetElement.classList.remove("drag-over-top", "drag-over-bottom");
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const isOverTopHalf = event.clientY < rect.top + rect.height / 2;
    targetElement.classList.toggle("drag-over-top", isOverTopHalf);
    targetElement.classList.toggle("drag-over-bottom", !isOverTopHalf);
  };

  const handleDragLeave = (event) => {
    const relatedTarget = event.relatedTarget;
    const targetElement = event.target.closest(".language-option");

    if (
      targetElement &&
      (!relatedTarget || !targetElement.contains(relatedTarget))
    ) {
      targetElement.classList.remove("drag-over-top", "drag-over-bottom");
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const targetElement = event.target.closest(".language-option");
    if (!targetElement || draggedItemIndex === null) return;

    const targetIndex = parseInt(targetElement.dataset.index, 10);
    targetElement.classList.remove("drag-over-top", "drag-over-bottom");

    if (draggedItemIndex === targetIndex) {
      draggedItemIndex = null;
      return;
    }

    const draggedItem = state.languages[draggedItemIndex];
    if (!draggedItem) {
      console.error("Could not find dragged item at index", draggedItemIndex);
      draggedItemIndex = null;
      return;
    }

    const nextLanguages = [...state.languages];
    nextLanguages.splice(draggedItemIndex, 1);

    const rect = targetElement.getBoundingClientRect();
    const isOverTopHalf = event.clientY < rect.top + rect.height / 2;
    let newIndex = draggedItemIndex < targetIndex ? targetIndex - 1 : targetIndex;
    if (!isOverTopHalf) {
      newIndex = draggedItemIndex < targetIndex ? targetIndex : targetIndex + 1;
    }

    nextLanguages.splice(newIndex, 0, draggedItem);
    setLanguages(nextLanguages);
    debugLog(
      `[LLM Options] Dropped language from original index ${draggedItemIndex} to new index ${newIndex}`,
    );
    render();
    draggedItemIndex = null;
  };

  const createLanguageRow = (language, index) => {
    const group = createElement("div", {
      className: "option-group language-option",
      dataset: { index },
    });
    const grabHandle = createGrabHandle();
    const label = createElement("label", {
      className: "language-input-wrapper",
    });
    const flagImg = createFlagImage({
      name: language.language_name,
      src: language.svg_path,
    });
    const textInput = createElement("input", {
      attrs: {
        type: "text",
        id: `langText_${index}`,
        placeholder: "Enter Language Name",
        autocomplete: "off",
      },
      dataset: { index },
    });
    textInput.value = language.language_name;

    const removeButton = createRemoveButton({
      label: "Remove this language",
      text: "x",
      title: "Remove this language",
      onClick: () => removeLanguage(index),
      dataset: { index },
    });
    const autocomplete = createAutocomplete({
      input: textInput,
      items: () => getAutocompleteLanguages(),
      filterItems: filterLanguages,
      getItemLabel: (item) => item.name,
      getItemValue: (item) => item.name,
      renderItem: renderLanguageSuggestion,
      positioningAnchor: label,
      listboxLabel: "language suggestions",
      maxItems: 10,
      onSelect: ({ item, input }) => {
        const selectedFlagUrl = resolveLanguageFlagUrl(item.code);
        flagImg.src = selectedFlagUrl;
        flagImg.alt = `${item.name} flag`;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      },
    });

    label.appendChild(flagImg);
    label.appendChild(textInput);
    group.appendChild(grabHandle);
    group.appendChild(label);
    group.appendChild(removeButton.element);

    cleanupFns.push(
      addManagedEventListener(grabHandle, "dragstart", handleDragStart),
      addManagedEventListener(grabHandle, "dragend", handleDragEnd),
      addManagedEventListener(textInput, "input", handleLanguageTextChange),
      addManagedEventListener(group, "dragover", handleDragOver),
      addManagedEventListener(group, "dragleave", handleDragLeave),
      addManagedEventListener(group, "drop", handleDrop),
      removeButton.cleanup,
      autocomplete.cleanup,
    );

    return group;
  };

  function render() {
    if (!container) return;

    cleanupRows();
    container.textContent = "";
    state.languages.forEach((language, index) => {
      container.appendChild(createLanguageRow(language, index));
    });

    if (addButton) {
      setAddButtonMaxState(addButton, {
        count: state.languages.length,
        max: maxLanguages,
        noun: "language",
        addTitle: `Add another language (max ${maxLanguages}).`,
        maxTitle: `Maximum limit of ${maxLanguages} languages reached.`,
      });
    }
  }

  const addLanguage = () => {
    if (state.languages.length >= maxLanguages) {
      alertUser(`Maximum limit of ${maxLanguages} languages reached.`);
      debugLog(`[LLM Options] Max languages (${maxLanguages}) reached.`);
      return;
    }

    setLanguages([
      ...state.languages,
      {
        language_name: "",
        svg_path: resolveLanguageFlagUrl(""),
      },
    ]);
    render();
    const newInput = document.getElementById(`langText_${state.languages.length - 1}`);
    if (newInput) newInput.focus();
    debugLog("[LLM Options] Added new language row.");
  };

  return {
    addLanguage,
    cleanup: cleanupRows,
    getDefaultLanguageInfo: getDefaultLanguages,
    normalizeForSave: ({ onInvalidLanguage } = {}) =>
      normalizeLanguageInfoForSave(state.languages, getAutocompleteLanguages(), {
        maxLanguages,
        onInvalidLanguage,
      }),
    render,
  };
};
