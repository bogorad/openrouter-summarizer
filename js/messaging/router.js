// Reusable message router for Chrome extension request handlers.
// Later tasks can wire this into background.js without changing the router API.

import { MessageActionSet } from "./actions.js";

const DEFAULT_UNKNOWN_ACTION_MESSAGE = "Unknown message action.";
const DEFAULT_MISSING_HANDLER_MESSAGE = "No handler registered for message action.";
const RAW_RESPONSE_MARKER = Symbol("rawMessageResponse");

const isObject = (value) => value !== null && typeof value === "object";

const isPromiseLike = (value) =>
  isObject(value) && typeof value.then === "function";

const getErrorMessage = (error) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "An unexpected message handler error occurred.";
};

const createSuccessResponse = (value) => {
  if (isObject(value) && value[RAW_RESPONSE_MARKER]) {
    return value.response;
  }

  if (isObject(value) && typeof value.status === "string") {
    return value;
  }

  if (value === undefined) {
    return { status: "success" };
  }

  return { status: "success", data: value };
};

const createErrorResponse = (message, details = {}) => ({
  status: "error",
  message,
  ...details,
});

export class MessageRouter {
  constructor({ validActions = MessageActionSet, context = {} } = {}) {
    this.validActions = validActions;
    this.context = context;
    this.handlers = new Map();
  }

  hasAction(action) {
    return typeof action === "string" && this.validActions.has(action);
  }

  hasHandler(action) {
    return this.handlers.has(action);
  }

  register(action, handler) {
    if (!this.hasAction(action)) {
      throw new Error(`${DEFAULT_UNKNOWN_ACTION_MESSAGE} ${action}`);
    }

    if (typeof handler !== "function") {
      throw new TypeError("Message handler must be a function.");
    }

    this.handlers.set(action, handler);
    return this;
  }

  unregister(action) {
    this.handlers.delete(action);
    return this;
  }

  async dispatch(request = {}, sender = {}, context = this.context) {
    const action = request.action;

    if (!this.hasAction(action)) {
      return createErrorResponse(DEFAULT_UNKNOWN_ACTION_MESSAGE, { action });
    }

    const handler = this.handlers.get(action);

    if (!handler) {
      return createErrorResponse(DEFAULT_MISSING_HANDLER_MESSAGE, { action });
    }

    try {
      const result = await handler(request, sender, context);
      return createSuccessResponse(result);
    } catch (error) {
      return createErrorResponse(getErrorMessage(error), { action });
    }
  }

  createRuntimeListener(context = this.context) {
    return (request, sender, sendResponse) => {
      const response = this.dispatch(request, sender, context);

      if (isPromiseLike(response)) {
        response.then(sendResponse);
        return true;
      }

      sendResponse(response);
      return false;
    };
  }
}

export const createMessageRouter = (options) => new MessageRouter(options);

export const rawMessageResponse = (response) => ({
  [RAW_RESPONSE_MARKER]: true,
  response,
});
