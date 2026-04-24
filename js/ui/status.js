/**
 * Shared status-message helpers.
 */

import { createElement, setText } from "./dom.js";

export const STATUS_TYPES = Object.freeze({
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
});

export const createStatusMessage = ({
  message = "",
  type = STATUS_TYPES.INFO,
  className = "status-message",
  role = "status",
} = {}) => createElement("div", {
  className,
  classes: [type],
  attrs: {
    role,
    "aria-live": type === STATUS_TYPES.ERROR ? "assertive" : "polite",
  },
  text: message,
});

export const setStatusMessage = (element, message = "", type = STATUS_TYPES.INFO) => {
  if (!element) return;

  Object.values(STATUS_TYPES).forEach((statusType) => {
    element.classList.remove(statusType);
  });
  element.classList.add(type);
  element.setAttribute("aria-live", type === STATUS_TYPES.ERROR ? "assertive" : "polite");
  setText(element, message);
};

export const clearStatusMessage = (element) => {
  if (!element) return;

  Object.values(STATUS_TYPES).forEach((statusType) => {
    element.classList.remove(statusType);
  });
  setText(element, "");
};

export const showTemporaryStatus = (
  element,
  message,
  type = STATUS_TYPES.INFO,
  durationMs = 1500,
) => {
  setStatusMessage(element, message, type);

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return () => {};
  }

  const timeoutId = setTimeout(() => clearStatusMessage(element), durationMs);
  return () => clearTimeout(timeoutId);
};
