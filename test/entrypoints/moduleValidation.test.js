import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { test } from "node:test";
import domino from "@mixmark-io/domino";

import { installChromeMock, resetChromeMock } from "../helpers/chromeMock.js";

const rootModules = [
  "background.js",
  "chat.js",
  "options.js",
  "pageInteraction.js",
  "constants.js",
  "utils.js",
  "summaryPopup.js",
  "joplinManager.js",
  "floatingIcon.js",
  "highlighter.js",
];

const collectJavaScriptFiles = (directoryUrl) => {
  const files = [];

  for (const entry of readdirSync(directoryUrl)) {
    const entryUrl = new URL(`${entry}`, directoryUrl);
    const stats = statSync(entryUrl);

    if (stats.isDirectory()) {
      files.push(...collectJavaScriptFiles(new URL(`${entry}/`, directoryUrl)));
      continue;
    }

    if (entry.endsWith(".js")) {
      files.push(entryUrl);
    }
  }

  return files;
};

const patchElementQuerySelectorAll = (element) => {
  const originalQuerySelectorAll = element.querySelectorAll.bind(element);

  Object.defineProperty(element, "querySelectorAll", {
    configurable: true,
    value(selector) {
      return Array.from(originalQuerySelectorAll(selector));
    },
  });

  return element;
};

const installDom = () => {
  const window = domino.createWindow(
    "<!doctype html><html><head><title>Module Validation</title></head><body></body></html>",
    "https://reader.example/module-validation",
  );
  const { document } = window;
  const originalCreateElement = document.createElement.bind(document);

  Object.defineProperty(document, "createElement", {
    configurable: true,
    value(tagName) {
      return patchElementQuerySelectorAll(originalCreateElement(tagName));
    },
  });

  globalThis.document = document;
  globalThis.window = window;
  globalThis.location = window.location;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: window.navigator,
  });

  return document;
};

const installExtensionApiMock = () => {
  const chromeMock = installChromeMock();
  resetChromeMock(chromeMock);

  const createEvent = () => ({
    addListener() {},
    removeListener() {},
    hasListener() {
      return false;
    },
  });

  chromeMock.runtime.onInstalled = createEvent();
  chromeMock.runtime.openOptionsPage = () => {};
  chromeMock.runtime.getURL = (path) => `chrome-extension://test-extension/${path}`;
  chromeMock.contextMenus = {
    create() {},
    onClicked: createEvent(),
  };

  return chromeMock;
};

const installUnrefTimers = () => {
  const originalSetInterval = globalThis.setInterval;
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.setInterval = (...args) => {
    const timer = originalSetInterval(...args);
    timer?.unref?.();
    return timer;
  };
  globalThis.setTimeout = (...args) => {
    const timer = originalSetTimeout(...args);
    timer?.unref?.();
    return timer;
  };
};

const moduleUrls = [
  ...rootModules.map((modulePath) => new URL(`../../${modulePath}`, import.meta.url)),
  ...collectJavaScriptFiles(new URL("../../js/", import.meta.url)),
];

test("extension entrypoints and shared modules import cleanly", async () => {
  installDom();
  installExtensionApiMock();
  installUnrefTimers();

  const failures = [];

  for (const moduleUrl of moduleUrls) {
    try {
      await import(moduleUrl.href);
    } catch (error) {
      failures.push(`${moduleUrl.pathname}: ${error.stack || error.message}`);
    }
  }

  assert.deepEqual(failures, []);
});
