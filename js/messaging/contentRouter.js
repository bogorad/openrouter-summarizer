// Router for tab messages received by the content script.
// pageInteraction.js owns behavior; this module owns action validation and response shape.

import { ContentScriptIncomingActionSet } from "./actions.js";

const DEFAULT_UNKNOWN_ACTION_MESSAGE = "Unknown content-script action.";
const DEFAULT_MISSING_HANDLER_MESSAGE =
  "No content-script handler registered for action.";

const getErrorMessage = (error) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "An unexpected content-script message handler error occurred.";
};

const createErrorResponse = (message, details = {}) => ({
  status: "error",
  message,
  ...details,
});

const normalizeResponse = (response) => {
  if (response && typeof response === "object" && typeof response.status === "string") {
    return response;
  }

  if (response === undefined) {
    return { status: "success" };
  }

  return { status: "success", data: response };
};

export const dispatchContentScriptMessage = async (
  request = {},
  sender = {},
  handlers = {},
) => {
  const action = request.action;

  if (!ContentScriptIncomingActionSet.has(action)) {
    return createErrorResponse(DEFAULT_UNKNOWN_ACTION_MESSAGE, { action });
  }

  const handler = handlers[action];

  if (typeof handler !== "function") {
    return createErrorResponse(DEFAULT_MISSING_HANDLER_MESSAGE, { action });
  }

  try {
    const response = await handler(request, sender);
    return normalizeResponse(response);
  } catch (error) {
    return createErrorResponse(getErrorMessage(error), { action });
  }
};

export const createContentScriptMessageListener = ({
  handlers,
  onError = console.error,
} = {}) => (request, sender, sendResponse) => {
  dispatchContentScriptMessage(request, sender, handlers)
    .then(sendResponse)
    .catch((error) => {
      onError("[LLM Content] Error handling message:", error);
      sendResponse(createErrorResponse(getErrorMessage(error), {
        action: request?.action,
      }));
    });

  return true;
};
