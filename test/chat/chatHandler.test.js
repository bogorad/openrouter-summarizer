import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_MODELS,
} from "../../constants.js";
import { encryptSensitiveData } from "../../js/encryption.js";
import { installChromeMock, resetChromeMock } from "../helpers/chromeMock.js";

const installUnrefTimers = () => {
  const originalSetInterval = globalThis.setInterval;
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.setInterval = (...args) => {
    const timer = originalSetInterval(...args);
    timer?.unref?.();
    return timer;
  };
  globalThis.setTimeout = (...args) => {
    const timer = originalSetTimeout(...args);
    timer?.unref?.();
    return timer;
  };
};

const importChatHandler = async () => {
  installUnrefTimers();
  return import("../../js/chatHandler.js");
};

const callChatCompletion = (handler, request) =>
  new Promise((resolve) => {
    handler(request, resolve, false);
  });

describe("chatHandler", () => {
  beforeEach(() => {
    const chromeMock = installChromeMock();
    resetChromeMock(chromeMock);
    delete globalThis.fetch;
  });

  it("sends and reports direct chat completions", async () => {
    const { handleLlmChatCompletion } = await importChatHandler();
    const encryptedApiKey = await encryptSensitiveData("test-api-key");
    await chrome.storage.local.set({ [STORAGE_KEY_API_KEY_LOCAL]: encryptedApiKey });
    await chrome.storage.sync.set({
      [STORAGE_KEY_MODELS]: [{ id: "openrouter/test-model" }],
    });

    const fetchCalls = [];
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            model: "openrouter/test-model",
            choices: [
              {
                message: {
                  content: " Direct answer. ",
                },
              },
            ],
          };
        },
      };
    };

    const response = await callChatCompletion(handleLlmChatCompletion, {
      requestId: "chat-request-1",
      model: "openrouter/test-model",
      messages: [{ role: "user", content: "Question" }],
    });

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(fetchCalls[0].options.method, "POST");
    assert.equal(fetchCalls[0].options.headers.Authorization, "Bearer test-api-key");
    assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
      model: "openrouter/test-model",
      messages: [{ role: "user", content: "Question" }],
      stream: false,
      max_tokens: 4096,
    });
    assert.deepEqual(response, {
      status: "success",
      responseType: "completion",
      requestId: "chat-request-1",
      content: "Direct answer.",
    });
  });
});
