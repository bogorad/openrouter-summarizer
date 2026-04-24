import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_PROCESS_SELECTION,
  ACTION_SUMMARY_RESULT,
} from "../../js/messaging/actions.js";
import {
  createContentScriptMessageListener,
  dispatchContentScriptMessage,
} from "../../js/messaging/contentRouter.js";

test("dispatches content-script actions through a handler map", async () => {
  const sender = { tab: { id: 12 } };
  const handlers = {
    [ACTION_PROCESS_SELECTION]: (request, actualSender) => {
      assert.equal(request.action, ACTION_PROCESS_SELECTION);
      assert.equal(actualSender, sender);
      return { status: "processing" };
    },
    [ACTION_SUMMARY_RESULT]: () => ({ status: "success" }),
  };

  assert.deepEqual(
    await dispatchContentScriptMessage(
      { action: ACTION_PROCESS_SELECTION },
      sender,
      handlers,
    ),
    { status: "processing" },
  );
  assert.deepEqual(
    await dispatchContentScriptMessage({ action: ACTION_SUMMARY_RESULT }, sender, handlers),
    { status: "success" },
  );
});

test("normalizes unknown, missing-handler, and thrown errors", async () => {
  assert.deepEqual(
    await dispatchContentScriptMessage({ action: "missingAction" }, {}, {}),
    {
      status: "error",
      message: "Unknown content-script action.",
      action: "missingAction",
    },
  );
  assert.deepEqual(
    await dispatchContentScriptMessage({ action: ACTION_PROCESS_SELECTION }, {}, {}),
    {
      status: "error",
      message: "No content-script handler registered for action.",
      action: ACTION_PROCESS_SELECTION,
    },
  );
  assert.deepEqual(
    await dispatchContentScriptMessage(
      { action: ACTION_PROCESS_SELECTION },
      {},
      {
        [ACTION_PROCESS_SELECTION]: () => {
          throw new Error("Selection failed.");
        },
      },
    ),
    {
      status: "error",
      message: "Selection failed.",
      action: ACTION_PROCESS_SELECTION,
    },
  );
});

test("runtime listener keeps the channel open and sends async responses", async () => {
  const listener = createContentScriptMessageListener({
    handlers: {
      [ACTION_PROCESS_SELECTION]: async () => ({ status: "processing" }),
    },
  });

  const response = await new Promise((resolve) => {
    const isAsync = listener(
      { action: ACTION_PROCESS_SELECTION },
      {},
      resolve,
    );

    assert.equal(isAsync, true);
  });

  assert.deepEqual(response, { status: "processing" });
});
