import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import domino from "@mixmark-io/domino";

import {
  calculateSummaryKbLimit,
  createOptionsPricingSection,
  isKnownModelPricingMissingOrExpired,
} from "../../js/options/pricingSection.js";
import { RuntimeMessageActions } from "../../js/messaging/actions.js";
import { installChromeMock } from "../helpers/chromeMock.js";

const installDom = () => {
  const document = domino.createDocument(
    "<!doctype html><html><body><div id=\"maxKbDisplay\"></div><p id=\"pricingNotification\"></p><button id=\"updatePricingBtn\"></button></body></html>",
    "https://reader.example/options-pricing",
  );
  globalThis.window = document.defaultView;
  globalThis.document = document;
  globalThis.Node = domino.impl.Node;
  return document;
};

describe("pricingSection", () => {
  let document;

  beforeEach(() => {
    document = installDom();
    installChromeMock();
  });

  afterEach(() => {
    globalThis.window?.close?.();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
  });

  it("calculates summary KiB limits from max price and token pricing", () => {
    assert.deepEqual(calculateSummaryKbLimit(0.005, 0.000001), {
      stateValue: "16",
      displayValue: "~16",
    });
    assert.deepEqual(calculateSummaryKbLimit(0.005, 0), {
      stateValue: "No limit",
      displayValue: "No limit",
    });
    assert.deepEqual(calculateSummaryKbLimit(0.005, "0"), {
      stateValue: "No limit",
      displayValue: "No limit",
    });
    assert.deepEqual(calculateSummaryKbLimit(0, 0.000001), {
      stateValue: "0",
      displayValue: "0",
    });
  });

  it("detects missing and expired pricing cache data", () => {
    const now = 1_000_000_000;
    assert.equal(isKnownModelPricingMissingOrExpired({}, now), true);
    assert.equal(
      isKnownModelPricingMissingOrExpired({
        "model/a": { timestamp: now },
      }, now),
      false,
    );
    assert.equal(
      isKnownModelPricingMissingOrExpired({
        "model/a": { timestamp: 0 },
      }, now),
      true,
    );
  });

  it("renders cached pricing and updates the max price on blur", async () => {
    const state = {
      summaryModelId: "model/a",
      maxRequestPrice: 0.005,
      summaryKbLimit: "",
      pricingCache: {},
      knownModelsAndPrices: {
        "model/a": {
          id: "model/a",
          name: "Model A",
          pricePerToken: 0.000001,
          timestamp: Date.now(),
        },
      },
    };
    const models = [];
    const controller = createOptionsPricingSection({
      maxKbDisplay: document.getElementById("maxKbDisplay"),
      pricingNotification: document.getElementById("pricingNotification"),
      updatePricingBtn: document.getElementById("updatePricingBtn"),
      state,
      setAutocompleteModels: (nextModels) => {
        models.splice(0, models.length, ...nextModels);
      },
      validateCurrentModels: () => {},
      saveSettings: () => {},
    });

    await controller.calculateKbLimitForSummary();
    assert.equal(state.summaryKbLimit, "16");
    assert.match(document.getElementById("maxKbDisplay").textContent, /~16/);

    const input = document.getElementById("maxPriceInput");
    input.value = "0.010";
    const blurEvent = document.createEvent("Event");
    blurEvent.initEvent("blur", true, true);
    input.dispatchEvent(blurEvent);
    assert.equal(state.maxRequestPrice, 0.01);

    controller.checkPricingData();
    assert.deepEqual(models, [{ id: "model/a", name: "Model A" }]);
  });

  // Uses the production controller and existing DOM controls.
  const createFixture = (overrides = {}) => {
    const state = {
      summaryModelId: "fixture/paid:free",
      maxRequestPrice: 0.005,
      summaryKbLimit: "",
      pricingCache: {},
      knownModelsAndPrices: {},
      ...overrides,
    };
    return {
      state,
      controller: createOptionsPricingSection({
        maxKbDisplay: document.getElementById("maxKbDisplay"),
        pricingNotification: document.getElementById("pricingNotification"),
        updatePricingBtn: document.getElementById("updatePricingBtn"),
        state,
      }),
    };
  };

  it("shows unavailable for invalid prompt prices instead of free or nonfinite limits", () => {
    for (const price of [undefined, null, false, true, "", " ", [], {}, "bad", "0.1usd", NaN, Infinity, -1, "-1"]) {
      assert.deepEqual(calculateSummaryKbLimit(0.005, price), { stateValue: "", displayValue: "Pricing unavailable" }, String(price));
    }
  });

  it("uses exact free cached prices before paid bases and retains :auto fallback", async () => {
    const { state, controller } = createFixture({ knownModelsAndPrices: {
      "fixture/paid": { id: "fixture/paid", pricePerToken: "0.000001", timestamp: Date.now() },
      "fixture/paid:free": { id: "fixture/paid:free", pricePerToken: "0", timestamp: Date.now() },
    } });
    await controller.calculateKbLimitForSummary();
    assert.equal(state.summaryKbLimit, "No limit");
    assert.match(document.getElementById("maxKbDisplay").textContent, /No limit/);
    state.summaryModelId = "fixture/paid:auto";
    await controller.calculateKbLimitForSummary();
    assert.equal(state.summaryKbLimit, "16");
    assert.equal(chrome.__mock.calls.runtimeSendMessage.length, 0);
  });

  it("shows unavailable for invalid exact free cache prices without inheriting paid pricing", async () => {
    const { state, controller } = createFixture({ knownModelsAndPrices: {
      "fixture/paid": { id: "fixture/paid", pricePerToken: 0.000001, timestamp: Date.now() },
      "fixture/paid:free": { id: "fixture/paid:free", pricePerToken: null, timestamp: Date.now() },
    } });
    await controller.calculateKbLimitForSummary();
    assert.equal(state.summaryKbLimit, "");
    assert.match(document.getElementById("maxKbDisplay").textContent, /Pricing unavailable/);
    assert.equal(state.summaryModelId, "fixture/paid:free");
  });

  it("sends the full free ID and validates success prices before caching", async () => {
    let responsePrice;
    chrome.runtime.onMessage.addListener((request, sender, respond) => respond({ status: "success", pricePerToken: responsePrice }));
    const { state, controller } = createFixture();
    for (const price of [undefined, null, false, "", "bad", Infinity, -1, "-1"]) {
      responsePrice = price;
      await controller.calculateKbLimitForSummary();
      assert.equal(state.summaryKbLimit, "", String(price));
      assert.match(document.getElementById("maxKbDisplay").textContent, /Pricing unavailable/);
      assert.equal(state.pricingCache[state.summaryModelId], undefined);
    }
    for (const price of [0, "0"]) {
      responsePrice = price;
      await controller.calculateKbLimitForSummary();
      assert.equal(state.summaryKbLimit, "No limit");
      assert.equal(state.pricingCache[state.summaryModelId].pricePerToken, 0);
    }
    assert.ok(chrome.__mock.calls.runtimeSendMessage.filter(({ action }) => action === RuntimeMessageActions.getModelPricing).every((request) => request.modelId === "fixture/paid:free"));
  });

  it("discards a delayed response after the summary selection changes", async () => {
    let respondForA;
    chrome.runtime.onMessage.addListener((request, sender, respond) => {
      if (request.modelId === "fixture/a:free" || request.modelId === "fixture/a") {
        respondForA = respond;
        return true;
      }
      respond({ status: "success", pricePerToken: "0.000001" });
    });
    const { state, controller } = createFixture({ summaryModelId: "fixture/a:free" });
    const pendingA = controller.calculateKbLimitForSummary();
    state.summaryModelId = "fixture/b";
    await controller.calculateKbLimitForSummary();
    assert.equal(state.summaryKbLimit, "16");
    respondForA({ status: "success", pricePerToken: 0 });
    await pendingA;
    assert.equal(state.summaryModelId, "fixture/b");
    assert.equal(state.summaryKbLimit, "16");
    assert.match(document.getElementById("maxKbDisplay").textContent, /~16/);
    assert.equal(state.pricingCache["fixture/b"].pricePerToken, 0.000001);
    assert.equal(state.pricingCache["fixture/a:free"], undefined);
    const stored = chrome.__mock.getStorageArea("local").modelPricingCache;
    assert.equal(stored["fixture/b"].pricePerToken, 0.000001);
  });

  it("keeps maximum-price blur validation for invalid and valid input", async () => {
    const { state, controller } = createFixture({ summaryModelId: "fixture/paid", knownModelsAndPrices: {
      "fixture/paid": { id: "fixture/paid", pricePerToken: 0, timestamp: Date.now() },
    } });
    await controller.calculateKbLimitForSummary();
    for (const value of ["", "bad", "-0.01", "0"]) {
      const input = document.getElementById("maxPriceInput");
      input.value = value;
      const event = document.createEvent("Event");
      event.initEvent("blur", true, true);
      input.dispatchEvent(event);
      assert.equal(state.maxRequestPrice, 0.001);
    }
    const input = document.getElementById("maxPriceInput");
    input.value = "0.010";
    const event = document.createEvent("Event");
    event.initEvent("blur", true, true);
    input.dispatchEvent(event);
    assert.equal(state.maxRequestPrice, 0.01);
  });
});
