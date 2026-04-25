import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
} from "../../constants.js";
import { RuntimeMessageActions } from "../../js/messaging/actions.js";
import { installChromeMock, resetChromeMock } from "../helpers/chromeMock.js";

const createEvent = () => {
  const listeners = [];

  return {
    addListener(listener) {
      listeners.push(listener);
    },
    dispatch(...args) {
      return listeners.map((listener) => listener(...args));
    },
  };
};

const installBackgroundChromeMock = () => {
  const chromeMock = installChromeMock();
  resetChromeMock(chromeMock);

  chromeMock.runtime.onInstalled = createEvent();
  chromeMock.runtime.openOptionsPage = () => {};
  chromeMock.contextMenus = {
    create() {},
    onClicked: createEvent(),
  };

  return chromeMock;
};

const installUnrefTimers = () => {
  const originalSetInterval = globalThis.setInterval;

  globalThis.setInterval = (...args) => {
    const timer = originalSetInterval(...args);
    timer?.unref?.();
    return timer;
  };
};

describe("background token load errors", () => {
  it("returns capability errors when stored tokens cannot be decrypted", async () => {
    const chromeMock = installBackgroundChromeMock();
    chromeMock.__mock.setStorageArea("local", {
      [STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL]: "invalid-token-payload",
    });

    installUnrefTimers();
    await import(new URL("../../background.js?token-load-error-test", import.meta.url).href);

    const response = await chrome.runtime.sendMessage({
      action: RuntimeMessageActions.getNewsblurToken,
    });

    assert.equal(response.status, "error");
    assert.equal(response.code, "token_load_failed");
    assert.equal(response.tokenStatus, "decrypt_failed");
    assert.match(response.message, /Failed to load stored NewsBlur token/);
  });
});
