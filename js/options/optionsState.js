// js/options/optionsState.js
// Owns mutable options-page form state while section modules are migrated.

const USER_FORMATTING_START_TAG = "<user_formatting>";
const USER_FORMATTING_END_TAG = "</user_formatting>";

const cloneModel = (model) => ({ id: typeof model?.id === "string" ? model.id : "" });

const cloneLanguage = (language) => ({
  language_name:
    typeof language?.language_name === "string" ? language.language_name : "",
  svg_path: typeof language?.svg_path === "string" ? language.svg_path : "",
});

const cloneQuickPrompt = (prompt) => ({
  title: typeof prompt?.title === "string" ? prompt.title : "",
  prompt: typeof prompt?.prompt === "string" ? prompt.prompt : "",
});

const cloneRecord = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
};

const normalizeTokenState = (tokens = {}) => ({
  apiKey: typeof tokens.apiKey === "string" ? tokens.apiKey : "",
  newsblurToken:
    typeof tokens.newsblurToken === "string" ? tokens.newsblurToken : "",
  joplinToken: typeof tokens.joplinToken === "string" ? tokens.joplinToken : "",
});

const normalizeTokenCapabilities = (capabilities = {}) => ({
  hasApiKey: capabilities.hasApiKey === true,
  hasNewsblurToken: capabilities.hasNewsblurToken === true,
  hasJoplinToken: capabilities.hasJoplinToken === true,
});

const cloneState = (state) => ({
  models: state.models.map(cloneModel),
  summaryModelId: state.summaryModelId,
  chatModelId: state.chatModelId,
  languages: state.languages.map(cloneLanguage),
  quickPrompts: state.quickPrompts.map(cloneQuickPrompt),
  promptTemplate: state.promptTemplate,
  promptParts: { ...state.promptParts },
  maxRequestPrice: state.maxRequestPrice,
  maxPriceBehavior: state.maxPriceBehavior,
  summaryKbLimit: state.summaryKbLimit,
  debug: state.debug,
  bulletCount: state.bulletCount,
  alwaysUseUsEnglish: state.alwaysUseUsEnglish,
  alsoSendToJoplin: state.alsoSendToJoplin,
  tokens: { ...state.tokens },
  tokenCapabilities: { ...state.tokenCapabilities },
  pricingCache: cloneRecord(state.pricingCache),
  knownModelsAndPrices: cloneRecord(state.knownModelsAndPrices),
  dirty: state.dirty,
  saving: state.saving,
});

const parsePromptTemplate = (template) => {
  const promptTemplate = typeof template === "string" ? template : "";
  const startIndex = promptTemplate.indexOf(USER_FORMATTING_START_TAG);
  const endIndex = promptTemplate.indexOf(USER_FORMATTING_END_TAG);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return {
      prefix: "",
      editableContent: promptTemplate,
      suffix: "",
    };
  }

  const editableStart = startIndex + USER_FORMATTING_START_TAG.length;
  return {
    prefix: promptTemplate.substring(0, editableStart),
    editableContent: promptTemplate.substring(editableStart, endIndex),
    suffix: promptTemplate.substring(endIndex),
  };
};

const replacePromptEditableContent = (template, editableContent) => {
  const promptTemplate = typeof template === "string" ? template : "";
  const nextEditableContent =
    typeof editableContent === "string" ? editableContent : "";

  if (
    !promptTemplate.includes(USER_FORMATTING_START_TAG) ||
    !promptTemplate.includes(USER_FORMATTING_END_TAG)
  ) {
    return promptTemplate;
  }

  return promptTemplate.replace(
    /<user_formatting>[\s\S]*?<\/user_formatting>/,
    `${USER_FORMATTING_START_TAG}\n${nextEditableContent}\n${USER_FORMATTING_END_TAG}`,
  );
};

/**
 * Creates the options form state controller.
 *
 * Call sites: options.js now owns form state through this controller until
 * smaller options section controllers are extracted.
 *
 * @param {object} defaults
 * @returns {object}
 */
