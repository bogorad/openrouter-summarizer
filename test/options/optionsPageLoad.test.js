import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import domino from "@mixmark-io/domino";

import {
  STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED,
  STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE,
  STORAGE_KEY_KNOWN_MODELS_AND_PRICES,
} from "../../constants.js";
import { RuntimeMessageActions } from "../../js/messaging/actions.js";
import { saveOpenRouterApiKey } from "../../js/state/secretStore.js";
import { saveSettings } from "../../js/state/settingsStore.js";
import { installChromeMock, resetChromeMock } from "../helpers/chromeMock.js";

const optionsHtml = readFileSync(
  new URL("../../options.html", import.meta.url),
  "utf8",
);

const installOptionsDom = () => {
  const window = domino.createWindow(optionsHtml, "chrome-extension://test/options.html");
  const { document } = window;
  const ensureDataset = (element) => {
    if (!element || element.dataset) return element;
    Object.defineProperty(element, "dataset", {
      configurable: true,
      value: {},
    });
    return element;
  };
  const originalCreateElement = document.createElement.bind(document);

  Object.defineProperty(document, "createElement", {
    configurable: true,
    value(tagName) {
      return ensureDataset(originalCreateElement(tagName));
    },
  });
  Array.from(document.querySelectorAll("[data-tab]")).forEach((element) => {
    ensureDataset(element);
    element.dataset.tab = element.getAttribute("data-tab");
  });

  globalThis.document = window.document;
  globalThis.window = window;
  globalThis.location = window.location;
  globalThis.Node = domino.impl.Node;
  globalThis.alert = () => {};
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: window.navigator,
  });

  return window;
};

const waitForInputValue = async (input, expectedValue) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (input.value === expectedValue) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const waitForCondition = async (predicate) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test("language metadata failure does not block API key display", async () => {
  const chromeMock = installChromeMock();
  resetChromeMock(chromeMock);
  chromeMock.runtime.getURL = (path) => `chrome-extension://test/${path}`;

  const apiKey = "sk-or-v1-existing-token";
  const saveResult = await saveOpenRouterApiKey(apiKey);
  assert.equal(saveResult.success, true);

  const window = installOptionsDom();
  globalThis.fetch = async () => {
    throw new Error("language asset unavailable");
  };

  await import(new URL("../../options.js?test=language-asset-failure", import.meta.url));
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  const apiKeyInput = window.document.getElementById("apiKey");
  await waitForInputValue(apiKeyInput, apiKey);

  assert.equal(apiKeyInput.value, apiKey);
});

test("NewsBlur preface controls load, save, and reset defaults", async () => {
  const chromeMock = installChromeMock();
  resetChromeMock(chromeMock);
  chromeMock.runtime.getURL = (path) => `chrome-extension://test/${path}`;
  await saveSettings(
    {
      [STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED]: true,
      [STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE]:
        "  LLM (@LLMNAME@) says:  ",
    },
    { chromeApi: chromeMock },
  );

  const window = installOptionsDom();
  globalThis.confirm = () => true;
  globalThis.fetch = async () => {
    throw new Error("language asset unavailable");
  };

  await import(new URL("../../options.js?test=newsblur-preface", import.meta.url));
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  const enabled = window.document.getElementById("newsblurSharePrefaceEnabled");
  const template = window.document.getElementById("newsblurSharePrefaceTemplate");
  const note = window.document.getElementById("newsblurSharePrefaceNote");
  const saveButton = window.document.getElementById("saveBtn");
  const resetButton = window.document.getElementById("resetDefaultsBtn");

  await waitForCondition(() => template.value === "LLM (@LLMNAME@) says:");

  assert.ok(enabled);
  assert.ok(template);
  assert.equal(enabled.checked, true);
  assert.equal(template.value, "LLM (@LLMNAME@) says:");
  assert.equal(template.getAttribute("aria-describedby"), note.id);
  assert.match(
    window.document.body.textContent,
    /When sharing to newsblur, preface with this line:/,
  );

  enabled.checked = false;
  template.value = "  Draft for later  ";
  saveButton.dispatchEvent(new window.Event("click"));
  await waitForCondition(() => {
    const store = chromeMock.__mock.getStorageArea("sync");
    return (
      store[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED] === false &&
      store[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE] === "Draft for later"
    );
  });

  let store = chromeMock.__mock.getStorageArea("sync");
  assert.equal(store[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED], false);
  assert.equal(
    store[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE],
    "Draft for later",
  );

  enabled.checked = true;
  template.value = "Temporary line";
  resetButton.dispatchEvent(new window.Event("click"));
  await waitForCondition(() => {
    const nextStore = chromeMock.__mock.getStorageArea("sync");
    return (
      template.value === "" &&
      nextStore[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED] === false &&
      nextStore[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE] === ""
    );
  });

  store = chromeMock.__mock.getStorageArea("sync");
  assert.equal(enabled.checked, false);
  assert.equal(template.value, "");
  assert.equal(store[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED], false);
  assert.equal(store[STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE], "");
});

