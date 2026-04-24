// js/options/modelSection.js
// Renders and manages the options page model list.

import { createAutocomplete } from "../ui/autocomplete.js";
import { addManagedEventListener, createElement } from "../ui/dom.js";
import {
  createInputRow,
  createRemoveButton,
  createRepeatedListRow,
  setAddButtonMaxState,
} from "../ui/formRows.js";

const DEFAULT_MAX_MODELS = 10;

/**
 * Removes OpenRouter model variant suffixes from a model ID.
 *
 * Call sites: options pricing and model validation paths.
 *
 * @param {string} modelId
 * @returns {string}
 */
export const getBaseModelId = (modelId) => {
  if (typeof modelId !== "string") return "";
  const trimmed = modelId.trim();
  if (trimmed === "") return "";
  const colonIndex = trimmed.indexOf(":");
  return colonIndex === -1 ? trimmed : trimmed.substring(0, colonIndex);
};

const getModelId = (model) => (typeof model?.id === "string" ? model.id : "");

const getTrimmedModelId = (model) => getModelId(model).trim();

const getValidModelIds = (models) =>
  models
    .map(getTrimmedModelId)
    .filter((modelId) => modelId !== "");

/**
 * Keeps summary/chat defaults pointed at configured model IDs.
 *
 * Call sites: createOptionsModelSection render and tests.
 *
 * @param {object} state
 * @returns {boolean}
 */
export const normalizeModelDefaults = (state) => {
  const validModelIds = getValidModelIds(state.models || []);
  const fallbackModelId = validModelIds.length > 0 ? validModelIds[0] : "";
  let changed = false;

  if (!validModelIds.includes(state.summaryModelId)) {
    state.setSummaryModelId
      ? state.setSummaryModelId(fallbackModelId)
      : (state.summaryModelId = fallbackModelId);
    changed = true;
  }

  if (!validModelIds.includes(state.chatModelId)) {
    state.setChatModelId
      ? state.setChatModelId(fallbackModelId)
      : (state.chatModelId = fallbackModelId);
    changed = true;
  }

  return changed;
};

const filterModels = (query, models) => {
  const lowerQuery = String(query || "").toLowerCase().trim();
  if (!lowerQuery || !Array.isArray(models)) return [];

  return models
    .filter(
      (model) =>
        getModelId(model).toLowerCase().includes(lowerQuery) ||
        (model.name && model.name.toLowerCase().includes(lowerQuery)),
    )
    .slice(0, 10);
};

const renderModelSuggestion = (model) =>
  createElement("span", {
    className: "model-name",
    text: model.name ? `${model.id} (${model.name})` : model.id,
  });

const createModelRadio = ({
  id,
  name,
  label,
  modelId,
  checked,
  disabled,
  onChange,
}) => {
  const radio = createElement("input", {
    attrs: {
      type: "radio",
      id,
      name,
      value: modelId,
      disabled,
    },
  });
  radio.checked = checked;
  const cleanup = addManagedEventListener(radio, "change", onChange);

  return {
    element: createElement("div", {
      className: "radio-group",
      children: [
        radio,
        createElement("label", {
          className: "radio-label",
          attrs: { for: id },
          text: label,
        }),
      ],
    }),
    input: radio,
    cleanup,
  };
};

/**
 * Creates the model section controller used by options.js.
 *
 * Call sites: options.js DOMContentLoaded initialization.
 *
 * @param {object} options
 * @returns {object}
 */
