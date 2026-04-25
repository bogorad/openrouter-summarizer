import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import domino from "@mixmark-io/domino";

import { saveOpenRouterApiKey } from "../../js/state/secretStore.js";
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
