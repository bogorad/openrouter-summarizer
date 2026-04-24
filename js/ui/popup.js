// js/ui/popup.js
// Shared popup/modal primitive for extension overlays and extension pages.

import {
  addManagedEventListener,
  appendChildren,
  createElement,
  setText,
} from "./dom.js";

const DEFAULT_CLASS_NAMES = Object.freeze({
  host: "popup-host",
  root: "popup-root",
  surface: "popup-surface",
  header: "popup-header",
  title: "popup-title",
  closeButton: "popup-close-button",
  body: "popup-body",
  status: "popup-status",
  actions: "popup-actions",
});

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

let popupIdCounter = 0;

const createCleanupBucket = () => {
  const cleanupFns = [];
  let isCleanedUp = false;

  return {
    add: (cleanup) => {
      if (typeof cleanup === "function") cleanupFns.push(cleanup);
    },
    cleanup: () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      cleanupFns.splice(0).forEach(cleanup => cleanup());
    },
  };
};

const getEventPath = (event) => {
  if (typeof event.composedPath === "function") return event.composedPath();
  return [];
};

const getActiveElement = (root) => {
  if (root instanceof ShadowRoot) {
    return root.activeElement || document.activeElement;
  }

  return document.activeElement;
};

const isElementVisible = (element) => {
  if (!(element instanceof HTMLElement)) return false;
  if (!element.isConnected) return false;

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
};

/**
 * Returns visible focusable elements inside a popup surface.
 * @param {HTMLElement} container - Popup surface or body.
 * @returns {HTMLElement[]} Focusable elements.
 * @example Called by createPopup() focus management handlers.
 */
export const getPopupFocusableElements = (container) => {
  if (!container) return [];

  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(isElementVisible);
};

const focusElement = (element) => {
  if (!(element instanceof HTMLElement) || typeof element.focus !== "function") {
    return false;
  }

  try {
    element.focus();
    return true;
  } catch (error) {
    return false;
  }
};

const resolveInitialFocus = (initialFocus, surface) => {
  if (initialFocus instanceof HTMLElement) return initialFocus;

  if (typeof initialFocus === "string" && initialFocus) {
    return surface.querySelector(initialFocus);
  }

  if (typeof initialFocus === "function") {
    const resolved = initialFocus({ surface });
    if (resolved instanceof HTMLElement) return resolved;
  }

  return getPopupFocusableElements(surface)[0] || surface;
};

const restoreFocus = (element) => {
  if (!(element instanceof HTMLElement)) return;
  if (!element.isConnected) return;
  focusElement(element);
};

const normalizeClassNames = (classNames = {}) => ({
  ...DEFAULT_CLASS_NAMES,
  ...classNames,
});

const createHost = ({
  id = "",
  hostClassName = "",
  parent = document.body,
  attrs = {},
  dataset = {},
} = {}) => {
  const host = createElement("div", {
    className: hostClassName,
    attrs: {
      id: id || undefined,
      "data-extension-ui": "true",
      ...attrs,
    },
    dataset,
  });

  parent.appendChild(host);
  return host;
};

const createCloseButton = ({
  className,
  label = "Close",
  text = "x",
  onClick,
}) => {
  const button = createElement("button", {
    className,
    attrs: {
      type: "button",
      title: label,
      "aria-label": label,
    },
    text,
  });

  const cleanup = addManagedEventListener(button, "click", onClick);
  return { button, cleanup };
};

const renderContent = (container, content, context) => {
  container.replaceChildren();

  if (typeof content === "function") {
    appendChildren(container, content(context));
    return;
  }

  appendChildren(container, content);
};

/**
 * Creates a reusable popup/modal controller.
 * @param {Object} options - Popup options.
 * @param {string} options.id - Optional host id.
 * @param {HTMLElement} options.parent - Parent receiving the popup host.
 * @param {boolean} options.useShadowRoot - Whether to render inside a shadow root.
 * @param {string} options.shadowMode - Shadow root mode.
 * @param {string} options.styles - Optional CSS text injected into the render root.
 * @param {string|Node|Array|Function} options.body - Initial body content.
 * @param {string|Node|Array|Function} options.actions - Optional action content.
 * @param {string} options.title - Dialog title text.
 * @param {boolean} options.closeOnEscape - Whether Escape closes the popup.
 * @param {boolean} options.closeOnOutsideClick - Whether outside pointer/click closes it.
 * @param {boolean} options.trapFocus - Whether Tab stays inside the popup.
 * @param {boolean} options.restoreFocus - Whether close returns focus to the previous element.
 * @param {boolean} options.includeCloseButton - Whether to render a close button.
 * @param {boolean} options.includeStatus - Whether to render a status region.
 * @param {Function} options.onClose - Called when close is requested.
 * @param {Function} options.onCleanup - Called once after cleanup.
 * @returns {Object} Popup controller with render, focus, close, cleanup, and element refs.
 * @example Called by popup-owning modules during screen migration.
 */
