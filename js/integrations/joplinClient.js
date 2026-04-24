/**
 * @fileoverview Joplin service client for notebook listing and note creation.
 * Handles Joplin API URL construction, token validation, fetch calls, and
 * response parsing for background message handlers.
 * @module js/integrations/joplinClient
 */

import {
  JOPLIN_API_BASE_URL,
  JOPLIN_API_FOLDERS_ENDPOINT,
  JOPLIN_API_NOTES_ENDPOINT,
} from "../../constants.js";
import { Logger } from "../logger.js";

const getFetch = (fetchImpl) => fetchImpl || globalThis.fetch;

/**
 * Fetches the list of folders from the Joplin API.
 * @param {string} joplinToken - The Joplin API token.
 * @param {object} options - Optional dependencies and debug settings.
 * @param {boolean} options.debug - Whether to log successful API responses.
 * @param {Function} options.fetchImpl - Fetch implementation for tests.
 * @returns {Promise<Array>} Joplin folders.
 */
export const fetchJoplinFolders = async (
  joplinToken,
  { debug = false, fetchImpl } = {},
) => {
  const normalizedJoplinToken = normalizeJoplinToken(joplinToken);

  if (!normalizedJoplinToken) {
    throw new Error("Joplin API token is missing.");
  }
  if (!isValidJoplinToken(normalizedJoplinToken)) {
    throw new Error("Invalid Joplin API token format.");
  }

  const fetchApi = getFetch(fetchImpl);
  const apiUrl = new URL(JOPLIN_API_FOLDERS_ENDPOINT, JOPLIN_API_BASE_URL);
  apiUrl.searchParams.append("token", normalizedJoplinToken);

  try {
    const response = await fetchApi(apiUrl.href);
    if (!response.ok) {
      const errorText = await response.text();
      Logger.error("[LLM Joplin API]", "Error fetching folders:", response.status, errorText);
      throw new Error(`Failed to fetch Joplin notebooks: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.items)) {
      throw new Error("Invalid response format from Joplin API.");
    }

    if (debug) Logger.info("[LLM Joplin API]", "Fetched folders:", data.items);
    return data.items;
  } catch (error) {
    Logger.error("[LLM Joplin API]", "Network error during folder fetch:", error);
    throw new Error(`Network error or invalid Joplin API URL. Ensure Joplin is running and API is enabled: ${error.message}`);
  }
};

/**
 * Creates a new note in Joplin.
 * @param {object} noteRequest - Note creation payload.
 * @param {string} noteRequest.joplinToken - The Joplin API token.
 * @param {string} noteRequest.title - The title of the note.
 * @param {string} noteRequest.source_url - The URL of the source.
 * @param {string} noteRequest.body_html - The HTML body of the note.
 * @param {string} noteRequest.parent_id - The ID of the parent notebook.
 * @param {object} options - Optional dependencies and debug settings.
 * @param {boolean} options.debug - Whether to log successful API responses.
 * @param {Function} options.fetchImpl - Fetch implementation for tests.
 * @returns {Promise<object>} Joplin note creation response.
 */
export const createJoplinNote = async (
  { joplinToken, title, source_url, body_html, parent_id },
  { debug = false, fetchImpl } = {},
) => {
  const normalizedJoplinToken = normalizeJoplinToken(joplinToken);

  if (!normalizedJoplinToken || !title || !body_html || !parent_id) {
    throw new Error("Missing required parameters for creating Joplin note (token, title, HTML content, or parentId).");
  }
  if (!isValidJoplinToken(normalizedJoplinToken)) {
    throw new Error("Invalid Joplin API token format.");
  }

  const fetchApi = getFetch(fetchImpl);
  const apiUrl = new URL(JOPLIN_API_NOTES_ENDPOINT, JOPLIN_API_BASE_URL);
  apiUrl.searchParams.append("token", normalizedJoplinToken);

  const noteData = {
    title: title,
    source_url: source_url,
    parent_id: parent_id,
    body_html: body_html,
  };

  try {
    const response = await fetchApi(apiUrl.href, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(noteData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      Logger.error("[LLM Joplin API]", "Error creating note:", response.status, errorText);
      throw new Error(`Failed to create Joplin note: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    if (debug) Logger.info("[LLM Joplin API]", "Note created:", result);
    return result;
  } catch (error) {
    Logger.error("[LLM Joplin API]", "Network error during note creation:", error);
    throw new Error(`Network error or invalid Joplin API URL. Ensure Joplin is running and API is enabled: ${error.message}`);
  }
};

/**
 * Validates Joplin API token format.
 * Joplin tokens are non-empty strings with a realistic length and no whitespace.
 * @param {string} token - The token to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
export const isValidJoplinToken = (token) => {
  if (typeof token !== "string") return false;
  const normalizedToken = token.trim();

  return normalizedToken.length >= 10 && normalizedToken.length <= 512 &&
    !/[\s\n\r\t]/.test(normalizedToken);
};

/**
 * Normalizes Joplin token input before API calls.
 * @param {*} token - Token value from storage or message payload.
 * @returns {string} trimmed token or empty string.
 */
export const normalizeJoplinToken = (token) => (
  typeof token === "string" ? token.trim() : ""
);
