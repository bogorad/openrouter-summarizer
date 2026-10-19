/** Production pricing-handler regressions using isolated Chrome storage and catalog responses. */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { STORAGE_KEY_KNOWN_MODELS_AND_PRICES } from "../../constants.js";
import { handleGetModelPricing, handleUpdateKnownModelsAndPricing } from "../../js/pricingService.js";
import { saveOpenRouterApiKey } from "../../js/state/secretStore.js";
import { installChromeMock } from "../helpers/chromeMock.js";

const FREE_ID = "minimax/minimax-m3.1-flash:free";
const PAID_ID = "minimax/minimax-m3.1-flash";
const invalidPrices = [undefined, null, "", "  ", false, true, [], {}, "oops", "0.1usd", "NaN", "Infinity", "-Infinity", "1e309", "0x10", NaN, Infinity, -Infinity, -1, "-1"];

// Calls the production callback handler and returns its one response.
const getPrice = async (modelId) => {
  const responses = [];
  await handleGetModelPricing({ modelId }, (response) => responses.push(response));
  assert.equal(responses.length, 1);
  return responses[0];
};

describe("pricingService exact IDs and available prices", () => {
  let chromeMock;
  let fetchCalls;
  let catalog;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    chromeMock = installChromeMock();
    await saveOpenRouterApiKey("sk-test-pricing");
    fetchCalls = 0;
    catalog = [];
    globalThis.fetch = async () => {
      fetchCalls++;
      return { ok: true, json: async () => ({ data: catalog }) };
    };
  });

  afterEach(() => { globalThis.fetch = originalFetch; });

  // Seeds the existing Chrome storage mock with the cache record shape.
  const seedCache = async (entries, timestamp = Date.now()) => {
    const records = Object.fromEntries(Object.entries(entries).map(([id, pricePerToken]) => [id, { id, pricePerToken, timestamp }]));
    await chrome.storage.local.set({ [STORAGE_KEY_KNOWN_MODELS_AND_PRICES]: records });
  };

  it("returns numeric zero for an exact free-only fresh cache without fetch", async () => {
    await seedCache({ [FREE_ID]: "0" });
    assert.deepEqual(await getPrice(`  ${FREE_ID}  `), { status: "success", pricePerToken: 0 });
    assert.equal(fetchCalls, 0);
  });

  it("uses the exact free record before a paid base and normalizes paid strings", async () => {
    await seedCache({ [PAID_ID]: "0.000002", [FREE_ID]: 0 });
    assert.deepEqual(await getPrice(FREE_ID), { status: "success", pricePerToken: 0 });
    assert.deepEqual(await getPrice(PAID_ID), { status: "success", pricePerToken: 0.000002 });
    assert.equal(fetchCalls, 0);
  });

  it("checks exact routing IDs first and falls back only through recognized trailing modifiers", async () => {
    await seedCache({ [PAID_ID]: 0.000002, [`${PAID_ID}:online`]: 0.000003, [FREE_ID]: 0, "fixture/paid-only": 0.000004 });
    assert.equal((await getPrice(`${PAID_ID}:online`)).pricePerToken, 0.000003);
    for (const suffix of ["nitro", "floor", "auto"]) {
      assert.equal((await getPrice(`${PAID_ID}:${suffix}`)).pricePerToken, 0.000002, suffix);
    }
    for (const suffix of ["online", "nitro", "floor", "auto"]) {
      assert.equal((await getPrice(`fixture/paid-only:${suffix}`)).pricePerToken, 0.000004, suffix);
    }
    assert.equal((await getPrice(`${PAID_ID}:online:floor`)).pricePerToken, 0.000003);
    assert.equal((await getPrice(`${FREE_ID}:online:nitro`)).pricePerToken, 0);
    assert.equal(fetchCalls, 0);
    for (const modelId of [`${PAID_ID}:unknown`, "fixture/paid-only:free", `${PAID_ID}:unknown:auto`]) {
      catalog = [{ id: PAID_ID, pricing: { prompt: "0.000002" } }, { id: "fixture/paid-only", pricing: { prompt: "0.000002" } }];
      assert.equal((await getPrice(modelId)).status, "error", modelId);
    }
  });

  for (const [label, timestamp] of [["cold", null], ["stale", Date.now() - 8 * 86400000]]) {
    it(`refreshes a ${label} catalog and then caches exact free and paid prices`, async () => {
      if (timestamp !== null) await seedCache({ [FREE_ID]: 0.1 }, timestamp);
      catalog = [{ id: FREE_ID, pricing: { prompt: "0" } }, { id: PAID_ID, pricing: { prompt: "0.000002" } }];
      assert.deepEqual(await getPrice(FREE_ID), { status: "success", pricePerToken: 0 });
      assert.equal((await getPrice(PAID_ID)).pricePerToken, 0.000002);
      assert.equal((await getPrice(FREE_ID)).pricePerToken, 0);
      assert.equal(fetchCalls, 1);
    });
  }

  it("rejects invalid cached exact prices without inheriting the valid paid base", async () => {
    for (const price of invalidPrices) {
      await seedCache({ [FREE_ID]: price, [PAID_ID]: 0.000002 });
      const response = await getPrice(FREE_ID);
      assert.equal(response.status, "error", String(price));
      assert.match(response.message, /explicitly priced/i);
      assert.ok(response.message.includes(FREE_ID));
    }
    assert.equal(fetchCalls, 0);
  });

  it("retains unpriced catalog entries and rejects invalid refreshed prices", async () => {
    catalog = invalidPrices.map((prompt, index) => ({ id: `fixture/invalid-${index}`, pricing: { prompt } }));
    catalog.push({ id: "openrouter/auto", pricing: { prompt: "-1" } });
    await handleUpdateKnownModelsAndPricing(() => {});
    const stored = chromeMock.__mock.getStorageArea("local")[STORAGE_KEY_KNOWN_MODELS_AND_PRICES];
    for (const { id } of catalog) {
      assert.ok(Object.hasOwn(stored, id), id);
      assert.notEqual(stored[id].pricePerToken, 0, id);
      const response = await getPrice(id);
      assert.equal(response.status, "error", id);
      assert.match(response.message, /explicitly priced/i);
    }
    assert.equal(fetchCalls, 1);
  });

  it("reports unknown free-looking IDs after refresh without treating them as free", async () => {
    const response = await getPrice("fixture/missing:free");
    assert.equal(response.status, "error");
    assert.match(response.message, /fixture\/missing:free/);
    assert.equal(fetchCalls, 1);
  });

  it("preserves fetch failure and its existing three attempts", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (callback) => { queueMicrotask(callback); return 0; };
    globalThis.fetch = async () => { fetchCalls++; throw new Error("fixture network unavailable"); };
    try {
      const response = await getPrice(FREE_ID);
      assert.equal(response.status, "error");
      assert.match(response.message, /3 attempts.*fixture network unavailable/);
      assert.equal(fetchCalls, 3);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});
