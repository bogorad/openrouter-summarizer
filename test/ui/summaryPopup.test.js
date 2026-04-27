import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import domino from "@mixmark-io/domino";

import {
  cleanup,
  enableButtons,
  setActionsDisabled,
  showPopup,
} from "../../summaryPopup.js";

const installDom = () => {
  const window = domino.createWindow(
    "<!doctype html><html><body></body></html>",
    "https://reader.example/summary-popup",
  );
  const { document } = window;

  window.HTMLElement.prototype.attachShadow = function attachShadow() {
    const root = document.createElement("div");
    this.__summaryPopupShadowRoot = root;
    return root;
  };
  window.HTMLElement.prototype.replaceChildren = function replaceChildren(...children) {
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
    children.forEach((child) => this.appendChild(child));
  };
  Object.defineProperty(window, "getComputedStyle", {
    configurable: true,
    value: () => ({ transitionDuration: "0s" }),
  });

  globalThis.window = window;
  globalThis.document = document;
  globalThis.Node = window.Node;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);

  return document;
};

const callbacks = {
  onCopy: () => {},
  onChat: () => {},
  onClose: () => {},
  onOptions: () => {},
  onNewsblur: () => {},
};

const getPopupButtons = (document) => {
  const host = document.getElementById("summarizer-popup-host");
  const root = host.__summaryPopupShadowRoot;

  return {
    chat: root.querySelector(".chat-btn"),
    close: root.querySelector(".close-btn"),
    copy: root.querySelector(".copy-btn"),
    newsblur: root.querySelector(".newsblur-btn"),
  };
};

describe("summaryPopup", () => {
  let document;

  beforeEach(() => {
    document = installDom();
  });

  afterEach(() => {
    cleanup();
    globalThis.window?.close?.();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.HTMLElement;
    delete globalThis.requestAnimationFrame;
  });

  it("disables and re-enables every visible summary action", async () => {
    await showPopup(
      "Summary",
      callbacks,
      null,
      "https://reader.example/story",
      "Story",
      false,
      true,
    );

    enableButtons(true);
    let buttons = getPopupButtons(document);
    assert.equal(buttons.copy.disabled, false);
    assert.equal(buttons.chat.disabled, false);
    assert.equal(buttons.newsblur.disabled, false);
    assert.equal(buttons.close.disabled, false);

    enableButtons(false);
    buttons = getPopupButtons(document);
    assert.equal(buttons.copy.disabled, true);
    assert.equal(buttons.chat.disabled, true);
    assert.equal(buttons.newsblur.disabled, true);
    assert.equal(buttons.close.disabled, true);

    enableButtons(true);
    buttons = getPopupButtons(document);
    assert.equal(buttons.copy.disabled, false);
    assert.equal(buttons.chat.disabled, false);
    assert.equal(buttons.newsblur.disabled, false);
    assert.equal(buttons.close.disabled, false);
  });

  it("disables and re-enables actions through the explicit disabled API", async () => {
    await showPopup(
      "Summary",
      callbacks,
      null,
      "https://reader.example/story",
      "Story",
      false,
      true,
    );

    setActionsDisabled(true);
    let buttons = getPopupButtons(document);
    assert.equal(buttons.copy.disabled, true);
    assert.equal(buttons.chat.disabled, true);
    assert.equal(buttons.newsblur.disabled, true);
    assert.equal(buttons.close.disabled, true);

    setActionsDisabled(false);
    buttons = getPopupButtons(document);
    assert.equal(buttons.copy.disabled, false);
    assert.equal(buttons.chat.disabled, false);
    assert.equal(buttons.newsblur.disabled, false);
    assert.equal(buttons.close.disabled, false);
  });

  it("keeps NewsBlur hidden when no NewsBlur token exists", async () => {
    await showPopup(
      "Summary",
      callbacks,
      null,
      "https://reader.example/story",
      "Story",
      false,
      false,
    );

    const { newsblur } = getPopupButtons(document);
    assert.equal(newsblur.style.display, "none");

    enableButtons(false);
    assert.equal(newsblur.style.display, "none");

    enableButtons(true);
    assert.equal(newsblur.style.display, "none");
  });

  it("keeps error-state Options enabled when normal buttons are disabled", async () => {
    await showPopup(
      "Error: Missing API key.",
      callbacks,
      null,
      "https://reader.example/story",
      "Story",
      true,
      false,
    );

    enableButtons(false);

    const { chat } = getPopupButtons(document);
    assert.equal(chat.textContent, "Options");
    assert.equal(chat.disabled, false);
  });
});
