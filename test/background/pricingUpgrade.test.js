/** Exercise the production update hook before reading legacy derived pricing caches. */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_JOPLIN_TOKEN_LOCAL,
  STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
  STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL,
} from "../../constants.js";
import { handleGetModelPricing } from "../../js/pricingService.js";
import { saveOpenRouterApiKey, saveJoplinToken, saveNewsblurToken } from "../../js/state/secretStore.js";
import { installChromeMock } from "../helpers/chromeMock.js";

const createEvent = () => {
  const listeners = [];
  return { addListener: (listener) => listeners.push(listener), dispatch: (...args) => listeners.map((listener) => listener(...args)) };
};

// Imports the actual background entry point, with only unused browser APIs stubbed.
const installBackground = async () => {
  const chromeMock = installChromeMock();
  chromeMock.runtime.onInstalled = createEvent();
  chromeMock.runtime.openOptionsPage = () => {};
  chromeMock.contextMenus = { create() {}, onClicked: createEvent() };
  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = (...args) => {
    const timer = originalSetInterval(...args);
    timer.unref();
    return timer;
  };
  try {
    await import(new URL(`../../background.js?pricing-upgrade-${Date.now()}`, import.meta.url).href);
  } finally {
    globalThis.setInterval = originalSetInterval;
  }
  return chromeMock;
};

const getPrice = async (modelId) => {
  let result;
  await handleGetModelPricing({ modelId }, (response) => { result = response; });
  return result;
};

describe("legacy pricing upgrade boundary", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("removes only derived caches before refresh and keeps settings, credentials, and normal cache hits", async () => {
    const chromeMock = await installBackground();
    await saveOpenRouterApiKey("sk-test-upgrade");
    await saveJoplinToken("joplin-test-upgrade");
    await saveNewsblurToken("newsblur-test-upgrade");
    await chromeMock.storage.sync.set({
      models: [{ id: "fixture/free:free", name: "Free fixture" }, { id: "fixture/paid", name: "Paid fixture" }],
      summaryModelId: "fixture/free:free",
      maxRequestPrice: 0.005,
      maxPriceBehavior: "fail",
      userLanguage: "es",
    });
    await chromeMock.storage.local.set({
      [STORAGE_KEY_KNOWN_MODELS_AND_PRICES]: { "fixture/unpriced": { id: "fixture/unpriced", pricePerToken: 0, timestamp: Date.now() } },
      modelPricingCache: { "fixture/unpriced": { prompt: 0, timestamp: Date.now() } },
      unrelatedLocalSetting: "preserve",
    });
    const before = chromeMock.__mock.getStorageArea("local");
    const removed = [];
    const originalRemove = chromeMock.storage.local.remove.bind(chromeMock.storage.local);
    chromeMock.storage.local.remove = (keys, callback) => {
      removed.push(...(Array.isArray(keys) ? keys : [keys]));
      return originalRemove(keys, callback);
    };
    await Promise.all(chromeMock.runtime.onInstalled.dispatch({ reason: "update", previousVersion: "3.10.7" }));
    assert.deepEqual(removed.sort(), [STORAGE_KEY_KNOWN_MODELS_AND_PRICES, "modelPricingCache"].sort());
    const after = chromeMock.__mock.getStorageArea("local");
    assert.equal(after[STORAGE_KEY_KNOWN_MODELS_AND_PRICES], undefined);
    assert.equal(after.modelPricingCache, undefined);
    for (const key of [STORAGE_KEY_API_KEY_LOCAL, STORAGE_KEY_JOPLIN_TOKEN_LOCAL, STORAGE_KEY_NEWSBLUR_TOKEN_LOCAL, "unrelatedLocalSetting"]) {
      assert.deepEqual(after[key], before[key], key);
    }
    const sync = chromeMock.__mock.getStorageArea("sync");
    assert.equal(sync.summaryModelId, "fixture/free:free");
    assert.equal(sync.maxRequestPrice, 0.005);
    assert.equal(sync.maxPriceBehavior, "fail");
    assert.equal(sync.userLanguage, "es");

    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls++;
      return { ok: true, json: async () => ({ data: [
        { id: "fixture/unpriced", pricing: {} },
        { id: "fixture/free:free", pricing: { prompt: "0" } },
        { id: "fixture/paid", pricing: { prompt: "0.000002" } },
      ] }) };
    };
    const unavailable = await getPrice("fixture/unpriced");
    assert.equal(unavailable.status, "error");
    assert.match(unavailable.message, /explicitly priced/i);
    assert.deepEqual(await getPrice("fixture/free:free"), { status: "success", pricePerToken: 0 });
    assert.deepEqual(await getPrice("fixture/paid"), { status: "success", pricePerToken: 0.000002 });
    assert.equal(fetchCalls, 1);
  });

  it("does not restore an invented legacy zero when the first refresh fails", async () => {
    const chromeMock = await installBackground();
    await saveOpenRouterApiKey("sk-test-upgrade-failure");
    await chromeMock.storage.local.set({
      [STORAGE_KEY_KNOWN_MODELS_AND_PRICES]: { "fixture/unpriced": { id: "fixture/unpriced", pricePerToken: 0, timestamp: Date.now() } },
      modelPricingCache: { "fixture/unpriced": { prompt: 0 } },
    });
    await Promise.all(chromeMock.runtime.onInstalled.dispatch({ reason: "update", previousVersion: "3.10.7" }));
    const originalSetTimeout = globalThis.setTimeout;
    let fetchCalls = 0;
    globalThis.setTimeout = (callback) => { queueMicrotask(callback); return 0; };
    globalThis.fetch = async () => { fetchCalls++; throw new Error("fixture catalog unavailable"); };
    try {
      const response = await getPrice("fixture/unpriced");
      assert.equal(response.status, "error");
      assert.match(response.message, /fixture catalog unavailable/);
      assert.equal(fetchCalls, 3);
      const local = chromeMock.__mock.getStorageArea("local");
      assert.equal(local[STORAGE_KEY_KNOWN_MODELS_AND_PRICES], undefined);
      assert.equal(local.modelPricingCache, undefined);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});