export const createOptionsModelSection = ({
  container,
  addButton,
  state,
  maxModels = DEFAULT_MAX_MODELS,
  getAutocompleteModels = () => [],
  hasApiKey = () => false,
  onPricingRecalculate = () => {},
  onCheckPricingData = () => {},
  onRefreshKnownModels = () => {},
  onSaveSettings = () => {},
  onDebug = () => false,
  alertUser = (message) => window.alert(message),
} = {}) => {
  const cleanupFns = [];

  const cleanupRows = () => {
    cleanupFns.splice(0).forEach((cleanup) => cleanup());
  };

  const debugLog = (...args) => {
    if (onDebug()) console.log(...args);
  };

  const setModels = (models) => {
    if (state.setModels) {
      state.setModels(models);
      return;
    }
    state.models = models;
    state.markDirty?.();
  };

  const setSummaryModelId = (modelId) => {
    if (state.setSummaryModelId) {
      state.setSummaryModelId(modelId);
      return;
    }
    state.summaryModelId = modelId;
  };

  const setChatModelId = (modelId) => {
    if (state.setChatModelId) {
      state.setChatModelId(modelId);
      return;
    }
    state.chatModelId = modelId;
  };

  const setModelId = (index, modelId) => {
    const nextModels = state.models.map((model, modelIndex) =>
      modelIndex === index ? { id: modelId } : { id: getModelId(model) },
    );
    setModels(nextModels);
  };

  const getFirstValidModelIdExcept = (excludedIndex) => {
    const firstValid = state.models.find(
      (model, index) => index !== excludedIndex && getTrimmedModelId(model) !== "",
    );
    return firstValid ? getTrimmedModelId(firstValid) : "";
  };

  const renderEmptyState = () => {
    container.appendChild(
      createElement("p", {
        text: "No models configured. Add one below or save to use defaults.",
      }),
    );
    if (addButton) addButton.disabled = true;
  };

  const handleRadioChange = (event) => {
    if (!event.target.checked) return;
    const modelId = event.target.value;

    if (event.target.name === "summary-default") {
      setSummaryModelId(modelId);
      debugLog(`[LLM Options] New Summary Default: ${state.summaryModelId}`);
      onPricingRecalculate();
    } else if (event.target.name === "chat-default") {
      setChatModelId(modelId);
      debugLog(`[LLM Options] New Chat Default: ${state.chatModelId}`);
    }

    onSaveSettings();
  };

  const handleModelTextChange = (event) => {
    const index = parseInt(event.target.dataset.index, 10);
    if (index < 0 || index >= state.models.length) return;

    const oldModelId = getTrimmedModelId(state.models[index]);
    const newModelId = event.target.value.trim();
    const isNewIdValid = newModelId !== "";

    setModelId(index, newModelId);

    const summaryRadio = document.getElementById(`summary-radio-${index}`);
    const chatRadio = document.getElementById(`chat-radio-${index}`);
    let needsRender = false;

    if (summaryRadio) {
      summaryRadio.value = newModelId;
      summaryRadio.disabled = !isNewIdValid;
      if (!isNewIdValid && summaryRadio.checked) {
        summaryRadio.checked = false;
        setSummaryModelId(getFirstValidModelIdExcept(index));
        needsRender = true;
      }
    }

    if (chatRadio) {
      chatRadio.value = newModelId;
      chatRadio.disabled = !isNewIdValid;
      if (!isNewIdValid && chatRadio.checked) {
        chatRadio.checked = false;
        setChatModelId(getFirstValidModelIdExcept(index));
        needsRender = true;
      }
    }

    if (needsRender) {
      debugLog("[LLM Options] Model ID made invalid, re-calculating defaults and re-rendering.");
      render();
      return;
    }

    if (oldModelId === state.summaryModelId && isNewIdValid) {
      setSummaryModelId(newModelId);
    }
    if (oldModelId === state.chatModelId && isNewIdValid) {
      setChatModelId(newModelId);
    }
  };

  const handleModelTextBlur = (event) => {
    const index = parseInt(event.target.dataset.index, 10);
    if (index < 0 || index >= state.models.length) return;

    const modelId = getTrimmedModelId(state.models[index]);
    if (modelId === "") {
      onPricingRecalculate();
      return;
    }

    const baseModelId = getBaseModelId(modelId);
    if (!baseModelId.includes("/") || baseModelId.endsWith("/")) {
      onPricingRecalculate();
      return;
    }

    if (!state.knownModelsAndPrices[baseModelId] && hasApiKey()) {
      onRefreshKnownModels();
      return;
    }

    onPricingRecalculate();
  };

  const removeModel = (index) => {
    if (index < 0 || index >= state.models.length) return;

    const removedModelId = getTrimmedModelId(state.models[index]);
    const nextModels = state.models.filter((_, modelIndex) => modelIndex !== index);
    setModels(nextModels);

    const remainingValidIds = getValidModelIds(nextModels);
    const newDefaultId = remainingValidIds.length > 0 ? remainingValidIds[0] : "";

    if (removedModelId !== "" && removedModelId === state.summaryModelId) {
      setSummaryModelId(newDefaultId);
      debugLog(
        `[LLM Options] Summary default removed, new default: ${state.summaryModelId || "None"}`,
      );
    }
    if (removedModelId !== "" && removedModelId === state.chatModelId) {
      setChatModelId(newDefaultId);
      debugLog(
        `[LLM Options] Chat default removed, new default: ${state.chatModelId || "None"}`,
      );
    }

    render();
  };

  const createModelRow = (model, index) => {
    const modelId = getTrimmedModelId(model);
    const isModelIdValid = modelId !== "";
    const inputRow = createInputRow({
      id: `modelText_${index}`,
      value: getModelId(model),
      placeholder: "Enter OpenRouter Model ID",
      className: "model-info",
      label: "",
      inputAttrs: { "aria-label": "OpenRouter Model ID" },
      inputDataset: { index },
      onInput: handleModelTextChange,
      onChange: handleModelTextChange,
    });
    inputRow.input.addEventListener("blur", handleModelTextBlur);

    const autocomplete = createAutocomplete({
      input: inputRow.input,
      items: () => getAutocompleteModels(),
      filterItems: filterModels,
      getItemLabel: (item) => item.name || item.id,
      getItemValue: (item) => item.id,
      renderItem: renderModelSuggestion,
      listboxLabel: "model suggestions",
      maxItems: 10,
      onSelect: () => {
        inputRow.input.dispatchEvent(new Event("input", { bubbles: true }));
      },
    });

    const summaryRadio = createModelRadio({
      id: `summary-radio-${index}`,
      name: "summary-default",
      label: "Summary",
      modelId,
      checked: isModelIdValid && modelId === state.summaryModelId,
      disabled: !isModelIdValid,
      onChange: handleRadioChange,
    });
    const chatRadio = createModelRadio({
      id: `chat-radio-${index}`,
      name: "chat-default",
      label: "Chat",
      modelId,
      checked: isModelIdValid && modelId === state.chatModelId,
      disabled: !isModelIdValid,
      onChange: handleRadioChange,
    });
    const modelRadios = createElement("div", {
      className: "model-radios",
      children: [summaryRadio.element, chatRadio.element],
    });
    const removeButton = createRemoveButton({
      label: "Remove this model",
      text: "x",
      title: "Remove this model",
      onClick: () => removeModel(index),
      dataset: { index },
    });
    const row = createRepeatedListRow({
      index,
      children: [inputRow.element, modelRadios],
      actions: [removeButton],
      className: "option-group model-option",
    });

    cleanupFns.push(
      inputRow.cleanup,
      () => inputRow.input.removeEventListener("blur", handleModelTextBlur),
      autocomplete.cleanup,
      summaryRadio.cleanup,
      chatRadio.cleanup,
      removeButton.cleanup,
      row.cleanup,
    );

    return row.element;
  };

  function render() {
    if (!container) return;
    cleanupRows();
    container.textContent = "";

    if (!state.models || state.models.length === 0) {
      renderEmptyState();
      return;
    }

    if (addButton) {
      setAddButtonMaxState(addButton, {
        count: state.models.length,
        max: maxModels,
        noun: "model",
        addTitle: `Add another model (max ${maxModels}).`,
        maxTitle: `Maximum limit of ${maxModels} models reached.`,
      });
    }

    normalizeModelDefaults(state);
    state.models.forEach((model, index) => {
      container.appendChild(createModelRow(model, index));
    });
    onPricingRecalculate();
  }

  const addModel = () => {
    if (state.models.length >= maxModels) {
      alertUser(`Maximum limit of ${maxModels} models reached.`);
      debugLog(`[LLM Options] Max models (${maxModels}) reached.`);
      return;
    }

    setModels([...state.models, { id: "" }]);
    render();
    const newInput = document.getElementById(`modelText_${state.models.length - 1}`);
    if (newInput) newInput.focus();
    onCheckPricingData();
    debugLog("[LLM Options] Added new model row (no label).");
  };

  return {
    addModel,
    cleanup: cleanupRows,
    render,
  };
};
