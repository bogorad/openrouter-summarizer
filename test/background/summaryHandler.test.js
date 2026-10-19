/** Production summary-handler regressions for the model priced by the content caller. */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  STORAGE_KEY_API_KEY_LOCAL,
  STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
  STORAGE_KEY_SUMMARY_MODEL_ID,
} from "../../constants.js";
import { handleGetModelPricing } from "../../js/pricingService.js";
import { handleRequestSummary } from "../../js/summaryHandler.js";
import { saveOpenRouterApiKey } from "../../js/state/secretStore.js";
import { saveSettings } from "../../js/state/settingsStore.js";
import { installChromeMock } from "../helpers/chromeMock.js";

const FREE_ID = "minimax/minimax-m3.1-flash:free";
const PAID_ID = "fixture/paid-model";
const sender = { tab: { id: 42 } };

// Uses the real callback handler and records every acknowledgement.
const requestSummary = async (overrides = {}) => {
  const acknowledgements = [];
  await handleRequestSummary({ requestId: "summary-1", selectedHtml: "A short article.", model: FREE_ID, hasNewsblurToken: true, ...overrides }, sender, (response) => acknowledgements.push(response));
  return acknowledgements;
};

describe("summaryHandler captured model", () => {
  let chromeMock;
  let fetchCalls;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    chromeMock = installChromeMock();
    await saveOpenRouterApiKey("sk-summary-model-fixture");
    await saveSettings({ models: [{ id: FREE_ID }, { id: PAID_ID }], summaryModelId: FREE_ID, alwaysUseUsEnglish: true });
    fetchCalls = [];
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, payload: JSON.parse(options.body), title: options.headers["X-Title"] });
      return { ok: true, json: async () => ({ choices: [{ message: { content: options.headers["X-Title"] === "OR-Summ: Language Detection" ? "eng" : "<p>Summary.</p>" } }] }) };
    };
  });

  afterEach(() => { globalThis.fetch = originalFetch; });

  it("keeps priced free model A after only the saved default changes to B; the next action can use B", async () => {
    await chrome.storage.local.set({ [STORAGE_KEY_KNOWN_MODELS_AND_PRICES]: { [FREE_ID]: { id: FREE_ID, pricePerToken: 0, timestamp: Date.now() } } });
    let pricing;
    await handleGetModelPricing({ modelId: FREE_ID }, (response) => { pricing = response; });
    assert.deepEqual(pricing, { status: "success", pricePerToken: 0 });
    assert.equal(fetchCalls.length, 0);
    await chrome.storage.sync.set({ [STORAGE_KEY_SUMMARY_MODEL_ID]: PAID_ID });

    assert.deepEqual(await requestSummary(), [{ status: "processing" }]);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].payload.model, FREE_ID);
    assert.equal(fetchCalls[0].payload.messages[1].content, "A short article.");
    assert.deepEqual(await requestSummary({ requestId: "summary-2", model: PAID_ID }), [{ status: "processing" }]);
    assert.equal(fetchCalls.length, 2);
    assert.equal(fetchCalls[1].payload.model, PAID_ID);
    const delivered = chromeMock.__mock.calls.tabsSendMessage;
    assert.equal(delivered.length, 2);
    assert.deepEqual(delivered.map(({ tabId, message }) => ({ tabId, requestId: message.requestId, model: message.model, action: message.action, summary: message.summary, hasNewsblurToken: message.hasNewsblurToken })), [
      { tabId: 42, requestId: "summary-1", model: FREE_ID, action: "summaryResult", summary: "<p>Summary.</p>", hasNewsblurToken: true },
      { tabId: 42, requestId: "summary-2", model: PAID_ID, action: "summaryResult", summary: "<p>Summary.</p>", hasNewsblurToken: true },
    ]);
  });

  it("keeps an exact configured routing ID in generation", async () => {
    const model = `${PAID_ID}:auto`;
    await saveSettings({ models: [{ id: PAID_ID }, { id: model }], summaryModelId: PAID_ID });
    assert.deepEqual(await requestSummary({ model }), [{ status: "processing" }]);
    assert.equal(fetchCalls[0].payload.model, model);
  });

  it("rejects a model removed after pricing before any API call, including language detection", async () => {
    await saveSettings({ models: [{ id: PAID_ID }], summaryModelId: PAID_ID, alwaysUseUsEnglish: false });
    const responses = await requestSummary();
    assert.equal(responses.length, 1);
    assert.equal(responses[0].status, "error");
    assert.match(responses[0].message, /configured|invalid/i);
    assert.equal(fetchCalls.length, 0);
    assert.equal(chromeMock.__mock.calls.tabsSendMessage.length, 1);
    assert.equal(chromeMock.__mock.calls.tabsSendMessage[0].message.requestId, "summary-1");
    assert.match(chromeMock.__mock.calls.tabsSendMessage[0].message.error, /configured|invalid/i);
  });

  for (const [label, model] of [["missing", undefined], ["blank", ""], ["whitespace", "  "], ["null", null], ["boolean", true], ["number", 123], ["array", [FREE_ID]], ["object", { id: FREE_ID }], ["unconfigured", "fixture/unconfigured"], ["unconfigured modifier", `${FREE_ID}:online`]]) {
    it(`rejects a ${label} model without language detection or generation`, async () => {
      await saveSettings({ alwaysUseUsEnglish: false });
      const responses = await requestSummary({ model });
      assert.equal(responses.length, 1);
      assert.equal(responses[0].status, "error");
      assert.equal(fetchCalls.length, 0);
      if (model === undefined) assert.match(responses[0].message, /refresh.*page/i);
      const results = chromeMock.__mock.calls.tabsSendMessage;
      assert.equal(results.length, 1);
      assert.equal(results[0].message.requestId, "summary-1");
      assert.equal(results[0].message.error, responses[0].message);
    });
  }

  it("preserves language detection for a valid model and sends one final result", async () => {
    await saveSettings({ alwaysUseUsEnglish: false });
    assert.deepEqual(await requestSummary(), [{ status: "processing" }]);
    assert.equal(fetchCalls.length, 2);
    assert.equal(fetchCalls[0].title, "OR-Summ: Language Detection");
    assert.equal(fetchCalls[1].payload.model, FREE_ID);
    assert.equal(chromeMock.__mock.calls.tabsSendMessage.length, 1);
    assert.equal(chromeMock.__mock.calls.tabsSendMessage[0].message.requestId, "summary-1");
  });

  it("delivers a single matching error and acknowledgement when generation fails", async () => {
    globalThis.fetch = async () => { throw new Error("fixture generation unavailable"); };
    const responses = await requestSummary();
    assert.deepEqual(responses, [{ status: "error", message: "fixture generation unavailable" }]);
    const results = chromeMock.__mock.calls.tabsSendMessage;
    assert.equal(results.length, 1);
    assert.equal(results[0].message.requestId, "summary-1");
    assert.equal(results[0].message.error, responses[0].message);
  });

  it("preserves the clear stored-key error without an API call", async () => {
    await chrome.storage.local.set({ [STORAGE_KEY_API_KEY_LOCAL]: "invalid-key-fixture" });
    const responses = await requestSummary();
    assert.equal(responses.length, 1);
    assert.equal(responses[0].status, "error");
    assert.match(responses[0].message, /Stored API key.*Re-enter/);
    assert.equal(fetchCalls.length, 0);
    assert.equal(chromeMock.__mock.calls.tabsSendMessage.length, 1);
  });
});
