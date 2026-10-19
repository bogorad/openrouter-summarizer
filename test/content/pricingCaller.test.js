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

// Uses complete production functions; only DOM rendering and background replies are mocked.
const runCaller = async (pricePerToken, settings = {}) => {
  const chromeMock = installChromeMock();
  chromeMock.runtime.onMessage.addListener((request, sender, respond) => {
    if (request.action === RuntimeMessageActions.getSettings) {
      respond({ summaryModelId: "fixture/model:auto", maxRequestPrice: 0.01, ...settings });
    } else if (request.action === RuntimeMessageActions.getModelPricing) {
      respond({ status: "success", pricePerToken });
    } else if (request.action === RuntimeMessageActions.requestSummary) {
      respond({ status: "processing" });
    }
  });
  const window = domino.createWindow("<html><head><title>Pricing fixture</title></head><body></body></html>", "https://reader.example/article");
  const document = window.document;
  const errors = [];
  const popupUpdates = [];
  const noop = () => {};
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
    console,
    showError: (message) => errors.push(message),
    SummaryPopup: { showPopup: async () => {}, enableButtons: noop, updatePopupContent: (...args) => popupUpdates.push(args) },
    FloatingIcon: { removeFloatingIcon: noop },
    Highlighter: { removeSelectionHighlight: noop },
    ErrorHandler: { handle: (error) => errors.push(error.message) },
    ErrorSeverity: { WARNING: "warning" },
    handlePopupChat: noop,
    handlePopupClose: noop,
    handlePopupOptions: noop,
    handlePopupNewsblur: noop,
    isActiveSummaryRequest: (id) => context.activeSummaryRequestId === id,
    logStaleSummaryRequest: noop,
    clearSummaryState: () => { context.activeSummaryRequestId = null; },
  };
  runInNewContext(callerSource, context, { filename: "pageInteraction.js" });
  const content = "a".repeat(100);
  await context.validateAndSendToLLM(content);
  await new Promise((resolve) => setImmediate(resolve));
  return { content, errors, popupUpdates, calls: chromeMock.__mock.calls.runtimeSendMessage };
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
    }
  });

  it("preserves paid under-budget, truncate, and fail controls", async () => {
    const allowed = await runCaller(0.00001);
    assert.equal(allowed.calls.find(({ action }) => action === RuntimeMessageActions.requestSummary).selectedHtml, allowed.content);
    const truncated = await runCaller(0.001);
    const sent = truncated.calls.find(({ action }) => action === RuntimeMessageActions.requestSummary);
    assert.equal(sent.selectedHtml, truncated.content.substring(0, Math.floor(10 / constants.TOKENS_PER_CHAR)));
    assert.match(truncated.errors.join(" "), /Truncating selection/);
    const failed = await runCaller(0.001, { maxPriceBehavior: "fail" });
    assert.equal(failed.calls.filter(({ action }) => action === RuntimeMessageActions.requestSummary).length, 0);
    assert.match(failed.errors.join(" "), /exceeds max price/);
  });
});
