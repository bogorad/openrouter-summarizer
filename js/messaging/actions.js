// Catalog of Chrome extension message actions and lightweight contracts.
// This module is intentionally declarative; callers will migrate to it in later tasks.

export const ACTION_GET_SETTINGS = "getSettings";
export const ACTION_GET_CHAT_CONTEXT = "getChatContext";
export const ACTION_SET_CHAT_CONTEXT = "setChatContext";
export const ACTION_GET_MODEL_PRICING = "getModelPricing";
export const ACTION_UPDATE_KNOWN_MODELS_AND_PRICING =
  "updateKnownModelsAndPricing";
export const ACTION_LLM_CHAT_STREAM = "llmChatStream";
export const ACTION_ABORT_CHAT_REQUEST = "abortChatRequest";
export const ACTION_REQUEST_SUMMARY = "requestSummary";
export const ACTION_SUMMARY_RESULT = "summaryResult";
export const ACTION_PROCESS_SELECTION = "processSelection";
export const ACTION_OPEN_CHAT_TAB = "openChatTab";
export const ACTION_OPEN_OPTIONS_PAGE = "openOptionsPage";
export const ACTION_FETCH_JOPLIN_NOTEBOOKS = "fetchJoplinNotebooks";
export const ACTION_CREATE_JOPLIN_NOTE = "createJoplinNote";
export const ACTION_GET_JOPLIN_TOKEN = "getJoplinToken";
export const ACTION_GET_NEWSBLUR_TOKEN = "getNewsblurToken";
export const ACTION_SHARE_TO_NEWSBLUR = "shareToNewsblur";

export const RuntimeMessageActions = Object.freeze({
  getSettings: ACTION_GET_SETTINGS,
  getChatContext: ACTION_GET_CHAT_CONTEXT,
  setChatContext: ACTION_SET_CHAT_CONTEXT,
  getModelPricing: ACTION_GET_MODEL_PRICING,
  updateKnownModelsAndPricing: ACTION_UPDATE_KNOWN_MODELS_AND_PRICING,
  llmChatStream: ACTION_LLM_CHAT_STREAM,
  abortChatRequest: ACTION_ABORT_CHAT_REQUEST,
  requestSummary: ACTION_REQUEST_SUMMARY,
  openChatTab: ACTION_OPEN_CHAT_TAB,
  openOptionsPage: ACTION_OPEN_OPTIONS_PAGE,
  fetchJoplinNotebooks: ACTION_FETCH_JOPLIN_NOTEBOOKS,
  createJoplinNote: ACTION_CREATE_JOPLIN_NOTE,
  getJoplinToken: ACTION_GET_JOPLIN_TOKEN,
  getNewsblurToken: ACTION_GET_NEWSBLUR_TOKEN,
  shareToNewsblur: ACTION_SHARE_TO_NEWSBLUR,
});

export const TabMessageActions = Object.freeze({
  processSelection: ACTION_PROCESS_SELECTION,
  summaryResult: ACTION_SUMMARY_RESULT,
});

export const ContentScriptIncomingActions = TabMessageActions;

export const RUNTIME_MESSAGE_ACTIONS = Object.freeze(
  Object.values(RuntimeMessageActions),
);

export const TAB_MESSAGE_ACTIONS = Object.freeze(Object.values(TabMessageActions));

export const MESSAGE_ACTIONS = Object.freeze([
  ...RUNTIME_MESSAGE_ACTIONS,
  ...TAB_MESSAGE_ACTIONS,
]);

export const RuntimeMessageActionSet = Object.freeze(
  new Set(RUNTIME_MESSAGE_ACTIONS),
);

export const TabMessageActionSet = Object.freeze(new Set(TAB_MESSAGE_ACTIONS));

export const CONTENT_SCRIPT_INCOMING_ACTIONS = TAB_MESSAGE_ACTIONS;

export const ContentScriptIncomingActionSet = TabMessageActionSet;

export const MessageActionSet = Object.freeze(new Set(MESSAGE_ACTIONS));

/**
 * @typedef {object} BaseMessage
 * @property {string} action One of MESSAGE_ACTIONS.
 */

/**
 * @typedef {object} StatusResponse
 * @property {"success"|"error"} status Operation result.
 * @property {string=} message Human-readable result or error details.
 */

/**
 * @typedef {object} PricingResponse
 * @property {"success"|"error"} status Operation result.
 * @property {object=} pricing Model pricing data keyed by model id.
 * @property {string=} message Error details when status is "error".
 */

