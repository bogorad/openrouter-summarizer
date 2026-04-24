// js/chat/chatState.js
/**
 * Short Spec: Owns in-memory state for the chat page.
 * Called from: chat.js and chat state unit tests.
 */

const createInitialState = () => ({
  messages: [],
  chatContext: { domSnippet: null, summary: null },
  models: [],
  language_info: [],
  chatQuickPrompts: [],
  selectedModelId: "",
  streaming: false,
  currentStreamModel: "",
  activeStreamWrap: null,
  activeStreamContainer: null,
  activeStreamModelLabel: null,
  modelUsedForSummary: "",
});

/**
 * Creates an isolated chat state store.
 * @param {object} initialState - Optional initial state overrides.
 * @returns {object} Store API for chat state reads and transitions.
 */
export const createChatStateStore = (initialState = {}) => {
  let state = {
    ...createInitialState(),
    ...initialState,
    chatContext: {
      ...createInitialState().chatContext,
      ...(initialState.chatContext || {}),
    },
    messages: Array.isArray(initialState.messages) ? [...initialState.messages] : [],
    models: Array.isArray(initialState.models) ? [...initialState.models] : [],
    language_info: Array.isArray(initialState.language_info)
      ? [...initialState.language_info]
      : [],
    chatQuickPrompts: Array.isArray(initialState.chatQuickPrompts)
      ? [...initialState.chatQuickPrompts]
      : [],
  };

  return {
    /**
     * Returns the current state object for read-only coordination.
     * @returns {object} Current state.
     */
    getState() {
      return state;
    },

    /**
     * Resets state to defaults plus optional overrides.
     * @param {object} nextState - Optional state overrides.
     * @returns {object} New current state.
     */
    reset(nextState = {}) {
      state = createChatStateStore(nextState).getState();
      return state;
    },

    /**
     * Replaces the full message list.
     * @param {Array} messages - Chat messages.
     * @returns {Array} Stored messages.
     */
    setMessages(messages) {
      state.messages = Array.isArray(messages) ? [...messages] : [];
      return state.messages;
    },

    /**
     * Appends one message to the chat history.
     * @param {object} message - Message to append.
     * @returns {object} Appended message.
     */
    addMessage(message) {
      state.messages.push(message);
      return message;
    },

    /**
     * Replaces the current chat context.
     * @param {object} chatContext - DOM snippet and summary context.
     * @returns {object} Stored context.
     */
    setChatContext(chatContext = {}) {
      state.chatContext = {
        domSnippet: chatContext.domSnippet ?? null,
        summary: chatContext.summary ?? null,
      };
      return state.chatContext;
    },

    /**
     * Stores configured chat models.
     * @param {Array} models - Model descriptors.
     * @returns {Array} Stored models.
     */
    setModels(models) {
      state.models = Array.isArray(models) ? [...models] : [];
      return state.models;
    },

    /**
     * Stores configured translation language metadata.
     * @param {Array} languageInfo - Language descriptors.
     * @returns {Array} Stored language descriptors.
     */
    setLanguageInfo(languageInfo) {
      state.language_info = Array.isArray(languageInfo) ? [...languageInfo] : [];
      return state.language_info;
    },

    /**
     * Stores configured quick prompts.
     * @param {Array} quickPrompts - Quick prompt descriptors.
     * @returns {Array} Stored quick prompts.
     */
    setChatQuickPrompts(quickPrompts) {
      state.chatQuickPrompts = Array.isArray(quickPrompts) ? [...quickPrompts] : [];
      return state.chatQuickPrompts;
    },

    /**
     * Stores the currently selected model ID.
     * @param {string} selectedModelId - Selected model ID.
     * @returns {string} Stored model ID.
     */
    setSelectedModelId(selectedModelId) {
      state.selectedModelId = typeof selectedModelId === "string" ? selectedModelId : "";
      return state.selectedModelId;
    },

    /**
     * Updates streaming state and clears current stream model when stopped.
     * @param {boolean} streaming - Whether a chat response is streaming.
     * @returns {boolean} Stored streaming state.
     */
    setStreaming(streaming) {
      state.streaming = streaming === true;
      if (!state.streaming) {
        state.currentStreamModel = "";
      }
      return state.streaming;
    },

    /**
     * Marks a stream as active for a model.
     * @param {string} modelId - Model ID used for the stream.
     * @returns {string} Stored current stream model.
     */
    startStream(modelId) {
      state.streaming = true;
      state.currentStreamModel = typeof modelId === "string" ? modelId : "";
      return state.currentStreamModel;
    },

    /**
     * Stores DOM refs for the active stream placeholder.
     * @param {object} refs - Placeholder DOM refs.
     * @returns {object} Stored refs.
     */
    setActiveStreamPlaceholder({ wrap = null, container = null, modelLabel = null } = {}) {
      state.activeStreamWrap = wrap;
      state.activeStreamContainer = container;
      state.activeStreamModelLabel = modelLabel;
      return {
        wrap: state.activeStreamWrap,
        container: state.activeStreamContainer,
        modelLabel: state.activeStreamModelLabel,
      };
    },

    /**
     * Clears active stream placeholder refs when they match the active stream.
     * @param {object} refs - Placeholder refs to clear.
     * @returns {object} Current active placeholder refs.
     */
    clearActiveStreamPlaceholder({ container = null, modelLabel = null } = {}) {
      const shouldClear = !container || (
        state.activeStreamContainer === container &&
        state.activeStreamModelLabel === modelLabel
      );

      if (shouldClear) {
        state.activeStreamWrap = null;
        state.activeStreamContainer = null;
        state.activeStreamModelLabel = null;
      }

      return {
        wrap: state.activeStreamWrap,
        container: state.activeStreamContainer,
        modelLabel: state.activeStreamModelLabel,
      };
    },

    /**
     * Stores the model ID used for the initial summary.
     * @param {string} modelId - Summary model ID.
     * @returns {string} Stored model ID.
     */
    setModelUsedForSummary(modelId) {
      state.modelUsedForSummary = typeof modelId === "string" ? modelId : "";
      return state.modelUsedForSummary;
    },
  };
};

export const chatState = createChatStateStore();
