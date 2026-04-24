// js/ui/formRows.js
// Shared accessible form row, control, and repeated-list primitives.

import { addManagedEventListener, appendChildren, createElement, setText } from "./dom.js";
import { createButton, setButtonDisabled } from "./buttons.js";

const createCleanupBucket = () => {
  const cleanupFns = [];
  let isClean = false;

  return {
    add: (cleanup) => {
      if (typeof cleanup === "function") cleanupFns.push(cleanup);
    },
    cleanup: () => {
      if (isClean) return;
      isClean = true;
      cleanupFns.forEach(cleanup => cleanup());
    },
  };
};

const hasValue = (value) => value !== null && typeof value !== "undefined";

const normalizeOption = (option) => {
  if (typeof option === "string" || typeof option === "number") {
    return {
      label: String(option),
      value: String(option),
      disabled: false,
    };
  }

  return {
    label: hasValue(option?.label) ? String(option.label) : String(option?.value || ""),
    value: hasValue(option?.value) ? String(option.value) : "",
    disabled: Boolean(option?.disabled),
  };
};

const createControlId = (id, name, fallback) => {
  if (id) return id;
  if (name) return name;
  return fallback;
};

const setElementValue = (element, value) => {
  if (!hasValue(value)) return;
  element.value = String(value);
};

const applyControlOptions = (control, {
  id = "",
  name = "",
  value = null,
  placeholder = "",
  disabled = false,
  required = false,
  attrs = {},
  dataset = {},
} = {}) => {
  if (id) control.id = id;
  if (name) control.name = name;
  setElementValue(control, value);
  if (placeholder) control.placeholder = placeholder;
  control.disabled = Boolean(disabled);
  control.required = Boolean(required);

  Object.entries(dataset).forEach(([key, datasetValue]) => {
    if (!key || !hasValue(datasetValue)) return;
    control.dataset[key] = String(datasetValue);
  });

  Object.entries(attrs).forEach(([attrName, attrValue]) => {
    if (!attrName || attrValue === false || !hasValue(attrValue)) return;
    if (attrValue === true) {
      control.setAttribute(attrName, "");
      return;
    }
    control.setAttribute(attrName, String(attrValue));
  });
};

const addControlListener = (cleanupBucket, control, eventName, callback) => {
  if (typeof callback !== "function") return;
  cleanupBucket.add(addManagedEventListener(control, eventName, callback));
};

/**
 * Creates a labeled form row around an existing control.
 * @param {Object} options - Row options.
 * @param {HTMLElement|Object} options.control - Control element or primitive result.
 * @returns {Object} Row primitive with element, control, label, and cleanup.
 * @example Called by createInputRow(), createSelectRow(), and future options screens.
 */