const FREE_ID = "minimax/minimax-m3.1-flash:free";
const PAID_ID = "fixture/paid";
const catalogRecord = (id, pricePerToken) => ({ id, name: id, pricePerToken, timestamp: Date.now() });
let pricingPageIndex = 0;

// Loads the real options page with configured models and controlled background replies.
const loadPricingOptionsPage = async ({ catalog = {}, refreshCatalog = catalog, refreshFails = false, price = 0, chromeMock } = {}) => {
  const isReload = Boolean(chromeMock);
  chromeMock ||= installChromeMock();
  chromeMock.runtime.getURL = (path) => `chrome-extension://test/${path}`;
  if (!isReload) {
    await saveOpenRouterApiKey("sk-options-pricing-fixture");
    await saveSettings({
      models: [{ id: PAID_ID }, { id: FREE_ID }],
      summaryModelId: FREE_ID,
      chatModelId: FREE_ID,
      maxRequestPrice: 0.005,
    });
    await chromeMock.storage.local.set({ [STORAGE_KEY_KNOWN_MODELS_AND_PRICES]: catalog });
    chromeMock.runtime.onMessage.addListener((request, sender, respond) => {
      if (request.action === RuntimeMessageActions.updateKnownModelsAndPricing) {
        if (refreshFails) {
          respond({ status: "error", message: "fixture catalog unavailable" });
        } else {
          chromeMock.storage.local.set({ [STORAGE_KEY_KNOWN_MODELS_AND_PRICES]: refreshCatalog }, () => {
            respond({ status: "success", updated: Object.keys(refreshCatalog).length });
          });
          return true;
        }
      } else if (request.action === RuntimeMessageActions.getModelPricing) {
        respond(price === "error" ? { status: "error", message: "fixture pricing unavailable" } : { status: "success", pricePerToken: price });
      }
    });
  }
  const window = installOptionsDom();
  globalThis.fetch = async () => ({ ok: true, json: async () => [] });
  await import(new URL(`../../options.js?pricing-page=${++pricingPageIndex}`, import.meta.url));
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await waitForCondition(() => Boolean(window.document.getElementById("modelText_1")));
  await new Promise((resolve) => setImmediate(resolve));
  if (!isReload && !refreshFails && chromeMock.__mock.calls.runtimeSendMessage.some(({ action }) => action === RuntimeMessageActions.updateKnownModelsAndPricing)) {
    await waitForCondition(() => window.document.getElementById("status").textContent === "Changes saved!");
  }
  return { window, chromeMock };
};

const assertFreeDefaults = (document) => {
  assert.equal(document.getElementById("summary-radio-1").checked, true, "configured free summary remains selected");
  assert.equal(document.getElementById("chat-radio-1").checked, true, "configured free chat remains selected");
  assert.equal(document.getElementById("summary-radio-1").value, FREE_ID);
  assert.equal(document.getElementById("chat-radio-1").value, FREE_ID);
};

