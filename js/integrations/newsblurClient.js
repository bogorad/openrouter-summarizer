/**
 * @fileoverview NewsBlur service client for sharing selected content.
 * Handles token fallback, API URL construction, fetch calls, and response
 * parsing for background message handlers.
 * @module js/integrations/newsblurClient
 */

import { Logger } from "../logger.js";

const DEFAULT_NEWSBLUR_DOMAIN = "www.newsblur.com";

const getFetch = (fetchImpl) => fetchImpl || globalThis.fetch;

/**
 * Shares a story to NewsBlur using the existing extension payload shape.
 * @param {object} shareOptions - NewsBlur share payload.
 * @param {string} shareOptions.token - Optional NewsBlur API token.
 * @param {string} shareOptions.domain - Optional NewsBlur domain.
 * @param {string} shareOptions.story_url - Story URL.
 * @param {string} shareOptions.title - Story title.
 * @param {string} shareOptions.content - Story content.
 * @param {string} shareOptions.comments - Share comments.
 * @param {object} options - Optional dependencies and debug settings.
 * @param {boolean} options.debug - Whether to log debug details.
 * @param {Function} options.fetchImpl - Fetch implementation for tests.
 * @param {Function} options.loadToken - Token loader for privileged callers.
 * @returns {Promise<object>} NewsBlur API response or normalized error object.
 */
export const shareToNewsblur = async (
  shareOptions,
  { debug = false, fetchImpl, loadToken } = {},
) => {
  const options = shareOptions || {};
  let token = options.token;

  if (!token && loadToken) {
    const tokenResult = await loadToken();
    if (!tokenResult.success) {
      Logger.error("[LLM Background]", "Failed to load NewsBlur token:", tokenResult.error);
      return {
        code: -1,
        message: `Failed to load stored NewsBlur token: ${tokenResult.error || "Unknown storage error."}`,
        tokenStatus: tokenResult.status,
      };
    }
    token = tokenResult.data;
  }

  const fetchApi = getFetch(fetchImpl);
  const domain = options.domain || DEFAULT_NEWSBLUR_DOMAIN;
  const apiUrl = `https://${domain}/api/share_story/${token}`;
  const payload = new URLSearchParams();
  payload.append("story_url", options.story_url);
  payload.append("title", options.title);
  payload.append("content", options.content);
  payload.append("comments", options.comments);

  try {
    const response = await fetchApi(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      return await handleNewsblurHttpError(response, debug);
    }

    const result = await response.json();
    if (debug) Logger.info("[LLM NewsBlur]", "NewsBlur Share Response:", result);

    if (result.code < 0 || (result.result && result.result === "error")) {
      Logger.error(
        "[LLM NewsBlur]",
        "Error sharing to NewsBlur:",
        result.message || JSON.stringify(result.errors || result),
      );
      return {
        code: -1,
        message: result.message || JSON.stringify(result.errors || result),
      };
    }

    if (debug) Logger.info("[LLM NewsBlur]", "Successfully shared to NewsBlur!");
    return result;
  } catch (error) {
    Logger.error("[LLM NewsBlur]", "Failed to share to NewsBlur (caught error):", error);
    return { code: -1, message: error.message };
  }
};

/**
 * Handles NewsBlur HTTP errors while preserving the legacy response contract.
 * @param {Response} response - Fetch response.
 * @param {boolean} debug - Whether to log parse failures.
 * @returns {Promise<object>} Success object for 502 responses.
 */
const handleNewsblurHttpError = async (response, debug) => {
  let errorText = `HTTP error! status: ${response.status}`;
  let responseBody = "";

  if (response.status === 502) {
    try {
      responseBody = await response.text();
    } catch (e) {
      Logger.info("[LLM NewsBlur]", "Failed to read 502 response body:", e);
    }
    Logger.warn(
      "[LLM NewsBlur]",
      `NewsBlur API returned 502 (Normal). Treating as success. Raw response: ${responseBody}`,
    );
    return {
      code: 0,
      message: `NewsBlur API 502 received, treated as success: ${responseBody}`,
    };
  }

  try {
    responseBody = await response.text();
    errorText += ` - ${responseBody}`;
    try {
      const errorData = JSON.parse(responseBody);
      errorText += ` (Parsed JSON: ${JSON.stringify(errorData.message || errorData.errors || errorData)})`;
    } catch (parseError) {
      if (debug) {
        Logger.warn("[LLM NewsBlur]", "Failed to parse NewsBlur error response as JSON.", parseError);
      }
    }
  } catch (e) {
    errorText += ` - Failed to read response body: ${e.message}`;
  }

  Logger.error("[LLM NewsBlur]", "NewsBlur API non-OK response (error):", response.status, responseBody);
  throw new Error(errorText);
};