export const createPopup = (options = {}) => {
  const cleanupBucket = createCleanupBucket();
  const classNames = normalizeClassNames(options.classNames);
  const parent = options.parent || document.body;
  const instanceId = ++popupIdCounter;
  const titleId = options.titleId || `popup-title-${instanceId}`;
  const bodyId = options.bodyId || `popup-body-${instanceId}`;
  const closeReasonDefault = "api";
  const restoreFocusOnClose = options.restoreFocus !== false;
  const closeOnEscape = options.closeOnEscape !== false;
  const closeOnOutsideClick = options.closeOnOutsideClick !== false;
  const trapFocus = options.trapFocus !== false;

  let isOpen = true;
  let hasCleanedUp = false;
  const previouslyFocusedElement = document.activeElement;

  const host = createHost({
    id: options.id || "",
    hostClassName: options.hostClassName || classNames.host,
    parent,
    attrs: options.hostAttrs || {},
    dataset: options.hostDataset || {},
  });
  const root = options.useShadowRoot
    ? host.attachShadow({ mode: options.shadowMode || "open" })
    : host;

  const surface = createElement("div", {
    className: options.surfaceClassName || classNames.surface,
    attrs: {
      role: options.role || "dialog",
      "aria-modal": options.modal === false ? undefined : "true",
      "aria-labelledby": titleId,
      "aria-describedby": bodyId,
      tabindex: "-1",
      ...options.surfaceAttrs,
    },
  });
  const rootElement = createElement("div", {
    className: options.rootClassName || classNames.root,
    attrs: options.rootAttrs || {},
    children: [surface],
  });
  const body = createElement("div", {
    className: options.bodyClassName || classNames.body,
    attrs: {
      id: bodyId,
      ...options.bodyAttrs,
    },
  });
  const status = createElement("div", {
    className: options.statusClassName || classNames.status,
    attrs: {
      role: "status",
      "aria-live": "polite",
      hidden: options.includeStatus ? undefined : true,
      ...options.statusAttrs,
    },
  });

  if (options.styles) {
    root.appendChild(createElement("style", {
      text: options.styles,
    }));
  }

  const close = (reason = closeReasonDefault, event = null) => {
    if (!isOpen) return;
    isOpen = false;

    if (typeof options.onClose === "function") {
      options.onClose({ reason, event, popup: controller });
    }

    cleanup();
  };

  const closeButton = options.includeCloseButton === false
    ? null
    : createCloseButton({
      className: options.closeButtonClassName || classNames.closeButton,
      label: options.closeLabel || "Close",
      text: options.closeText || "x",
      onClick: (event) => close("close-button", event),
    });

  if (closeButton) cleanupBucket.add(closeButton.cleanup);

  const headerChildren = [];
  if (options.title || options.titleNode) {
    headerChildren.push(options.titleNode || createElement("div", {
      className: options.titleClassName || classNames.title,
      attrs: { id: titleId },
      text: options.title,
    }));
  } else {
    surface.removeAttribute("aria-labelledby");
  }
  if (closeButton) headerChildren.push(closeButton.button);

  if (headerChildren.length > 0) {
    surface.appendChild(createElement("div", {
      className: options.headerClassName || classNames.header,
      children: headerChildren,
    }));
  }

  surface.appendChild(body);
  if (options.includeStatus) surface.appendChild(status);

  const actions = createElement("div", {
    className: options.actionsClassName || classNames.actions,
  });
  if (Object.prototype.hasOwnProperty.call(options, "actions")) {
    renderContent(actions, options.actions, { body, status, surface });
    surface.appendChild(actions);
  }

  root.appendChild(rootElement);

  const focus = () => {
    const target = resolveInitialFocus(options.initialFocus, surface);
    focusElement(target);
  };

  const render = (content) => {
    renderContent(body, content, { body, status, surface });
  };

  const setStatus = (message = "", {
    assertive = false,
    hidden = false,
    className = "",
  } = {}) => {
    if (className) status.className = className;
    status.hidden = Boolean(hidden);
    status.setAttribute("aria-live", assertive ? "assertive" : "polite");
    setText(status, message);
  };

  const containsEventTarget = (event) => {
    const path = getEventPath(event);
    if (path.length > 0) return path.includes(surface);
    return event.target instanceof Node && surface.contains(event.target);
  };

  const handleKeydown = (event) => {
    if (closeOnEscape && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close("escape", event);
      return;
    }

    if (!trapFocus || event.key !== "Tab") return;

    const focusables = getPopupFocusableElements(surface);
    if (focusables.length === 0) {
      event.preventDefault();
      focusElement(surface);
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const activeElement = getActiveElement(root);
    const activeIsInside = activeElement instanceof Node && surface.contains(activeElement);

    if (!activeIsInside) {
      event.preventDefault();
      focusElement(event.shiftKey ? last : first);
      return;
    }

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      focusElement(last);
      return;
    }

    if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      focusElement(first);
    }
  };

  const handleFocusIn = (event) => {
    if (!trapFocus) return;
    if (containsEventTarget(event)) return;

    const focusables = getPopupFocusableElements(surface);
    focusElement(focusables[0] || surface);
  };

  const handleOutsideClick = (event) => {
    if (!closeOnOutsideClick) return;
    if (containsEventTarget(event)) return;
    close("outside", event);
  };

  const cleanup = () => {
    if (hasCleanedUp) return;
    hasCleanedUp = true;
    cleanupBucket.cleanup();

    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }

    if (restoreFocusOnClose) restoreFocus(previouslyFocusedElement);

    if (typeof options.onCleanup === "function") {
      options.onCleanup({ popup: controller });
    }
  };

  cleanupBucket.add(addManagedEventListener(document, "keydown", handleKeydown, true));
  cleanupBucket.add(addManagedEventListener(document, "focusin", handleFocusIn, true));
  cleanupBucket.add(addManagedEventListener(document, "pointerdown", handleOutsideClick, true));

  if (Object.prototype.hasOwnProperty.call(options, "body")) {
    render(options.body);
  }

  const controller = {
    actions,
    body,
    cleanup,
    close,
    closeButton: closeButton?.button || null,
    focus,
    host,
    render,
    replaceBody: render,
    root,
    rootElement,
    setStatus,
    status,
    surface,
  };

  if (options.autoFocus !== false) {
    requestAnimationFrame(focus);
  }

  return controller;
};

export const createModal = createPopup;
