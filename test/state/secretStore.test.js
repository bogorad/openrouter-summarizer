import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_JOPLIN_TOKEN_LOCAL,
  STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
} from "../../constants.js";
import { installChromeMock, resetChromeMock } from "../helpers/chromeMock.js";
import {
  SECRET_JOPLIN_TOKEN,
  SECRET_NEWSBLUR_TOKEN,
  SECRET_OPENROUTER_API_KEY,
  getSecretCapabilities,
  hasSecretStorage,
  loadSecret,
  removeSecret,
  saveSecret,
} from "../../js/state/secretStore.js";

describe("secretStore", () => {
  let chromeMock;

  beforeEach(() => {
    chromeMock = installChromeMock();
    resetChromeMock(chromeMock);
  });

  it("reports whether encrypted local storage is available", () => {
    assert.equal(hasSecretStorage(chromeMock), true);
    assert.equal(hasSecretStorage({ storage: {} }), false);
    assert.equal(hasSecretStorage(null), false);
  });

  it("saves encrypted local tokens and loads plaintext for privileged callers", async () => {
    const saveResult = await saveSecret(
      SECRET_OPENROUTER_API_KEY,
      " sk-test-secret ",
      { chromeApi: chromeMock },
    );
    const localStore = chromeMock.__mock.getStorageArea("local");

    assert.deepEqual(saveResult, { success: true, error: null });
    assert.equal(typeof localStore[STORAGE_KEY_API_KEY_LOCAL], "string");
    assert.notEqual(localStore[STORAGE_KEY_API_KEY_LOCAL], "sk-test-secret");
    assert.notEqual(localStore[STORAGE_KEY_API_KEY_LOCAL], " sk-test-secret ");

    const loadResult = await loadSecret(SECRET_OPENROUTER_API_KEY, {
      chromeApi: chromeMock,
    });

    assert.deepEqual(loadResult, {
      success: true,
      data: "sk-test-secret",
      error: null,
    });
  });

  it("returns UI-safe capability flags without raw secret values", async () => {
    await saveSecret(SECRET_OPENROUTER_API_KEY, "sk-test-secret", {
      chromeApi: chromeMock,
    });
    await saveSecret(SECRET_NEWSBLUR_TOKEN, "newsblur-test-secret", {
      chromeApi: chromeMock,
    });
    await saveSecret(SECRET_JOPLIN_TOKEN, "", { chromeApi: chromeMock });

    const capabilities = await getSecretCapabilities({ chromeApi: chromeMock });

    assert.deepEqual(capabilities, {
      hasApiKey: true,
      hasJoplinToken: false,
      hasNewsblurToken: true,
    });
    assert.equal("apiKey" in capabilities, false);
    assert.equal("newsblurToken" in capabilities, false);
    assert.equal("joplinToken" in capabilities, false);
  });

  it("removes encrypted local tokens", async () => {
    await saveSecret(SECRET_JOPLIN_TOKEN, "joplin-test-secret", {
      chromeApi: chromeMock,
    });

    const removeResult = await removeSecret(SECRET_JOPLIN_TOKEN, {
      chromeApi: chromeMock,
    });
    const localStore = chromeMock.__mock.getStorageArea("local");
    const loadResult = await loadSecret(SECRET_JOPLIN_TOKEN, {
      chromeApi: chromeMock,
    });

    assert.deepEqual(removeResult, { success: true, error: null });
    assert.equal(localStore[STORAGE_KEY_JOPLIN_TOKEN_LOCAL], undefined);
    assert.deepEqual(loadResult, { success: true, data: "", error: null });
  });

  it("handles unavailable local storage without exposing secrets", async () => {
    const chromeWithoutLocal = { storage: {} };

    assert.deepEqual(
      await loadSecret(SECRET_NEWSBLUR_TOKEN, { chromeApi: chromeWithoutLocal }),
      { success: true, data: "", error: null },
    );
    assert.deepEqual(
      await getSecretCapabilities({ chromeApi: chromeWithoutLocal }),
      {
        hasApiKey: false,
        hasJoplinToken: false,
        hasNewsblurToken: false,
      },
    );
  });

  it("uses separate local storage keys for each supported token", async () => {
    await saveSecret(SECRET_OPENROUTER_API_KEY, "sk-test-secret", {
      chromeApi: chromeMock,
    });
    await saveSecret(SECRET_NEWSBLUR_TOKEN, "newsblur-test-secret", {
      chromeApi: chromeMock,
    });
    await saveSecret(SECRET_JOPLIN_TOKEN, "joplin-test-secret", {
      chromeApi: chromeMock,
    });

    const localStore = chromeMock.__mock.getStorageArea("local");

    assert.equal(typeof localStore[STORAGE_KEY_API_KEY_LOCAL], "string");
    assert.equal(typeof localStore[STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL], "string");
    assert.equal(typeof localStore[STORAGE_KEY_JOPLIN_TOKEN_LOCAL], "string");
  });
});
