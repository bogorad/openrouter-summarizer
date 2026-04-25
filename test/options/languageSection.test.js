import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  createDefaultLanguageInfo,
  loadLanguageMetadata,
  normalizeLanguageMetadata,
  normalizeLanguageInfoForSave,
  resolveLanguageFlagUrl,
} from "../../js/options/languageSection.js";
import { installChromeMock, resetChromeMock } from "../helpers/chromeMock.js";

const chromeMock = installChromeMock();

describe("languageSection", () => {
  beforeEach(() => {
    resetChromeMock(chromeMock);
    chromeMock.runtime.getURL = (path) =>
      `chrome-extension://test-extension/${path}`;
  });

  it("resolves language flag URLs through chrome.runtime.getURL", () => {
    assert.equal(
      resolveLanguageFlagUrl("ES"),
      "chrome-extension://test-extension/country-flags/svg/es.svg",
    );
    assert.equal(
      resolveLanguageFlagUrl(""),
      "chrome-extension://test-extension/country-flags/svg/un.svg",
    );
  });

  it("creates default language rows with fallback flags for missing codes", () => {
    const defaults = createDefaultLanguageInfo([
      { name: "English", code: "gb" },
      { name: "French", code: "fr" },
    ]);

    assert.deepEqual(defaults, [
      {
        language_name: "English",
        svg_path: "chrome-extension://test-extension/country-flags/svg/gb.svg",
      },
      {
        language_name: "Spanish",
        svg_path: "chrome-extension://test-extension/country-flags/svg/un.svg",
      },
      {
        language_name: "Hebrew",
        svg_path: "chrome-extension://test-extension/country-flags/svg/un.svg",
      },
      {
        language_name: "French",
        svg_path: "chrome-extension://test-extension/country-flags/svg/fr.svg",
      },
    ]);
  });

  it("normalizes language metadata for autocomplete rows", () => {
    assert.deepEqual(
      normalizeLanguageMetadata({
        English: "gb",
        Spanish: "es",
        MissingCode: "",
      }),
      [
        { name: "English", code: "gb" },
        { name: "Spanish", code: "es" },
      ],
    );
    assert.deepEqual(normalizeLanguageMetadata(null), []);
  });

  it("loads language metadata with a fallback when metadata is unavailable", async () => {
    const errors = [];
    const languages = await loadLanguageMetadata({
      fetchJson: async () => {
        throw new Error("missing language asset");
      },
      onError: (error) => errors.push(error.message),
    });

    assert.deepEqual(languages, []);
    assert.deepEqual(errors, ["missing language asset"]);
  });

  it("normalizes valid language rows and skips invalid rows before saving", () => {
    const invalidNames = [];
    const normalized = normalizeLanguageInfoForSave(
      [
        { language_name: " spanish " },
        { language_name: "Missing" },
        { language_name: "" },
        { language_name: "French" },
      ],
      [
        { name: "Spanish", code: "es" },
        { name: "French", code: "fr" },
      ],
      {
        maxLanguages: 5,
        onInvalidLanguage: (name) => invalidNames.push(name),
      },
    );

    assert.deepEqual(normalized, [
      {
        language_name: "Spanish",
        svg_path: "chrome-extension://test-extension/country-flags/svg/es.svg",
      },
      {
        language_name: "French",
        svg_path: "chrome-extension://test-extension/country-flags/svg/fr.svg",
      },
    ]);
    assert.deepEqual(invalidNames, ["Missing"]);
  });
});