/**
 * @typedef {object} ChatContextPayload
 * @property {string=} selectedText Cleaned source text or Markdown.
 * @property {string=} summary Existing summary text.
 * @property {string=} pageTitle Source page title.
 * @property {string=} pageUrl Source page URL.
 * @property {string=} modelId Selected chat model id.
 */

/**
 * @typedef {object} ChatStreamPayload
 * @property {Array<object>} messages Chat messages in OpenAI-compatible shape.
 * @property {string} model Selected model id.
 */

/**
 * @typedef {object} SummaryRequestPayload
 * @property {string} content Cleaned content to summarize.
 * @property {string=} pageTitle Source page title.
 * @property {string=} pageURL Source page URL.
 * @property {string=} model Selected summary model id.
 * @property {string=} prompt User-configured summary prompt.
 */

/**
 * @typedef {object} SummaryResultPayload
 * @property {"chunk"|"complete"|"error"} status Streaming summary status.
 * @property {string=} text Chunk or final summary text.
 * @property {string=} message Error details when status is "error".
 */

/**
 * @typedef {object} JoplinNotePayload
 * @property {string} title Note title.
 * @property {string} body Note body.
 * @property {string=} parent_id Optional target notebook id.
 */

/**
 * @typedef {object} NewsblurSharePayload
 * @property {string} url Source URL.
 * @property {string} title Source title.
 * @property {string} content Summary or selected content to share.
 */

export const MessageContractCatalog = Object.freeze({
  [ACTION_GET_SETTINGS]: {
    direction: "runtime",
    payload: "BaseMessage",
    response: "Settings object with secret presence booleans, not raw secrets.",
  },
  [ACTION_GET_CHAT_CONTEXT]: {
    direction: "runtime",
    payload: "BaseMessage",
    response: "ChatContextPayload",
  },
  [ACTION_SET_CHAT_CONTEXT]: {
    direction: "runtime",
    payload: "BaseMessage & ChatContextPayload",
    response: "StatusResponse",
  },
  [ACTION_GET_MODEL_PRICING]: {
    direction: "runtime",
    payload: "{ action, modelId }",
    response: "PricingResponse",
  },
  [ACTION_UPDATE_KNOWN_MODELS_AND_PRICING]: {
    direction: "runtime",
    payload: "BaseMessage",
    response: "StatusResponse",
  },
  [ACTION_LLM_CHAT_STREAM]: {
    direction: "runtime",
    payload: "BaseMessage & ChatStreamPayload",
    response: "StatusResponse",
  },
  [ACTION_ABORT_CHAT_REQUEST]: {
    direction: "runtime",
    payload: "BaseMessage",
    response: "StatusResponse",
  },
  [ACTION_REQUEST_SUMMARY]: {
    direction: "runtime",
    payload: "BaseMessage & SummaryRequestPayload",
    response: "StatusResponse",
  },
  [ACTION_SUMMARY_RESULT]: {
    direction: "tab",
    payload: "BaseMessage & SummaryResultPayload",
    response: "void",
  },
  [ACTION_PROCESS_SELECTION]: {
    direction: "tab",
    payload: "BaseMessage",
    response: "void",
  },
  [ACTION_OPEN_CHAT_TAB]: {
    direction: "runtime",
    payload: "BaseMessage",
    response: "StatusResponse",
  },
  [ACTION_OPEN_OPTIONS_PAGE]: {
    direction: "runtime",
    payload: "BaseMessage",
    response: "StatusResponse",
  },
  [ACTION_FETCH_JOPLIN_NOTEBOOKS]: {
    direction: "runtime",
    payload: "BaseMessage",
    response: "StatusResponse with notebooks array on success.",
  },
  [ACTION_CREATE_JOPLIN_NOTE]: {
    direction: "runtime",
    payload: "BaseMessage & JoplinNotePayload",
    response: "StatusResponse",
  },
  [ACTION_GET_JOPLIN_TOKEN]: {
    direction: "runtime",
    payload: "BaseMessage",
    response: "StatusResponse with hasJoplinToken capability flag.",
  },
  [ACTION_GET_NEWSBLUR_TOKEN]: {
    direction: "runtime",
    payload: "BaseMessage",
    response: "StatusResponse with hasNewsblurToken capability flag.",
  },
  [ACTION_SHARE_TO_NEWSBLUR]: {
    direction: "runtime",
    payload: "BaseMessage & NewsblurSharePayload",
    response: "StatusResponse",
  },
});
