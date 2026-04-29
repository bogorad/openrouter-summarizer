import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import domino from "@mixmark-io/domino";

import {
  fetchAndShowNotebookSelection,
  hideJoplinPopup,
  initializeJoplinManager,
} from "../../joplinManager.js";
import { RuntimeMessageActions } from "../../js/messaging/actions.js";
import { createChromeMock } from "../helpers/chromeMock.js";

const folders = [
  { id: "alpha-id", title: "Alpha" },
  { id: "beta-id", title: "Beta" },
];

const installDom = () => {
  const window = domino.createWindow(
    "<!doctype html><html><head><title>Saved Story</title></head><body><div id=\"llm-notification-container\"></div></body></html>",
    "https://reader.example/joplin",
  );
  const { document } = window;

  window.HTMLElement.prototype.replaceChildren = function replaceChildren(...children) {
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
    children.forEach((child) => this.appendChild(child));
  };
  Object.getPrototypeOf(document.createElement("input")).select = function select() {};
  Object.defineProperty(window, "getComputedStyle", {
    configurable: true,
    value: () => ({ transitionDuration: "0s", display: "block", visibility: "visible" }),
  });

  globalThis.window = window;
  globalThis.document = document;
  globalThis.Node = window.Node;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.ShadowRoot = window.ShadowRoot || function ShadowRoot() {};
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);

  return document;
};

const createKeydownEvent = (key) => {
  const event = document.createEvent("Event");
  event.initEvent("keydown", true, true);
  Object.defineProperty(event, "key", { value: key });
  return event;
};

const waitForAsyncWork = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("joplinManager", () => {
  let chromeMock;
  let createNoteMessages;

  beforeEach(() => {
    installDom();
    chromeMock = createChromeMock();
    createNoteMessages = [];
    globalThis.chrome = chromeMock;

    chromeMock.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === RuntimeMessageActions.fetchJoplinNotebooks) {
        sendResponse({ status: "success", folders });
        return true;
      }

      if (message.action === RuntimeMessageActions.createJoplinNote) {
        createNoteMessages.push(message);
        sendResponse({ status: "success", result: { id: "note-id" } });
        return true;
      }

      sendResponse({ status: "error", message: `Unexpected action: ${message.action}` });
      return true;
    });

    initializeJoplinManager({ initialDebugState: false });
  });

  afterEach(async () => {
    hideJoplinPopup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    chromeMock.__mock.reset();
    globalThis.window?.close?.();
    delete globalThis.chrome;
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.HTMLElement;
    delete globalThis.ShadowRoot;
    delete globalThis.requestAnimationFrame;
  });

  it("saves Enter to the notebook shown in the input instead of a stale selection", async () => {
    await fetchAndShowNotebookSelection("<p>Story body</p>", "https://reader.example/story");

    const input = document.querySelector(".joplin-notebook-search-input");
    assert.ok(input);
    assert.equal(input.value, "Alpha");

    input.value = "Beta";
    input.dispatchEvent(createKeydownEvent("Enter"));
    await waitForAsyncWork();

    assert.equal(createNoteMessages.length, 1);
    assert.equal(createNoteMessages[0].parent_id, "beta-id");
  });
});
