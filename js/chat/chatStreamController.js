// js/chat/chatStreamController.js
/**
 * Short Spec: Coordinates chat request streaming, abort, placeholder cleanup,
 * and final UI state restoration.
 * Called from: chat.js and chat stream controller unit tests.
 */

/**
 * Creates a controller for one chat UI's streaming lifecycle.
 * @param {object} options - Controller dependencies.
 * @returns {object} Stream controller API.
 */
export const createChatStreamController = ({
  chatState,
  buildApiMessages,
  renderStreamingPlaceholder,
  sendRuntimeAction,
  actions,
  getMessagesWrap,
  setBusy,
  onSuccess,
  onError,
  onAborted,
  scrollToBottom,
  logger = console,
}) => {
  let activeRequest = null;
  let nextRequestId = 0;

  const cleanupPlaceholder = (request) => {
    if (!request || request.placeholderCleaned) {
      return;
    }

    const { wrap, container, modelLabel } = request.placeholder || {};
    if (container && container.parentNode === wrap) {
      wrap.removeChild(container);
    }
    if (modelLabel && modelLabel.parentNode === wrap) {
      wrap.removeChild(modelLabel);
    }

    chatState.clearActiveStreamPlaceholder({ container, modelLabel });
    request.placeholderCleaned = true;
  };

  const finishActiveRequest = (request) => {
    cleanupPlaceholder(request);
    if (activeRequest === request) {
      activeRequest = null;
      chatState.setStreaming(false);
      setBusy(false);
    }
  };

  const handleResponse = (request, response) => {
    if (request.stopped || activeRequest !== request) {
      cleanupPlaceholder(request);
      return;
    }

    finishActiveRequest(request);

    if (response?.status === "success" && response.content !== undefined) {
      onSuccess({
        content: response.content,
        model: request.model,
        response,
      });
      return;
    }

    if (response?.status === "aborted") {
      onAborted(response);
      return;
    }

    if (response?.status === "error") {
      onError(response.message || "Failed to get response from LLM.", response);
      return;
    }

    onError(response?.message || "Unknown response from background script.", response);
  };

  const handleFailure = (request, error) => {
    if (request.stopped || activeRequest !== request) {
      cleanupPlaceholder(request);
      return;
    }

    finishActiveRequest(request);
    onError(error?.message || "Chat request failed.", error);
  };

  return {
    /**
     * Starts a chat request and tracks the active stream placeholder.
     * @param {string} userText - User prompt text.
     * @returns {boolean} True when a request was started.
     */
    start(userText) {
      const { selectedModelId, streaming } = chatState.getState();
      if (streaming || !selectedModelId) {
        return false;
      }

      const model = chatState.startStream(selectedModelId);
      setBusy(true);

      const wrap = getMessagesWrap();
      if (!wrap) {
        logger.error("[LLM Chat] messagesWrap not found.");
        chatState.setStreaming(false);
        setBusy(false);
        return false;
      }

      const placeholder = renderStreamingPlaceholder(wrap, { model });
      chatState.setActiveStreamPlaceholder(placeholder);
      scrollToBottom();

      const { messages, chatContext } = chatState.getState();
      const apiMessages = buildApiMessages(userText, messages, chatContext);
      const request = {
        id: nextRequestId,
        model,
        placeholder,
        placeholderCleaned: false,
        stopped: false,
      };
      nextRequestId += 1;
      activeRequest = request;

      sendRuntimeAction(actions.llmChatStream, {
        messages: apiMessages,
        model: selectedModelId,
      })
        .then(({ response }) => handleResponse(request, response))
        .catch((error) => handleFailure(request, error));

      return true;
    },

    /**
     * Stops the active request once and cleans up visible pending state.
     * @returns {boolean} True when an active request was stopped.
     */
    stop() {
      const request = activeRequest;
      if (!request || request.stopped) {
        return false;
      }

      request.stopped = true;
      finishActiveRequest(request);

      sendRuntimeAction(actions.abortChatRequest)
        .then(({ response }) => {
          if (response?.status === "aborted") {
            logger.log("[LLM Chat] Background confirmed request abort.");
            return;
          }
          logger.log("[LLM Chat] Background could not abort request or no active request.");
        })
        .catch((error) => {
          logger.error("[LLM Chat] Error sending abort request:", error);
        });

      return true;
    },
  };
};
