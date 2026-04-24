// js/ui/dom.js
// Safe DOM construction helpers for shared extension UI modules.

import { sanitizeHtml } from "../htmlSanitizer.js";

const UNSAFE_ATTRIBUTE_PREFIX = "on";
const UNSAFE_ATTRIBUTES = new Set(["innerhtml", "outerhtml", "srcdoc"]);

/**
 * Checks whether an attribute name can be set through the safe helper API.
 * @param {string} attrName - Attribute name supplied by a UI caller.
 * @returns {boolean} True when the attribute should be skipped.
 * @example Called by applyAttributes().
 */
const isUnsafeAttributeName = (attrName) => {
  const normalizedName = String(attrName || "").trim().toLowerCase();
  if (!normalizedName) return true;
  if (normalizedName.startsWith(UNSAFE_ATTRIBUTE_PREFIX)) return true;
  return UNSAFE_ATTRIBUTES.has(normalizedName);
};

/**
 * Applies CSS classes from a string or array.
 * @param {Element} el - Element receiving classes.
 * @param {string|string[]} classes - Class value from createElement options.
 * @example Called by createElement().
 */
const applyClasses = (el, classes) => {
  if (!classes) return;

  const classList = Array.isArray(classes)
    ? classes
    : String(classes).split(/\s+/);

  classList
    .filter(Boolean)
    .forEach(className => el.classList.add(className));
};

/**
 * Applies safe attributes from a plain object.
 * @param {Element} el - Element receiving attributes.
 * @param {Object} attrs - Attribute map from createElement options.
 * @example Called by createElement().
 */
const applyAttributes = (el, attrs) => {
  if (!attrs) return;

  Object.entries(attrs).forEach(([attrName, attrValue]) => {
    if (isUnsafeAttributeName(attrName)) return;
    if (attrValue === false || attrValue === null || typeof attrValue === "undefined") return;

    if (attrValue === true) {
      el.setAttribute(attrName, "");
      return;
    }

    el.setAttribute(attrName, String(attrValue));
  });
};

/**
 * Applies data-* attributes from a plain object.
 * @param {HTMLElement} el - Element receiving dataset values.
 * @param {Object} dataset - Dataset map from createElement options.
 * @example Called by createElement().
 */
const applyDataset = (el, dataset) => {
  if (!dataset) return;

  Object.entries(dataset).forEach(([key, value]) => {
    if (!key || value === null || typeof value === "undefined") return;
    el.dataset[key] = String(value);
  });
};

/**
 * Creates a DOM element with safe text, attributes, data, class, and children.
 * @param {string} tagName - Browser tag name to create.
 * @param {Object} options - Element options.
 * @param {string|string[]} options.className - Class string or array.
 * @param {string|string[]} options.classes - Class string or array.
 * @param {Object} options.attrs - Safe attribute map.
 * @param {Object} options.dataset - Dataset value map.
 * @param {string|number} options.text - Text content.
 * @param {Array|Node|string|number} options.children - Children to append.
 * @returns {HTMLElement} Created element.
 * @example Called by UI modules that need safe DOM construction.
 */
export const createElement = (tagName, options = {}) => {
  if (!tagName || typeof tagName !== "string") {
    throw new TypeError("createElement requires a string tagName.");
  }

  const el = document.createElement(tagName);

  applyClasses(el, options.className);
  applyClasses(el, options.classes);
  applyAttributes(el, options.attrs);
  applyDataset(el, options.dataset);

  if (Object.prototype.hasOwnProperty.call(options, "text")) {
    setText(el, options.text);
  }

  if (Object.prototype.hasOwnProperty.call(options, "children")) {
    appendChildren(el, options.children);
  }

  return el;
};

/**
 * Sets element text content without interpreting markup.
 * @param {Element} el - Element receiving text.
 * @param {string|number|null|undefined} value - Text value to render.
 * @returns {Element} Updated element.
 * @example Called by createElement() and screen modules.
 */
export const setText = (el, value) => {
  if (!el) {
    throw new TypeError("setText requires an element.");
  }

  el.textContent = value === null || typeof value === "undefined"
    ? ""
    : String(value);

  return el;
};

/**
 * Sets sanitized HTML through the shared sanitizer.
 * @param {Element} el - Element receiving sanitized HTML.
 * @param {string} html - Raw HTML to sanitize before rendering.
 * @returns {Element} Updated element.
 * @example Called only where rendered markup is intentional.
 */
export const setSanitizedHtml = (el, html) => {
  if (!el) {
    throw new TypeError("setSanitizedHtml requires an element.");
  }

  el.innerHTML = sanitizeHtml(String(html || ""));
  return el;
};

/**
 * Appends node, text, or nested child arrays to an element.
 * @param {Element} el - Parent element.
 * @param {Array|Node|string|number|null|undefined} children - Child or children to append.
 * @returns {Element} Updated parent element.
 * @example Called by createElement() and screen modules.
 */
export const appendChildren = (el, children) => {
  if (!el) {
    throw new TypeError("appendChildren requires an element.");
  }

  if (children === null || typeof children === "undefined") {
    return el;
  }

  const childList = Array.isArray(children) ? children : [children];

  childList.forEach(child => {
    if (Array.isArray(child)) {
      appendChildren(el, child);
      return;
    }

    if (child === null || typeof child === "undefined" || child === false) return;

    if (child instanceof Node) {
      el.appendChild(child);
      return;
    }

    el.appendChild(document.createTextNode(String(child)));
  });

  return el;
};

/**
 * Adds an event listener and returns an idempotent cleanup callback.
 * @param {EventTarget} el - Event target receiving the listener.
 * @param {string} type - Event type.
 * @param {Function} handler - Event handler.
 * @param {Object|boolean} options - addEventListener options.
 * @returns {Function} Cleanup callback that removes the listener once.
 * @example Called by UI modules that create disposable views.
 */
export const addManagedEventListener = (el, type, handler, options) => {
  if (!el || typeof el.addEventListener !== "function") {
    throw new TypeError("addManagedEventListener requires an EventTarget.");
  }

  if (!type || typeof type !== "string") {
    throw new TypeError("addManagedEventListener requires a string event type.");
  }

  if (typeof handler !== "function") {
    throw new TypeError("addManagedEventListener requires a handler function.");
  }

  let isActive = true;
  el.addEventListener(type, handler, options);

  return () => {
    if (!isActive) return;
    isActive = false;
    el.removeEventListener(type, handler, options);
  };
};
