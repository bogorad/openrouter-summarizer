/** Run the production content validation/send functions with the real cost policy and runtime client. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import domino from "@mixmark-io/domino";
import * as constants from "../../constants.js";
import { RuntimeMessageActions } from "../../js/messaging/actions.js";
import { sendRuntimeAction } from "../../js/messaging/runtimeClient.js";
import * as truncationPolicy from "../../js/content/truncationPolicy.js";
import { installChromeMock } from "../helpers/chromeMock.js";

const source = readFileSync(new URL("../../pageInteraction.js", import.meta.url), "utf8");
const callerSource = source.slice(source.indexOf("async function validateAndSendToLLM("), source.indexOf("function sendToLLM("));
const activeRequestSource = source.slice(source.indexOf("const isActiveSummaryRequest ="), source.indexOf("const setPopupActionsDisabled ="));
const cleanupSource = source.slice(source.indexOf("const clearSummaryState ="), source.indexOf("// --- Prompt Assembly Function"));
const resultSource = source.slice(source.indexOf("function displaySummary("), source.indexOf("// --- Message Listener from Background ---"));

// Uses complete production functions; only DOM rendering and background replies are mocked.
const runCaller = async (pricePerToken, settings = {}, { onPricing = () => {}, summaryResponse = { status: "processing" } } = {}) => {
  const chromeMock = installChromeMock();
  chromeMock.runtime.onMessage.addListener((request, sender, respond) => {
    if (request.action === RuntimeMessageActions.getSettings) {
      respond({ summaryModelId: "fixture/model:auto", maxRequestPrice: 0.01, ...settings });
    } else if (request.action === RuntimeMessageActions.getModelPricing) {
      onPricing(request);
      respond({ status: "success", pricePerToken });
    } else if (request.action === RuntimeMessageActions.requestSummary) {
      respond(summaryResponse);
    }
  });
  const window = domino.createWindow("<html><head><title>Pricing fixture</title></head><body></body></html>", "https://reader.example/article");
  const document = window.document;
  const errors = [];
  const popupUpdates = [];
  const buttonsEnabled = [];
  const cleanupCalls = [];
  const noop = () => {};
  let requestSequence = 0;
  const context = {
    ...truncationPolicy,
    constants,
    RuntimeMessageActions,
    sendRuntimeAction,
    NOTIFICATION_TIMEOUT_SUCCESS_MS: constants.NOTIFICATION_TIMEOUT_SUCCESS_MS,
    document,
    window,
    DEBUG: false,
    activeSummaryRequestId: null,
    lastSummary: "",
    lastModelUsed: "",
    lastSelectedDomSnippet: null,
    lastProcessedMarkdown: null,
    lastContentArtifacts: null,
    Math: Object.assign(Object.create(Math), { random: () => (++requestSequence) / 1000 }),
    console,
    showError: (message) => errors.push(message),
    SummaryPopup: { showPopup: async () => {}, enableButtons: (enabled) => buttonsEnabled.push(enabled), updatePopupContent: (...args) => popupUpdates.push(args) },
    FloatingIcon: { removeFloatingIcon: () => cleanupCalls.push("icon") },
    Highlighter: { removeSelectionHighlight: () => cleanupCalls.push("highlight") },
    ErrorHandler: { handle: (error) => errors.push(error.message) },
    ErrorSeverity: { WARNING: "warning" },
    handlePopupChat: noop,
    handlePopupClose: noop,
    handlePopupOptions: noop,
    handlePopupNewsblur: noop,
  };
  runInNewContext(activeRequestSource + cleanupSource + callerSource + resultSource, context, { filename: "pageInteraction.js" });
  const content = "a".repeat(100);
  await context.validateAndSendToLLM(content);
  await new Promise((resolve) => setImmediate(resolve));
  return { content, errors, popupUpdates, buttonsEnabled, cleanupCalls, context, calls: chromeMock.__mock.calls.runtimeSendMessage };
};

describe("production content pricing boundary", () => {
  it("never sends requestSummary for a malformed success price reply", async () => {
    for (const price of [undefined, null, false, true, "", " ", NaN, Infinity, -Infinity, "bad", "0.1usd", -1, "-1", [], {}]) {
      const result = await runCaller(price);
      assert.equal(result.calls.filter(({ action }) => action === RuntimeMessageActions.requestSummary).length, 0, String(price));
      assert.match(result.errors.join(" "), /explicitly priced/i);
      assert.ok(result.popupUpdates.some((args) => args[4] === true));
    }
  });

  it("keeps complete free content and preserves the full routing ID in the pricing request", async () => {
    for (const price of [0, "0"]) {
      const result = await runCaller(price);
      const pricing = result.calls.find(({ action }) => action === RuntimeMessageActions.getModelPricing);
      assert.equal(pricing.modelId, "fixture/model:auto");
      const summary = result.calls.filter(({ action }) => action === RuntimeMessageActions.requestSummary);
      assert.equal(summary.length, 1);
      assert.equal(summary[0].selectedHtml, result.content);
      assert.equal(summary[0].model, pricing.modelId);
      assert.equal(summary[0].requestId, result.context.activeSummaryRequestId);
    }
  });

  it("preserves paid under-budget, truncate, and fail controls", async () => {
    const allowed = await runCaller(0.00001);
    assert.equal(allowed.calls.find(({ action }) => action === RuntimeMessageActions.requestSummary).selectedHtml, allowed.content);
    assert.equal(allowed.calls.find(({ action }) => action === RuntimeMessageActions.requestSummary).model, "fixture/model:auto");
    const truncated = await runCaller(0.001);
    const sent = truncated.calls.find(({ action }) => action === RuntimeMessageActions.requestSummary);
    assert.equal(sent.selectedHtml, truncated.content.substring(0, Math.floor(10 / constants.TOKENS_PER_CHAR)));
    assert.equal(sent.model, "fixture/model:auto");
    assert.match(truncated.errors.join(" "), /Truncating selection/);
    const failed = await runCaller(0.001, { maxPriceBehavior: "fail" });
    assert.equal(failed.calls.filter(({ action }) => action === RuntimeMessageActions.requestSummary).length, 0);
    assert.match(failed.errors.join(" "), /exceeds max price/);
  });

  it("keeps the captured free model after a default change and uses the new default for the next action", async () => {
    const settings = { summaryModelId: "fixture/a:free" };
    const result = await runCaller(0, settings, { onPricing: () => { settings.summaryModelId = "fixture/b"; } });
    const first = result.calls.find(({ action }) => action === RuntimeMessageActions.requestSummary);
    assert.equal(first.model, "fixture/a:free");
    assert.equal(first.requestId, result.context.activeSummaryRequestId);
    await result.context.validateAndSendToLLM(result.content);
    await new Promise((resolve) => setImmediate(resolve));
    const summaries = result.calls.filter(({ action }) => action === RuntimeMessageActions.requestSummary);
    assert.equal(summaries.length, 2);
    assert.equal(summaries[1].model, "fixture/b");
    assert.notEqual(summaries[0].requestId, summaries[1].requestId);
  });

  it("ignores late results while the active result keeps popup actions usable", async () => {
    const result = await runCaller(0, { summaryModelId: "fixture/a:free" });
    const first = result.calls.find(({ action }) => action === RuntimeMessageActions.requestSummary);
    await result.context.validateAndSendToLLM(result.content);
    await new Promise((resolve) => setImmediate(resolve));
    const second = result.calls.filter(({ action }) => action === RuntimeMessageActions.requestSummary)[1];
    result.context.displaySummary({ requestId: second.requestId, model: "fixture/a:free", summary: "<p>Current summary.</p>" });
    const updateCount = result.popupUpdates.length;
    result.context.displaySummary({ requestId: first.requestId, model: "fixture/old", summary: "<p>Late summary.</p>" });
    result.context.displaySummary({ requestId: first.requestId, error: "Late error" });
    assert.equal(result.context.lastSummary, "<p>Current summary.</p>");
    assert.equal(result.context.lastModelUsed, "fixture/a:free");
    assert.equal(result.popupUpdates.length, updateCount);
    assert.equal(result.buttonsEnabled.at(-1), true);
    assert.equal(result.errors.length, 0);
  });

  it("keeps request errors on the existing cleanup path and permits the next action", async () => {
    const result = await runCaller(0, {}, { summaryResponse: { status: "error", message: "Requested model is no longer configured." } });
    assert.equal(result.context.activeSummaryRequestId, null);
    assert.equal(result.context.lastSummary, "");
    assert.deepEqual(result.cleanupCalls, ["icon", "highlight"]);
    assert.match(result.errors.join(" "), /no longer configured/);
    assert.ok(result.popupUpdates.some((args) => args[4] === true));
    await result.context.validateAndSendToLLM(result.content);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.calls.filter(({ action }) => action === RuntimeMessageActions.requestSummary).length, 2);
    assert.equal(result.context.activeSummaryRequestId, null);
  });
});
