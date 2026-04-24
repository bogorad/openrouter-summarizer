import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createJoplinNote,
  fetchJoplinFolders,
  isValidJoplinToken,
  normalizeJoplinToken,
} from "../../js/integrations/joplinClient.js";

const VALID_TOKEN = "0123456789abcdef0123456789abcdef";

const createJsonResponse = (body, { ok = true, status = 200, statusText = "OK", text = "" } = {}) => ({
  ok,
  status,
  statusText,
  json: async () => body,
  text: async () => text,
});

describe("joplinClient", () => {
  it("normalizes and validates Joplin tokens", () => {
    assert.equal(normalizeJoplinToken(` ${VALID_TOKEN} `), VALID_TOKEN);
    assert.equal(normalizeJoplinToken(null), "");
    assert.equal(isValidJoplinToken(VALID_TOKEN), true);
    assert.equal(isValidJoplinToken("short"), false);
    assert.equal(isValidJoplinToken("token with spaces"), false);
  });

  it("fetches Joplin folders with the token query parameter", async () => {
    const folders = [{ id: "notebook-1", title: "Inbox" }];
    const calls = [];
    const fetchImpl = async (...args) => {
      calls.push(args);
      return createJsonResponse({ items: folders });
    };

    const result = await fetchJoplinFolders(` ${VALID_TOKEN} `, { fetchImpl });

    assert.deepEqual(result, folders);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], `http://localhost:41184/folders?token=${VALID_TOKEN}`);
    assert.equal(calls[0][1], undefined);
  });

  it("creates a Joplin note with the existing payload shape", async () => {
    const createdNote = { id: "note-1", title: "Saved article" };
    const calls = [];
    const fetchImpl = async (...args) => {
      calls.push(args);
      return createJsonResponse(createdNote);
    };

    const result = await createJoplinNote({
      joplinToken: VALID_TOKEN,
      title: "Saved article",
      source_url: "https://example.com/story",
      body_html: "<p>Story body</p>",
      parent_id: "notebook-1",
    }, { fetchImpl });

    assert.deepEqual(result, createdNote);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], `http://localhost:41184/notes?token=${VALID_TOKEN}`);
    assert.deepEqual(calls[0][1], {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Saved article",
        source_url: "https://example.com/story",
        parent_id: "notebook-1",
        body_html: "<p>Story body</p>",
      }),
    });
  });

  it("preserves validation error messages before fetch", async () => {
    await assert.rejects(
      () => fetchJoplinFolders(""),
      { message: "Joplin API token is missing." },
    );
    await assert.rejects(
      () => fetchJoplinFolders("bad token value"),
      { message: "Invalid Joplin API token format." },
    );
    await assert.rejects(
      () => createJoplinNote({
        joplinToken: VALID_TOKEN,
        title: "Saved article",
        source_url: "https://example.com/story",
        body_html: "",
        parent_id: "notebook-1",
      }),
      { message: "Missing required parameters for creating Joplin note (token, title, HTML content, or parentId)." },
    );
  });

  it("preserves wrapped Joplin fetch failure messages", async () => {
    const fetchImpl = async () => createJsonResponse(null, {
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: "invalid token",
    });

    await assert.rejects(
      () => fetchJoplinFolders(VALID_TOKEN, { fetchImpl }),
      {
        message: "Network error or invalid Joplin API URL. Ensure Joplin is running and API is enabled: Failed to fetch Joplin notebooks: Forbidden - invalid token",
      },
    );
  });
});