export const createFormRow = ({
  id = "",
  label = "",
  description = "",
  error = "",
  control,
  required = false,
  className = "form-row",
  classes = [],
  labelClassName = "form-row-label",
  controlClassName = "form-row-control",
  descriptionClassName = "form-row-description",
  errorClassName = "form-row-error",
  attrs = {},
  dataset = {},
} = {}) => {
  const cleanupBucket = createCleanupBucket();
  const controlElement = control?.element || control;

  if (!controlElement) {
    throw new TypeError("createFormRow requires a control element.");
  }

  const controlId = createControlId(controlElement.id || id, controlElement.name, "");
  if (controlId && !controlElement.id) {
    controlElement.id = controlId;
  }

  const labelElement = createElement("label", {
    className: labelClassName,
    attrs: { for: controlElement.id || undefined },
    text: label,
  });

  if (required) {
    labelElement.appendChild(createElement("span", {
      className: "form-row-required",
      attrs: { "aria-hidden": "true" },
      text: "*",
    }));
  }

  const descriptionId = controlElement.id ? `${controlElement.id}-description` : "";
  const errorId = controlElement.id ? `${controlElement.id}-error` : "";
  const descriptionElement = createElement("div", {
    className: descriptionClassName,
    attrs: { id: descriptionId || undefined },
    text: description,
  });
  const errorElement = createElement("div", {
    className: errorClassName,
    attrs: {
      id: errorId || undefined,
      role: "alert",
      "aria-live": "polite",
    },
    text: error,
  });

  const describedBy = [description && descriptionId, error && errorId]
    .filter(Boolean)
    .join(" ");
  if (describedBy) {
    controlElement.setAttribute("aria-describedby", describedBy);
  }
  if (error) {
    controlElement.setAttribute("aria-invalid", "true");
  }

  const controlWrap = createElement("div", {
    className: controlClassName,
    children: [controlElement, descriptionElement, errorElement],
  });

  const row = createElement("div", {
    className,
    classes,
    attrs,
    dataset,
    children: [labelElement, controlWrap],
  });

  cleanupBucket.add(control?.cleanup);

  return {
    element: row,
    row,
    control: controlElement,
    label: labelElement,
    description: descriptionElement,
    error: errorElement,
    cleanup: cleanupBucket.cleanup,
    setDescription: (message) => {
      setText(descriptionElement, message);
      if (message && descriptionId) {
        controlElement.setAttribute("aria-describedby", [descriptionId, errorElement.textContent && errorId].filter(Boolean).join(" "));
      }
    },
    setError: (message) => {
      setText(errorElement, message);
      if (message) {
        controlElement.setAttribute("aria-invalid", "true");
        if (errorId) {
          controlElement.setAttribute("aria-describedby", [descriptionElement.textContent && descriptionId, errorId].filter(Boolean).join(" "));
        }
        return;
      }
      controlElement.removeAttribute("aria-invalid");
      if (descriptionElement.textContent && descriptionId) {
        controlElement.setAttribute("aria-describedby", descriptionId);
      } else {
        controlElement.removeAttribute("aria-describedby");
      }
    },
  };
};

/**
 * Creates a text-like input row with managed input/change callbacks.
 * @param {Object} options - Input row options.
 * @returns {Object} Form row primitive with input control and cleanup.
 * @example Called by options sections that render model, language, and token fields.
 */
export const createInputRow = ({
  type = "text",
  id = "",
  name = "",
  label = "",
  value = "",
  placeholder = "",
  onInput = null,
  onChange = null,
  className = "form-row",
  inputClassName = "form-input",
  inputClasses = [],
  attrs = {},
  inputAttrs = {},
  dataset = {},
  inputDataset = {},
  ...rowOptions
} = {}) => {
  const cleanupBucket = createCleanupBucket();
  const control = createElement("input", {
    className: inputClassName,
    classes: inputClasses,
    attrs: { type, ...inputAttrs },
  });

  applyControlOptions(control, {
    id,
    name,
    value,
    placeholder,
    disabled: rowOptions.disabled,
    required: rowOptions.required,
    attrs: {},
    dataset: inputDataset,
  });
  addControlListener(cleanupBucket, control, "input", onInput);
  addControlListener(cleanupBucket, control, "change", onChange);

  const row = createFormRow({
    ...rowOptions,
    id,
    label,
    control,
    className,
    attrs,
    dataset,
  });
  cleanupBucket.add(row.cleanup);

  return {
    ...row,
    input: control,
    cleanup: cleanupBucket.cleanup,
  };
};

/**
 * Creates a select row from normalized option values.
 * @param {Object} options - Select row options.
 * @returns {Object} Form row primitive with select control and cleanup.
 * @example Called by screens that need accessible model or setting dropdowns.
 */
export const createSelectRow = ({
  id = "",
  name = "",
  label = "",
  value = "",
  options = [],
  onChange = null,
  className = "form-row",
  selectClassName = "form-select",
  selectClasses = [],
  attrs = {},
  selectAttrs = {},
  dataset = {},
  selectDataset = {},
  ...rowOptions
} = {}) => {
  const cleanupBucket = createCleanupBucket();
  const select = createElement("select", {
    className: selectClassName,
    classes: selectClasses,
    attrs: selectAttrs,
  });

  applyControlOptions(select, {
    id,
    name,
    value: null,
    disabled: rowOptions.disabled,
    required: rowOptions.required,
    dataset: selectDataset,
  });

  options.map(normalizeOption).forEach(option => {
    select.appendChild(createElement("option", {
      attrs: {
        value: option.value,
        disabled: option.disabled,
      },
      text: option.label,
    }));
  });
  select.value = String(value || "");
  addControlListener(cleanupBucket, select, "change", onChange);

  const row = createFormRow({
    ...rowOptions,
    id,
    label,
    control: select,
    className,
    attrs,
    dataset,
  });
  cleanupBucket.add(row.cleanup);

  return {
    ...row,
    select,
    cleanup: cleanupBucket.cleanup,
  };
};