export const createOptionsState = (defaults = {}) => {
  const state = {
    models: Array.isArray(defaults.models) ? defaults.models.map(cloneModel) : [],
    summaryModelId:
      typeof defaults.summaryModelId === "string" ? defaults.summaryModelId : "",
    chatModelId:
      typeof defaults.chatModelId === "string" ? defaults.chatModelId : "",
    languages: Array.isArray(defaults.languages)
      ? defaults.languages.map(cloneLanguage)
      : [],
    quickPrompts: Array.isArray(defaults.quickPrompts)
      ? defaults.quickPrompts.map(cloneQuickPrompt)
      : [],
    promptTemplate:
      typeof defaults.promptTemplate === "string" ? defaults.promptTemplate : "",
    promptParts: parsePromptTemplate(defaults.promptTemplate),
    maxRequestPrice:
      typeof defaults.maxRequestPrice === "number" ? defaults.maxRequestPrice : 0,
    maxPriceBehavior:
      typeof defaults.maxPriceBehavior === "string"
        ? defaults.maxPriceBehavior
        : "truncate",
    summaryKbLimit: "",
    debug: defaults.debug === true,
    bulletCount:
      typeof defaults.bulletCount === "string" ? defaults.bulletCount : "5",
    alwaysUseUsEnglish: defaults.alwaysUseUsEnglish !== false,
    alsoSendToJoplin: defaults.alsoSendToJoplin === true,
    tokens: normalizeTokenState(defaults.tokens),
    tokenCapabilities: normalizeTokenCapabilities(defaults.tokenCapabilities),
    pricingCache: cloneRecord(defaults.pricingCache),
    knownModelsAndPrices: cloneRecord(defaults.knownModelsAndPrices),
    dirty: defaults.dirty === true,
    saving: defaults.saving === true,
  };

  const markDirty = () => {
    state.dirty = true;
  };

  const updatePromptParts = () => {
    state.promptParts = parsePromptTemplate(state.promptTemplate);
  };

  return {
    get models() {
      return state.models;
    },
    set models(models) {
      state.models = Array.isArray(models) ? models.map(cloneModel) : [];
      markDirty();
    },
    get summaryModelId() {
      return state.summaryModelId;
    },
    set summaryModelId(modelId) {
      state.summaryModelId = typeof modelId === "string" ? modelId : "";
      markDirty();
    },
    get chatModelId() {
      return state.chatModelId;
    },
    set chatModelId(modelId) {
      state.chatModelId = typeof modelId === "string" ? modelId : "";
      markDirty();
    },
    get languages() {
      return state.languages;
    },
    set languages(languages) {
      state.languages = Array.isArray(languages)
        ? languages.map(cloneLanguage)
        : [];
      markDirty();
    },
    get quickPrompts() {
      return state.quickPrompts;
    },
    set quickPrompts(prompts) {
      state.quickPrompts = Array.isArray(prompts)
        ? prompts.map(cloneQuickPrompt)
        : [];
      markDirty();
    },
    get promptTemplate() {
      return state.promptTemplate;
    },
    set promptTemplate(template) {
      state.promptTemplate = typeof template === "string" ? template : "";
      updatePromptParts();
      markDirty();
    },
    get promptParts() {
      return state.promptParts;
    },
    get maxRequestPrice() {
      return state.maxRequestPrice;
    },
    set maxRequestPrice(price) {
      state.maxRequestPrice =
        typeof price === "number" && Number.isFinite(price) ? price : 0;
      markDirty();
    },
    get maxPriceBehavior() {
      return state.maxPriceBehavior;
    },
    set maxPriceBehavior(behavior) {
      state.maxPriceBehavior = typeof behavior === "string" ? behavior : "";
      markDirty();
    },
    get summaryKbLimit() {
      return state.summaryKbLimit;
    },
    set summaryKbLimit(limit) {
      state.summaryKbLimit = typeof limit === "string" ? limit : "";
    },
    get debug() {
      return state.debug;
    },
    set debug(debug) {
      state.debug = debug === true;
      markDirty();
    },
    get bulletCount() {
      return state.bulletCount;
    },
    get alwaysUseUsEnglish() {
      return state.alwaysUseUsEnglish;
    },
    get alsoSendToJoplin() {
      return state.alsoSendToJoplin;
    },
    get tokens() {
      return state.tokens;
    },
    get tokenCapabilities() {
      return state.tokenCapabilities;
    },
    get pricingCache() {
      return state.pricingCache;
    },
    set pricingCache(cache) {
      state.pricingCache = cloneRecord(cache);
    },
    get knownModelsAndPrices() {
      return state.knownModelsAndPrices;
    },
    set knownModelsAndPrices(modelsAndPrices) {
      state.knownModelsAndPrices = cloneRecord(modelsAndPrices);
    },
    get dirty() {
      return state.dirty;
    },
    get saving() {
      return state.saving;
    },
    snapshot() {
      return cloneState(state);
    },
    setModels(models, { dirty = true } = {}) {
      state.models = Array.isArray(models) ? models.map(cloneModel) : [];
      if (dirty) markDirty();
    },
    setSummaryModelId(modelId, { dirty = true } = {}) {
      state.summaryModelId = typeof modelId === "string" ? modelId : "";
      if (dirty) markDirty();
    },
    setChatModelId(modelId, { dirty = true } = {}) {
      state.chatModelId = typeof modelId === "string" ? modelId : "";
      if (dirty) markDirty();
    },
    setLanguages(languages, { dirty = true } = {}) {
      state.languages = Array.isArray(languages)
        ? languages.map(cloneLanguage)
        : [];
      if (dirty) markDirty();
    },
    setQuickPrompts(prompts, { dirty = true } = {}) {
      state.quickPrompts = Array.isArray(prompts)
        ? prompts.map(cloneQuickPrompt)
        : [];
      if (dirty) markDirty();
    },
    setPromptTemplate(template, { dirty = true } = {}) {
      state.promptTemplate = typeof template === "string" ? template : "";
      updatePromptParts();
      if (dirty) markDirty();
    },
    setPromptEditableContent(content, { dirty = true } = {}) {
      state.promptTemplate = replacePromptEditableContent(
        state.promptTemplate,
        content,
      );
      updatePromptParts();
      if (dirty) markDirty();
    },
    setMaxRequestPrice(price, { dirty = true } = {}) {
      state.maxRequestPrice =
        typeof price === "number" && Number.isFinite(price) ? price : 0;
      if (dirty) markDirty();
    },
    setMaxPriceBehavior(behavior, { dirty = true } = {}) {
      state.maxPriceBehavior = typeof behavior === "string" ? behavior : "";
      if (dirty) markDirty();
    },
    setSummaryKbLimit(limit, { dirty = false } = {}) {
      state.summaryKbLimit = typeof limit === "string" ? limit : "";
      if (dirty) markDirty();
    },
    setDebug(debug, { dirty = true } = {}) {
      state.debug = debug === true;
      if (dirty) markDirty();
    },
    setBulletCount(count, { dirty = true } = {}) {
      state.bulletCount = typeof count === "string" ? count : "5";
      if (dirty) markDirty();
    },
    setAlwaysUseUsEnglish(value, { dirty = true } = {}) {
      state.alwaysUseUsEnglish = value === true;
      if (dirty) markDirty();
    },
    setAlsoSendToJoplin(value, { dirty = true } = {}) {
      state.alsoSendToJoplin = value === true;
      if (dirty) markDirty();
    },
    setTokens(tokens, { dirty = true } = {}) {
      state.tokens = normalizeTokenState({ ...state.tokens, ...tokens });
      state.tokenCapabilities = normalizeTokenCapabilities({
        hasApiKey: state.tokens.apiKey.trim() !== "",
        hasNewsblurToken: state.tokens.newsblurToken.trim() !== "",
        hasJoplinToken: state.tokens.joplinToken.trim() !== "",
      });
      if (dirty) markDirty();
    },
    setTokenCapabilities(capabilities, { dirty = false } = {}) {
      state.tokenCapabilities = normalizeTokenCapabilities(capabilities);
      if (dirty) markDirty();
    },
    setPricingCache(cache, { dirty = false } = {}) {
      state.pricingCache = cloneRecord(cache);
      if (dirty) markDirty();
    },
    setKnownModelsAndPrices(modelsAndPrices, { dirty = false } = {}) {
      state.knownModelsAndPrices = cloneRecord(modelsAndPrices);
      if (dirty) markDirty();
    },
    setSaving(saving) {
      state.saving = saving === true;
    },
    markDirty,
    markClean() {
      state.dirty = false;
    },
  };
};

export const parseOptionsPromptTemplate = parsePromptTemplate;
