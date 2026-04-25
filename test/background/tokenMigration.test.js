import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_JOPLIN_TOKEN,
  STORAGE_KEY_NEWSBLUR_TOKEN,
  STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
} from "../../constants.js";
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

describe("background token migration", () => {
  it("removes each migrated legacy sync token before a later token failure", async () => {
    const chromeMock = installBackgroundChromeMock();
    const originalLocalSet = chromeMock.storage.local.set.bind(chromeMock.storage.local);

    chromeMock.__mock.setStorageArea("sync", {
      [STORAGE_KEY_API_KEY]: "sk-test-secret",
      [STORAGE_KEY_NEWSBLUR_TOKEN]: "newsblur-test-secret",
      [STORAGE_KEY_JOPLIN_TOKEN]: "joplin-test-secret",
    });
    chromeMock.storage.local.set = (items, callback) => {
      if (Object.hasOwn(items, STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL)) {
        return Promise.reject(new Error("Forced NewsBlur save failure"));
      }

      return originalLocalSet(items, callback);
    };

    installUnrefTimers();
    await import(new URL("../../background.js?token-migration-test", import.meta.url).href);
    await Promise.all(chromeMock.runtime.onInstalled.dispatch());

    const syncStore = chromeMock.__mock.getStorageArea("sync");
    const localStore = chromeMock.__mock.getStorageArea("local");

    assert.equal(syncStore[STORAGE_KEY_API_KEY], undefined);
    assert.equal(syncStore[STORAGE_KEY_NEWSBLUR_TOKEN], "newsblur-test-secret");
    assert.equal(syncStore[STORAGE_KEY_JOPLIN_TOKEN], "joplin-test-secret");
    assert.equal(typeof localStore[STORAGE_KEY_API_KEY_LOCAL], "string");
    assert.equal(localStore[STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL], undefined);
  });
});
