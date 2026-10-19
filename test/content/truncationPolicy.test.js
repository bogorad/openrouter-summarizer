/** Input-cost policy regressions for unavailable, free, and paid prices. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCostTruncationPolicy, TRUNCATION_DECISIONS } from "../../js/content/truncationPolicy.js";

const content = "a".repeat(100);
const policyInput = { content, maxRequestPrice: 0.01, tokenEstimatePolicy: { tokensPerChar: 1 } };

describe("input-cost price boundary", () => {
  it("rejects unavailable input prices", () => {
    for (const pricePerToken of [undefined, null, "", " ", false, true, [], {}, "bad", "0.1usd", NaN, Infinity, -Infinity, -1, "-1"]) {
      const result = applyCostTruncationPolicy({ ...policyInput, pricePerToken });
      assert.equal(result.decision, TRUNCATION_DECISIONS.REJECT, String(pricePerToken));
      assert.match(result.error, /explicitly priced/i);
    }
  });

  it("keeps whole content for numeric and string zero", () => {
    for (const pricePerToken of [0, "0"]) {
      const result = applyCostTruncationPolicy({ ...policyInput, pricePerToken });
      assert.equal(result.decision, TRUNCATION_DECISIONS.ALLOW);
      assert.equal(result.content, content);
      assert.equal(result.estimatedCost, 0);
    }
  });

  it("allows paid content under budget and preserves paid truncate/fail behavior", () => {
    assert.equal(applyCostTruncationPolicy({ ...policyInput, pricePerToken: "0.00001" }).decision, TRUNCATION_DECISIONS.ALLOW);
    const truncated = applyCostTruncationPolicy({ ...policyInput, pricePerToken: 0.001 });
    assert.equal(truncated.decision, TRUNCATION_DECISIONS.TRUNCATE);
    assert.equal(truncated.content, content.substring(0, 10));
    const failed = applyCostTruncationPolicy({ ...policyInput, pricePerToken: 0.001, maxPriceBehavior: "fail" });
    assert.equal(failed.decision, TRUNCATION_DECISIONS.REJECT);
    assert.match(failed.error, /exceeds max price/);
  });
});