/**
 * Creates a textarea row with managed input/change callbacks.
 * @param {Object} options - Textarea row options.
 * @returns {Object} Form row primitive with textarea control and cleanup.
 * @example Called by prompt editors and longer settings fields.
 */
export const createTextareaRow = ({
  id = "",
  name = "",
  label = "",
  value = "",
  placeholder = "",
  rows = 3,
  onInput = null,
  onChange = null,
  className = "form-row",
  textareaClassName = "form-textarea",
  textareaClasses = [],
  attrs = {},
  textareaAttrs = {},
  dataset = {},
  textareaDataset = {},
  ...rowOptions
} = {}) => {
  const cleanupBucket = createCleanupBucket();
  const textarea = createElement("textarea", {
    className: textareaClassName,
    classes: textareaClasses,
    attrs: { rows, ...textareaAttrs },
  });

  applyControlOptions(textarea, {
    id,
    name,
    value,
    placeholder,
    disabled: rowOptions.disabled,
    required: rowOptions.required,
    dataset: textareaDataset,
  });
  addControlListener(cleanupBucket, textarea, "input", onInput);
  addControlListener(cleanupBucket, textarea, "change", onChange);

  const row = createFormRow({
    ...rowOptions,
    id,
    label,
    control: textarea,
    className,
    attrs,
    dataset,
  });
  cleanupBucket.add(row.cleanup);

  return {
    ...row,
    textarea,
    cleanup: cleanupBucket.cleanup,
  };
};

/**
 * Creates a checkbox row where the label activates the checkbox.
 * @param {Object} options - Checkbox row options.
 * @returns {Object} Checkbox primitive with element, checkbox, label, and cleanup.
 * @example Called by boolean settings controls.
 */
export const createCheckboxRow = ({
  id = "",
  name = "",
  label = "",
  checked = false,
  value = "1",
  description = "",
  onChange = null,
  className = "form-row form-checkbox-row",
  checkboxClassName = "form-checkbox",
  attrs = {},
  checkboxAttrs = {},
  dataset = {},
  checkboxDataset = {},
  disabled = false,
  required = false,
} = {}) => {
  const cleanupBucket = createCleanupBucket();
  const checkbox = createElement("input", {
    className: checkboxClassName,
    attrs: { type: "checkbox", ...checkboxAttrs },
  });
  applyControlOptions(checkbox, {
    id,
    name,
    value,
    disabled,
    required,
    dataset: checkboxDataset,
  });
  checkbox.checked = Boolean(checked);
  addControlListener(cleanupBucket, checkbox, "change", onChange);

  const checkboxLabel = createElement("label", {
    className: "form-checkbox-label",
    attrs: { for: checkbox.id || undefined },
    children: [
      checkbox,
      createElement("span", {
        className: "form-checkbox-label-text",
        text: label,
      }),
    ],
  });
  const descriptionElement = createElement("div", {
    className: "form-row-description",
    attrs: { id: checkbox.id ? `${checkbox.id}-description` : undefined },
    text: description,
  });
  if (description && checkbox.id) {
    checkbox.setAttribute("aria-describedby", `${checkbox.id}-description`);
  }

  const row = createElement("div", {
    className,
    attrs,
    dataset,
    children: [checkboxLabel, descriptionElement],
  });

  return {
    element: row,
    row,
    checkbox,
    control: checkbox,
    label: checkboxLabel,
    description: descriptionElement,
    cleanup: cleanupBucket.cleanup,
  };
};

/**
 * Creates an accessible radio group row.
 * @param {Object} options - Radio group row options.
 * @returns {Object} Radio group primitive with inputs and cleanup.
 * @example Called by model default summary/chat selection renderers.
 */
