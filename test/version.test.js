import assert from "node:assert/strict";
import test from "node:test";

import {
  formatVersionedLog,
  getExtensionVersion,
} from "../js/version.js";

test("reads the extension version from chrome.runtime.getManifest", () => {
  const chromeApi = {
    runtime: {
      getManifest: () => ({ version: "4.5.6" }),
    },
  };

  assert.equal(getExtensionVersion(chromeApi), "4.5.6");
  assert.equal(
    formatVersionedLog("LLM Content", "Script Start", chromeApi),
    "[LLM Content] Script Start (v4.5.6)",
  );
});

test("falls back outside an extension runtime", () => {
  assert.equal(getExtensionVersion(null), "unknown");
  assert.equal(
    formatVersionedLog("LLM Background", "Service Worker Start", null),
    "[LLM Background] Service Worker Start (vunknown)",
  );
});
