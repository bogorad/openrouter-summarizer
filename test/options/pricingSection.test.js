import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import domino from "@mixmark-io/domino";

import {
  calculateSummaryKbLimit,
  createOptionsPricingSection,
  isKnownModelPricingMissingOrExpired,
} from "../../js/options/pricingSection.js";

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
      summaryModelId: "model/a:free",
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
});