test("paid-first catalog preserves free defaults through load, refresh, blur, Save, and reload", async () => {
  const catalog = { [PAID_ID]: catalogRecord(PAID_ID, "0.000001"), [FREE_ID]: catalogRecord(FREE_ID, "0") };
  let { window, chromeMock } = await loadPricingOptionsPage({ catalog });
  assertFreeDefaults(window.document);
  assert.match(window.document.getElementById("maxKbDisplay").textContent, /No limit/);

  window.document.getElementById("updatePricingBtn").dispatchEvent(new window.Event("click"));
  await waitForCondition(() => window.document.getElementById("pricingNotification").textContent.includes("Updated data"));
  await waitForCondition(() => window.document.getElementById("status").textContent === "Changes saved!");
  assertFreeDefaults(window.document);
  assert.match(window.document.getElementById("maxKbDisplay").textContent, /No limit/);

  const refreshCount = () => chromeMock.__mock.calls.runtimeSendMessage.filter(({ action }) => action === RuntimeMessageActions.updateKnownModelsAndPricing).length;
  const beforeBlur = refreshCount();
  window.document.getElementById("modelText_1").dispatchEvent(new window.Event("blur"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshCount(), beforeBlur, "fresh exact free record needs no blur refresh");
  assertFreeDefaults(window.document);

  window.document.getElementById("saveBtn").dispatchEvent(new window.Event("click"));
  await waitForCondition(() => window.document.getElementById("status").textContent === "Changes saved!");
  let stored = chromeMock.__mock.getStorageArea("sync");
  assert.equal(stored.summaryModelId, FREE_ID);
  assert.equal(stored.chatModelId, FREE_ID);
  ({ window } = await loadPricingOptionsPage({ chromeMock }));
  assertFreeDefaults(window.document);
  stored = chromeMock.__mock.getStorageArea("sync");
  assert.equal(stored.summaryModelId, FREE_ID);
  assert.equal(stored.chatModelId, FREE_ID);
});

test("exact free-only cache displays No limit and does not refresh on blur", async () => {
  const catalog = { [FREE_ID]: catalogRecord(FREE_ID, 0) };
  const { window, chromeMock } = await loadPricingOptionsPage({ catalog });
  assertFreeDefaults(window.document);
  assert.match(window.document.getElementById("maxKbDisplay").textContent, /No limit/);
  window.document.getElementById("modelText_1").dispatchEvent(new window.Event("blur"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(chromeMock.__mock.calls.runtimeSendMessage.filter(({ action }) => action === RuntimeMessageActions.updateKnownModelsAndPricing).length, 0);
});

test("missing, empty, and unavailable catalogs retain configured free defaults and report pricing unavailable", async () => {
  for (const fixture of [
    { catalog: { [PAID_ID]: catalogRecord(PAID_ID, 0.000001) }, price: "error" },
    { catalog: {}, refreshFails: true, price: "error" },
    {
      catalog: { [FREE_ID]: { ...catalogRecord(FREE_ID, 0), timestamp: Date.now() - 30 * 86400000 } },
      refreshCatalog: { [PAID_ID]: catalogRecord(PAID_ID, 0.000001) },
      price: "error",
    },
    { catalog: { [PAID_ID]: catalogRecord(PAID_ID, 0.000001), [FREE_ID]: catalogRecord(FREE_ID, "-1") } },
  ]) {
    const { window, chromeMock } = await loadPricingOptionsPage(fixture);
    assertFreeDefaults(window.document);
    assert.match(window.document.getElementById("maxKbDisplay").textContent, /Pricing unavailable/);
    assert.doesNotMatch(window.document.getElementById("maxKbDisplay").textContent, /NaN|Infinity|No limit/);
    window.document.getElementById("status").textContent = "";
    window.document.getElementById("updatePricingBtn").dispatchEvent(new window.Event("click"));
    await new Promise((resolve) => setImmediate(resolve));
    if (!fixture.refreshFails) {
      await waitForCondition(() => window.document.getElementById("status").textContent === "Changes saved!");
    }
    assertFreeDefaults(window.document);
    window.document.getElementById("status").textContent = "";
    window.document.getElementById("saveBtn").dispatchEvent(new window.Event("click"));
    await waitForCondition(() => window.document.getElementById("status").textContent === "Changes saved!");
    const stored = chromeMock.__mock.getStorageArea("sync");
    assert.equal(stored.summaryModelId, FREE_ID);
    assert.equal(stored.chatModelId, FREE_ID);
    assert.ok(chromeMock.__mock.calls.runtimeSendMessage.filter(({ action }) => action === RuntimeMessageActions.getModelPricing).every(({ modelId }) => modelId === FREE_ID));
  }
});

test("explicit removal or emptying of the selected free model keeps configured-list fallback", async () => {
  for (const action of ["remove", "empty"]) {
    const catalog = { [PAID_ID]: catalogRecord(PAID_ID, 0.000001), [FREE_ID]: catalogRecord(FREE_ID, 0) };
    const { window, chromeMock } = await loadPricingOptionsPage({ catalog });
    if (action === "remove") {
      const remove = window.document.querySelectorAll(".model-option")[1].querySelector("button");
      assert.ok(remove);
      remove.dispatchEvent(new window.Event("click"));
    } else {
      const input = window.document.getElementById("modelText_1");
      input.value = "";
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      assert.equal(window.document.getElementById("summary-radio-1").disabled, true);
      assert.equal(window.document.getElementById("chat-radio-1").disabled, true);
    }
    assert.equal(window.document.getElementById("summary-radio-0").checked, true);
    assert.equal(window.document.getElementById("chat-radio-0").checked, true);
    assert.equal(window.document.getElementById("summary-radio-0").value, PAID_ID);
    window.document.getElementById("saveBtn").dispatchEvent(new window.Event("click"));
    await waitForCondition(() => window.document.getElementById("status").textContent === "Changes saved!");
    const stored = chromeMock.__mock.getStorageArea("sync");
    assert.deepEqual(stored.models, [{ id: PAID_ID }]);
    assert.equal(stored.summaryModelId, PAID_ID);
    assert.equal(stored.chatModelId, PAID_ID);
  }
});