export const createRadioGroupRow = ({
  id = "",
  name = "",
  label = "",
  value = "",
  options = [],
  onChange = null,
  className = "form-row form-radio-row",
  groupClassName = "form-radio-group",
  optionClassName = "form-radio-option",
  attrs = {},
  dataset = {},
  disabled = false,
  required = false,
} = {}) => {
  const cleanupBucket = createCleanupBucket();
  const labelId = id ? `${id}-label` : "";
  const group = createElement("div", {
    className: groupClassName,
    attrs: {
      role: "radiogroup",
      "aria-labelledby": labelId || undefined,
    },
  });
  const inputs = [];

  options.map(normalizeOption).forEach((option, index) => {
    const optionId = `${id || name}-option-${index}`;
    const input = createElement("input", {
      className: "form-radio",
      attrs: {
        type: "radio",
        id: optionId,
        name,
        value: option.value,
        disabled: disabled || option.disabled,
        required,
      },
    });
    input.checked = option.value === String(value || "");
    addControlListener(cleanupBucket, input, "change", onChange);
    inputs.push(input);

    group.appendChild(createElement("div", {
      className: optionClassName,
      children: [
        input,
        createElement("label", {
          className: "form-radio-label",
          attrs: { for: optionId },
          text: option.label,
        }),
      ],
    }));
  });

  const legend = createElement("div", {
    className: "form-row-label",
    attrs: { id: labelId || undefined },
    text: label,
  });
  const row = createElement("div", {
    className,
    attrs,
    dataset,
    children: [legend, group],
  });

  return {
    element: row,
    row,
    group,
    inputs,
    cleanup: cleanupBucket.cleanup,
  };
};

/**
 * Creates the standard remove button used by repeated rows.
 * @param {Object} options - Remove button options.
 * @returns {Object} Button primitive with cleanup.
 * @example Called by repeated model, language, and quick prompt rows.
 */
export const createRemoveButton = ({
  label = "Remove",
  text = "x",
  title = "",
  onClick = null,
  className = "button remove-button",
  classes = [],
  attrs = {},
  dataset = {},
} = {}) => createButton({
  label: text,
  title: title || label,
  ariaLabel: label,
  className,
  classes,
  onClick,
  attrs,
  dataset,
});

/**
 * Creates a repeated list row with optional actions and cleanup composition.
 * @param {Object} options - Repeated row options.
 * @returns {Object} Repeated row primitive with element and cleanup.
 * @example Called by dynamic settings lists after screen migration.
 */
export const createRepeatedListRow = ({
  index = null,
  children = [],
  actions = [],
  className = "option-group form-list-row",
  classes = [],
  attrs = {},
  dataset = {},
} = {}) => {
  const cleanupBucket = createCleanupBucket();
  const rowDataset = { ...dataset };
  if (hasValue(index)) rowDataset.index = index;

  const actionElements = actions.map(action => {
    cleanupBucket.add(action?.cleanup);
    return action?.element || action;
  });
  const actionWrap = createElement("div", {
    className: "form-list-row-actions",
    children: actionElements,
  });
  const row = createElement("div", {
    className,
    classes,
    attrs,
    dataset: rowDataset,
    children: [children, actionElements.length > 0 ? actionWrap : null],
  });

  return {
    element: row,
    row,
    cleanup: cleanupBucket.cleanup,
  };
};

/**
 * Applies max-cap disabled/title state to an add button.
 * @param {HTMLButtonElement} button - Button receiving the capped state.
 * @param {Object} options - Cap state options.
 * @returns {boolean} True when the cap is reached.
 * @example Called after repeated settings rows are rendered.
 */
export const setAddButtonMaxState = (button, {
  count = 0,
  max = 0,
  noun = "item",
  addTitle = "",
  maxTitle = "",
} = {}) => {
  const atCap = max > 0 && count >= max;
  const title = atCap
    ? maxTitle || `Maximum limit of ${max} ${noun}s reached.`
    : addTitle || `Add another ${noun} (max ${max}).`;

  setButtonDisabled(button, atCap, title);
  button.title = title;
  return atCap;
};

export const appendFormControls = (parent, controls) => {
  const cleanupBucket = createCleanupBucket();
  const elements = controls.map(control => {
    cleanupBucket.add(control?.cleanup);
    return control?.element || control;
  });

  appendChildren(parent, elements);
  return cleanupBucket.cleanup;
};
