// js/ui/autocomplete.js
// Reusable accessible combobox/listbox behavior for extension text inputs.

import {
  addManagedEventListener,
  appendChildren,
  createElement,
  setText,
} from "./dom.js";

const DEFAULT_CLASS_NAMES = {
  listbox: "autocomplete-dropdown",
  option: "autocomplete-item",
  selected: "selected",
};

let autocompleteIdCounter = 0;

/**
 * Returns a DOM-safe id segment for generated listbox and option ids.
 * @param {string|number} value - Source value to normalize.
 * @returns {string} Safe id segment.
 * @example Called by createAutocomplete().
 */
const normalizeIdPart = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_") || "item";

/**
 * Returns a basic string label from common item shapes.
 * @param {*} item - Autocomplete item.
 * @returns {string} Display label.
 * @example Used as the default getItemLabel option.
 */
const getDefaultItemLabel = (item) => {
  if (item === null || typeof item === "undefined") return "";
  if (typeof item === "string" || typeof item === "number") return String(item);
  if (typeof item.label === "string") return item.label;
  if (typeof item.name === "string") return item.name;
  if (typeof item.title === "string") return item.title;
  if (typeof item.id === "string") return item.id;
  return String(item);
};

/**
 * Returns a basic input value from common item shapes.
 * @param {*} item - Autocomplete item.
 * @returns {string} Value to place in the input.
 * @example Used as the default getItemValue option.
 */
const getDefaultItemValue = (item) => {
  if (item === null || typeof item === "undefined") return "";
  if (typeof item === "string" || typeof item === "number") return String(item);
  if (typeof item.value === "string") return item.value;
  if (typeof item.id === "string") return item.id;
  return getDefaultItemLabel(item);
};

/**
 * Filters items by case-insensitive label matching.
 * @param {string} query - Current input query.
 * @param {Array} items - Items available to search.
 * @param {Function} getItemLabel - Label reader.
 * @returns {Array} Matching items.
 * @example Used when callers do not provide filterItems().
 */
const getDefaultFilteredItems = (query, items, getItemLabel) => {
  const lowerQuery = String(query || "").trim().toLowerCase();
  if (!lowerQuery) return [];

  return items.filter((item) =>
    getItemLabel(item).toLowerCase().includes(lowerQuery),
  );
};

/**
 * Resolves static or dynamic item sources.
 * @param {Array|Function} source - Static array or function returning an array.
 * @param {string} query - Current input query.
 * @returns {Array} Item list.
 * @example Called before filtering.
 */
const resolveItems = (source, query) => {
  const items = typeof source === "function" ? source(query) : source;
  return Array.isArray(items) ? items : [];
};

/**
 * Creates a reusable autocomplete controller for an existing text input.
 * @param {Object} options - Autocomplete options.
 * @param {HTMLInputElement} options.input - Text input to enhance.
 * @param {Array|Function} options.items - Static items or function called with query.
 * @param {Function} options.onSelect - Called after a user selects an item.
 * @param {Function} options.getItemLabel - Returns visible text for an item.
 * @param {Function} options.getItemValue - Returns input value for an item.
 * @param {Function} options.filterItems - Returns matching items for a query.
 * @param {Function} options.renderItem - Returns custom option child content.
 * @param {HTMLElement} options.positioningAnchor - Element used to position listbox.
 * @param {HTMLElement} options.listboxParent - Parent receiving the listbox.
 * @param {string} options.listboxId - Stable listbox id.
 * @param {string} options.optionIdPrefix - Prefix for generated option ids.
 * @param {string} options.listboxLabel - Accessible label for the listbox.
 * @param {Object} options.classNames - CSS classes for listbox, option, selected.
 * @param {number} options.maxItems - Maximum suggestions to display.
 * @param {number} options.minQueryLength - Minimum trimmed query length.
 * @param {boolean} options.openOnFocus - Whether focus opens suggestions.
 * @param {boolean} options.liveUpdateInputOnActive - Whether arrows preview active text.
 * @returns {Object} Autocomplete controller with open, close, refresh, setItems, and cleanup.
 * @example Called by option, chat, or popup modules with screen-specific renderers.
 */
