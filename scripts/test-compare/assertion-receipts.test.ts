import { describe, expect, it } from "vitest";
import {
  ASSERTION_RECEIPTS,
  applyAssertionReceipts,
  assertionReceiptKey,
  unconsumedAssertionReceipts,
  type AssertionReceipt,
} from "./assertion-receipts.js";

const tc = {
  description: "overloaded properties save",
  ancestors: ["CustomPropertiesTest"],
  assertionCount: 4,
  assertionKinds: ["assert_equal", "assert_kind_of", "assert_equal", "assert_kind_of"],
  assertionValues: ["n:2", null, "n:2.0", null],
};

const receipts: Record<string, AssertionReceipt[]> = {
  "activerecord:attributes_test.rb › CustomPropertiesTest › overloaded properties save": [
    { kind: "assert_kind_of", value: null, as: "assert_equal", reason: "Integer" },
    { kind: "assert_kind_of", value: null, as: null, reason: "Float" },
  ],
};

describe("applyAssertionReceipts", () => {
  it("re-scores one assertion and drops another, keeping values in lockstep", () => {
    const consumed = new Set<string>();
    const out = applyAssertionReceipts(
      "activerecord",
      "attributes_test.rb",
      tc,
      receipts,
      consumed,
    );
    expect(out.assertionCount).toBe(3);
    expect(out.assertionKinds).toEqual(["assert_equal", "assert_equal", "assert_equal"]);
    expect(out.assertionValues).toEqual(["n:2", null, "n:2.0"]);
    expect(unconsumedAssertionReceipts(consumed, receipts)).toEqual([]);
  });

  it("matches on the expected value, so a literal-valued assertion is never consumed", () => {
    const only = { ...tc, assertionKinds: ["assert_equal"], assertionValues: ["n:2"] };
    const rows = {
      [assertionReceiptKey("activerecord", "attributes_test.rb", only)]: [
        { kind: "assert_equal", value: null, as: null, reason: "" },
      ],
    };
    const consumed = new Set<string>();
    const out = applyAssertionReceipts("activerecord", "attributes_test.rb", only, rows, consumed);
    expect(out.assertionKinds).toEqual(["assert_equal"]);
    expect(unconsumedAssertionReceipts(consumed, rows)).toHaveLength(1);
  });

  it("leaves a test with no receipt untouched", () => {
    expect(applyAssertionReceipts("activerecord", "other_test.rb", tc, receipts)).toBe(tc);
  });

  it("gives every committed receipt a reason", () => {
    for (const rows of Object.values(ASSERTION_RECEIPTS)) {
      for (const row of rows) expect(row.reason.length).toBeGreaterThan(0);
    }
  });
});
