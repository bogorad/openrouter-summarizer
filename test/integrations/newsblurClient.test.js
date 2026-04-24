import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shareToNewsblur } from "../../js/integrations/newsblurClient.js";

const createJsonResponse = (body, { ok = true, status = 200, text = "" } = {}) => ({
  ok,
  status,
  json: async () => body,
  text: async () => text,
});

const createShareOptions = (overrides = {}) => ({
  token: "newsblur-token",
  story_url: "https://example.com/story",
  title: "Example Story",
  content: "<p>Story body</p>",
  comments: "Summary comment",
  ...overrides,
});

describe("newsblurClient", () => {
  it("shares a story with the existing NewsBlur payload shape", async () => {
    const calls = [];
    const responseBody = { code: 1, message: "OK" };
    const fetchImpl = async (...args) => {
      calls.push(args);
      return createJsonResponse(responseBody);
    };

    const result = await shareToNewsblur(createShareOptions(), { fetchImpl });

    assert.deepEqual(result, responseBody);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "https://www.newsblur.com/api/share_story/newsblur-token");
    assert.deepEqual(calls[0][1], {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: "story_url=https%3A%2F%2Fexample.com%2Fstory&title=Example+Story&content=%3Cp%3EStory+body%3C%2Fp%3E&comments=Summary+comment",
    });
  });

  it("loads the NewsBlur token when the share payload does not include one", async () => {
    const calls = [];
    const fetchImpl = async (...args) => {
      calls.push(args);
      return createJsonResponse({ code: 1 });
    };
    const loadToken = async () => ({
      success: true,
      data: "loaded-newsblur-token",
      error: null,
    });

    const result = await shareToNewsblur(
      createShareOptions({ token: "" }),
      { fetchImpl, loadToken },
    );

    assert.deepEqual(result, { code: 1 });
    assert.equal(calls[0][0], "https://www.newsblur.com/api/share_story/loaded-newsblur-token");
  });

  it("treats NewsBlur 502 responses as success", async () => {
    const fetchImpl = async () => createJsonResponse(null, {
      ok: false,
      status: 502,
      text: "upstream timeout",
    });

    const result = await shareToNewsblur(createShareOptions(), { fetchImpl });

    assert.deepEqual(result, {
      code: 0,
      message: "NewsBlur API 502 received, treated as success: upstream timeout",
    });
  });

  it("normalizes NewsBlur API error result bodies", async () => {
    const fetchImpl = async () => createJsonResponse({
      result: "error",
      message: "Invalid token",
    });

    const result = await shareToNewsblur(createShareOptions(), { fetchImpl });

    assert.deepEqual(result, {
      code: -1,
      message: "Invalid token",
    });
  });

  it("preserves wrapped non-OK response messages as error objects", async () => {
    const fetchImpl = async () => createJsonResponse(null, {
      ok: false,
      status: 403,
      text: "{\"message\":\"Forbidden\"}",
    });

    const result = await shareToNewsblur(createShareOptions(), { fetchImpl });

    assert.deepEqual(result, {
      code: -1,
      message: "HTTP error! status: 403 - {\"message\":\"Forbidden\"} (Parsed JSON: \"Forbidden\")",
    });
  });
});