export const createAutocomplete = (options = {}) => {
  if (!options.input || typeof options.input.addEventListener !== "function") {
    throw new TypeError("createAutocomplete requires an input element.");
  }

  const input = options.input;
  const getItemLabel = options.getItemLabel || getDefaultItemLabel;
  const getItemValue = options.getItemValue || getDefaultItemValue;
  const filterItems = options.filterItems || getDefaultFilteredItems;
  const classNames = { ...DEFAULT_CLASS_NAMES, ...(options.classNames || {}) };
  const listboxParent = options.listboxParent || document.body;
  const instanceId = ++autocompleteIdCounter;
  const listboxId = options.listboxId || `autocomplete-listbox-${instanceId}`;
  const optionIdPrefix = options.optionIdPrefix || `${listboxId}-option-`;
  const listboxLabel = options.listboxLabel || "Suggestions";
  const minQueryLength = Number.isFinite(options.minQueryLength)
    ? options.minQueryLength
    : 1;
  const maxItems = Number.isFinite(options.maxItems) ? options.maxItems : 10;
  const openOnFocus = Boolean(options.openOnFocus);
  const liveUpdateInputOnActive = Boolean(options.liveUpdateInputOnActive);
  const positioningAnchor = options.positioningAnchor || input;
  const cleanupHandlers = [];

  let sourceItems = options.items || [];
  let visibleItems = [];
  let activeIndex = -1;
  let isOpen = false;
  let isCleanedUp = false;

  const listbox = createElement("div", {
    className: classNames.listbox,
    attrs: {
      id: listboxId,
      role: "listbox",
      "aria-label": listboxLabel,
    },
  });
  listbox.style.display = "none";
  listboxParent.appendChild(listbox);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", listboxId);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("autocomplete", "off");

  const getOptionId = (item, index) => {
    const value = getItemValue(item);
    return `${optionIdPrefix}${index}-${normalizeIdPart(value)}`;
  };

  const getFilteredItems = () => {
    const query = input.value || "";
    if (String(query).trim().length < minQueryLength) return [];

    const resolvedItems = resolveItems(sourceItems, query);
    const filteredItems = filterItems(query, resolvedItems, getItemLabel);
    if (!Array.isArray(filteredItems)) return [];

    return filteredItems.slice(0, maxItems);
  };

  const positionListbox = () => {
    const rect = positioningAnchor.getBoundingClientRect();
    listbox.style.position = "absolute";
    listbox.style.top = `${rect.bottom + window.scrollY + 4}px`;
    listbox.style.left = `${rect.left + window.scrollX}px`;
    listbox.style.width = `${rect.width}px`;
  };

  const updateActiveOption = () => {
    let activeDescendantId = "";
    const optionsElements = Array.from(listbox.querySelectorAll("[role='option']"));

    optionsElements.forEach((optionElement, index) => {
      const isSelected = index === activeIndex;
      optionElement.classList.toggle(classNames.selected, isSelected);
      optionElement.setAttribute("aria-selected", isSelected ? "true" : "false");

      if (isSelected) {
        activeDescendantId = optionElement.id;
        optionElement.scrollIntoView({ block: "nearest" });
      }
    });

    if (activeDescendantId) {
      input.setAttribute("aria-activedescendant", activeDescendantId);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  const close = () => {
    if (!isOpen) {
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      return;
    }

    isOpen = false;
    activeIndex = -1;
    listbox.style.display = "none";
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    updateActiveOption();
  };

  const selectItem = (item, event = null) => {
    input.value = getItemValue(item);
    close();

    if (typeof options.onSelect === "function") {
      options.onSelect({
        item,
        input,
        value: input.value,
        event,
      });
    }
  };

  const renderOption = (item, index) => {
    const optionElement = createElement("div", {
      className: classNames.option,
      attrs: {
        id: getOptionId(item, index),
        role: "option",
        tabindex: "-1",
        "aria-selected": "false",
      },
      dataset: { index },
    });

    if (typeof options.renderItem === "function") {
      const renderedItem = options.renderItem(item, {
        index,
        input,
        option: optionElement,
      });
      appendChildren(optionElement, renderedItem);
    } else {
      setText(optionElement, getItemLabel(item));
    }

    cleanupHandlers.push(
      addManagedEventListener(optionElement, "mousedown", (event) => {
        event.preventDefault();
      }),
    );
    cleanupHandlers.push(
      addManagedEventListener(optionElement, "click", (event) => {
        selectItem(item, event);
      }),
    );

    return optionElement;
  };

  const renderList = () => {
    listbox.textContent = "";
    activeIndex = -1;

    if (visibleItems.length === 0) {
      close();
      return;
    }

    visibleItems.forEach((item, index) => {
      listbox.appendChild(renderOption(item, index));
    });

    positionListbox();
    isOpen = true;
    listbox.style.display = "block";
    input.setAttribute("aria-expanded", "true");
    input.removeAttribute("aria-activedescendant");
  };

  const refresh = () => {
    if (isCleanedUp) return;
    visibleItems = getFilteredItems();
    renderList();
  };

  const open = () => {
    refresh();
  };

  const moveActiveOption = (direction) => {
    if (visibleItems.length === 0) return;

    activeIndex = (activeIndex + direction + visibleItems.length) % visibleItems.length;
    updateActiveOption();

    if (liveUpdateInputOnActive) {
      input.value = getItemValue(visibleItems[activeIndex]);
    }
  };

  const handleInput = () => {
    refresh();
  };

  const handleFocus = () => {
    if (!openOnFocus) return;
    refresh();
  };

  const handleKeydown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) refresh();
      moveActiveOption(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) refresh();
      moveActiveOption(-1);
      return;
    }

    if (event.key === "Enter") {
      if (!isOpen || activeIndex < 0 || !visibleItems[activeIndex]) return;
      event.preventDefault();
      selectItem(visibleItems[activeIndex], event);
      return;
    }

    if (event.key === "Escape") {
      if (!isOpen) return;
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "Tab") {
      close();
    }
  };

  const handleDocumentClick = (event) => {
    if (!isOpen) return;
    if (input.contains(event.target)) return;
    if (listbox.contains(event.target)) return;
    close();
  };

  const setItems = (items) => {
    sourceItems = items || [];
    if (isOpen) refresh();
  };

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    cleanupHandlers.splice(0).forEach((cleanupHandler) => cleanupHandler());
    close();

    if (listbox.parentNode) {
      listbox.parentNode.removeChild(listbox);
    }

    input.removeAttribute("role");
    input.removeAttribute("aria-autocomplete");
    input.removeAttribute("aria-controls");
    input.removeAttribute("aria-expanded");
    input.removeAttribute("aria-haspopup");
    input.removeAttribute("aria-activedescendant");
  };

  cleanupHandlers.push(addManagedEventListener(input, "input", handleInput));
  cleanupHandlers.push(addManagedEventListener(input, "focus", handleFocus));
  cleanupHandlers.push(addManagedEventListener(input, "keydown", handleKeydown));
  cleanupHandlers.push(addManagedEventListener(document, "click", handleDocumentClick));

  return {
    close,
    cleanup,
    listbox,
    open,
    refresh,
    setItems,
  };
};
