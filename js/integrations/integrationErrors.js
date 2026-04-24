/**
 * @fileoverview Shared user-facing error mapping for external integrations.
 * Produces stable response objects for background handlers and UI messages.
 * @module js/integrations/integrationErrors
 */

export const INTEGRATION_ERROR_TYPES = Object.freeze({
  AUTH: "auth",
  NETWORK: "network",
  SERVICE_UNAVAILABLE: "service_unavailable",
  MALFORMED_RESPONSE: "malformed_response",
  LOCAL_APP_NOT_RUNNING: "local_app_not_running",
  UNKNOWN: "unknown",
});

const SERVICE_NAMES = Object.freeze({
  joplin: "Joplin",
  newsblur: "NewsBlur",
});

const ERROR_MESSAGES = Object.freeze({
  joplin: {
    [INTEGRATION_ERROR_TYPES.AUTH]: "Joplin rejected the API token. Check the token in extension options.",
    [INTEGRATION_ERROR_TYPES.NETWORK]: "Could not reach Joplin. Check your network connection and try again.",
    [INTEGRATION_ERROR_TYPES.SERVICE_UNAVAILABLE]: "Joplin is unavailable right now. Try again in a moment.",
    [INTEGRATION_ERROR_TYPES.MALFORMED_RESPONSE]: "Joplin returned an unexpected response. Update Joplin or try again.",
    [INTEGRATION_ERROR_TYPES.LOCAL_APP_NOT_RUNNING]: "Joplin is not reachable. Start the Joplin desktop app and make sure the web clipper service is enabled.",
    [INTEGRATION_ERROR_TYPES.UNKNOWN]: "Joplin failed unexpectedly. Try again.",
  },
  newsblur: {
    [INTEGRATION_ERROR_TYPES.AUTH]: "NewsBlur rejected the API token. Check the token in extension options.",
    [INTEGRATION_ERROR_TYPES.NETWORK]: "Could not reach NewsBlur. Check your network connection and try again.",
    [INTEGRATION_ERROR_TYPES.SERVICE_UNAVAILABLE]: "NewsBlur is unavailable right now. Try again in a moment.",
    [INTEGRATION_ERROR_TYPES.MALFORMED_RESPONSE]: "NewsBlur returned an unexpected response. Try again.",
    [INTEGRATION_ERROR_TYPES.LOCAL_APP_NOT_RUNNING]: "NewsBlur is unreachable from this browser session. Check your network connection and try again.",
    [INTEGRATION_ERROR_TYPES.UNKNOWN]: "NewsBlur sharing failed unexpectedly. Try again.",
  },
});

/**
 * Normalizes integration failures into a stable background response shape.
 * @param {string} service - Integration key, such as joplin or newsblur.
 * @param {Error|object|string} error - Error, API error object, or message.
 * @returns {object} Normalized error response.
 */
export const normalizeIntegrationError = (service, error) => {
  const normalizedService = normalizeService(service);
  const rawMessage = extractErrorMessage(error);
  const errorType = classifyIntegrationError(normalizedService, rawMessage);

  return {
    status: "error",
    service: normalizedService,
    serviceName: SERVICE_NAMES[normalizedService],
    errorType: errorType,
    message: ERROR_MESSAGES[normalizedService][errorType],
    details: rawMessage,
  };
};

/**
 * Returns the safest message to show from an integration response or error.
 * @param {object|Error|string} responseOrError - Background response or error.
 * @param {string} fallbackMessage - Fallback when no message exists.
 * @returns {string} User-facing message.
 */
export const getIntegrationErrorMessage = (
  responseOrError,
  fallbackMessage = "The integration request failed.",
) => {
  const message = extractErrorMessage(responseOrError);
  return message || fallbackMessage;
};

/**
 * Classifies known integration failures by raw message evidence.
 * @param {string} service - Normalized integration key.
 * @param {string} rawMessage - Raw error message.
 * @returns {string} Integration error type.
 */
export const classifyIntegrationError = (service, rawMessage) => {
  const message = rawMessage.toLowerCase();

  if (/\b(401|403|forbidden|unauthorized|invalid token|token is missing|api token is missing|invalid .*token)\b/.test(message)) {
    return INTEGRATION_ERROR_TYPES.AUTH;
  }
  if (/\b(502|503|504|bad gateway|service unavailable|gateway timeout|temporarily unavailable)\b/.test(message)) {
    return INTEGRATION_ERROR_TYPES.SERVICE_UNAVAILABLE;
  }
  if (/\b(invalid response format|unexpected response|malformed|failed to parse|json)\b/.test(message)) {
    return INTEGRATION_ERROR_TYPES.MALFORMED_RESPONSE;
  }
  if (
    service === "joplin" &&
    /\b(joplin is running|api is enabled|localhost|127\.0\.0\.1|econnrefused|connection refused|failed to fetch|networkerror)\b/.test(message)
  ) {
    return INTEGRATION_ERROR_TYPES.LOCAL_APP_NOT_RUNNING;
  }
  if (/\b(network|failed to fetch|networkerror|econnreset|etimedout|timeout|dns|offline)\b/.test(message)) {
    return INTEGRATION_ERROR_TYPES.NETWORK;
  }

  return INTEGRATION_ERROR_TYPES.UNKNOWN;
};

const normalizeService = (service) => (
  SERVICE_NAMES[service] ? service : "newsblur"
);

const extractErrorMessage = (error) => {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.details === "string" && error.details.trim()) return error.details;
  if (typeof error.error === "string" && error.error.trim()) return error.error;
  return "";
};
