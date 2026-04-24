import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_ABORT_CHAT_REQUEST,
  ACTION_GET_SETTINGS,
  ACTION_PROCESS_SELECTION,
  ACTION_REQUEST_SUMMARY,
  ACTION_SUMMARY_RESULT,
  CONTENT_SCRIPT_INCOMING_ACTIONS,
  ContentScriptIncomingActionSet,
  ContentScriptIncomingActions,
  MESSAGE_ACTIONS,
  MessageActionSet,
  MessageContractCatalog,
  RUNTIME_MESSAGE_ACTIONS,
  RuntimeMessageActions,
  RuntimeMessageActionSet,
  TAB_MESSAGE_ACTIONS,
  TabMessageActions,
  TabMessageActionSet,
} from "../../js/messaging/actions.js";

test("catalogs known runtime and tab message actions", () => {
  assert.equal(RuntimeMessageActions.getSettings, ACTION_GET_SETTINGS);
  assert.equal(RuntimeMessageActions.requestSummary, ACTION_REQUEST_SUMMARY);
  assert.equal(RuntimeMessageActions.abortChatRequest, ACTION_ABORT_CHAT_REQUEST);
  assert.equal(TabMessageActions.processSelection, ACTION_PROCESS_SELECTION);
  assert.equal(TabMessageActions.summaryResult, ACTION_SUMMARY_RESULT);
  assert.equal(ContentScriptIncomingActions.processSelection, ACTION_PROCESS_SELECTION);
  assert.equal(ContentScriptIncomingActions.summaryResult, ACTION_SUMMARY_RESULT);

  assert.ok(RuntimeMessageActionSet.has(ACTION_GET_SETTINGS));
  assert.ok(RuntimeMessageActionSet.has(ACTION_ABORT_CHAT_REQUEST));
  assert.ok(TabMessageActionSet.has(ACTION_SUMMARY_RESULT));
  assert.ok(ContentScriptIncomingActionSet.has(ACTION_PROCESS_SELECTION));
  assert.ok(MessageActionSet.has(ACTION_REQUEST_SUMMARY));

  assert.deepEqual(CONTENT_SCRIPT_INCOMING_ACTIONS, TAB_MESSAGE_ACTIONS);
  assert.equal(MESSAGE_ACTIONS.length, RUNTIME_MESSAGE_ACTIONS.length + TAB_MESSAGE_ACTIONS.length);
  assert.equal(new Set(MESSAGE_ACTIONS).size, MESSAGE_ACTIONS.length);
});

test("keeps runtime and tab action contracts in the catalog", () => {
  assert.equal(MessageContractCatalog[ACTION_GET_SETTINGS].direction, "runtime");
  assert.equal(MessageContractCatalog[ACTION_REQUEST_SUMMARY].direction, "runtime");
  assert.equal(MessageContractCatalog[ACTION_SUMMARY_RESULT].direction, "tab");
  assert.equal(MessageContractCatalog[ACTION_PROCESS_SELECTION].direction, "tab");

  for (const action of MESSAGE_ACTIONS) {
    assert.ok(MessageContractCatalog[action], `${action} is missing a contract`);
    assert.equal(typeof MessageContractCatalog[action].payload, "string");
    assert.equal(typeof MessageContractCatalog[action].response, "string");
  }
});
