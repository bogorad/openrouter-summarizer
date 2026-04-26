import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import domino from "@mixmark-io/domino";

import {
  STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_ENABLED,
  STORAGE_KEY_NEWSBLUR_SHARE_PREFACE_TEMPLATE,
} from "../../constants.js";
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
