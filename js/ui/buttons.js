/**
 * Shared button helpers for extension pages and content-script overlays.
 */

import { createElement, setText } from "./dom.js";

const normalizeString = (value) => (typeof value === "string" ? value : "");

export const setButtonBusy = (button, busy, busyLabel = "") => {
  if (!button) return;

  const isBusy = Boolean(busy);
  button.disabled = isBusy;
  button.setAttribute("aria-busy", String(isBusy));

  if (isBusy && busyLabel) {
    if (!button.dataset.idleText) {
      button.dataset.idleText = button.textContent || "";
    }
    setText(button, busyLabel);
    return;
  }

  if (!isBusy && button.dataset.idleText !== undefined) {
    setText(button, button.dataset.idleText);
    delete button.dataset.idleText;
  }
};

export const setButtonDisabled = (button, disabled, reason = "") => {
  if (!button) return;

  button.disabled = Boolean(disabled);
  if (reason) {
    button.title = reason;
    button.setAttribute("aria-disabled", String(Boolean(disabled)));
  } else {
    button.removeAttribute("aria-disabled");
  }
};

export const createButton = ({
  label = "",
  title = "",
  ariaLabel = "",
  className = "button",
  classes = [],
  type = "button",
  disabled = false,
  onClick = null,
  attrs = {},
  dataset = {},
  children = [],
} = {}) => {
  const button = createElement("button", {
    className,
    classes,
    attrs: {
      type,
      title,
      "aria-label": ariaLabel || label || title,
      ...attrs,
    },
    dataset,
    text: children.length > 0 ? "" : normalizeString(label),
    children,
  });

  button.disabled = Boolean(disabled);

  const hasClickHandler = typeof onClick === "function";
  if (hasClickHandler) {
    button.addEventListener("click", onClick);
  }

  return {
    element: button,
    cleanup: () => {
      if (hasClickHandler) button.removeEventListener("click", onClick);
    },
  };
};

export const createIconButton = ({
  icon,
  label = "",
  title = "",
  className = "icon-button",
  classes = [],
  onClick = null,
  attrs = {},
  dataset = {},
} = {}) => {
  const children = [];

  if (typeof Node !== "undefined" && icon instanceof Node) {
    children.push(icon);
  } else if (typeof icon === "string" && icon.trim() !== "") {
    children.push(createElement("span", {
      className: "icon-button-icon",
      text: icon,
      attrs: { "aria-hidden": "true" },
    }));
  }

  if (label) {
    children.push(createElement("span", {
      className: "icon-button-label",
      text: label,
    }));
  }

  return createButton({
    label,
    title,
    ariaLabel: label || title,
    className,
    classes,
    onClick,
    attrs,
    dataset,
    children,
  });
};
