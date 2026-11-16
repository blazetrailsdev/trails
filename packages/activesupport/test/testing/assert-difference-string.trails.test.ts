import { describe, expect, it } from "vitest";
import { assertChanges, assertDifference, assertNoChanges } from "../../lib/testing/assertions.js";

const host = globalThis as { assertDifferenceNum?: number };

describe("assertDifference with a String expression", () => {
  it("evaluates the string before and after the block", async () => {
    host.assertDifferenceNum = 0;
    await assertDifference("assertDifferenceNum", 2, () => {
      host.assertDifferenceNum! += 2;
    });
    delete host.assertDifferenceNum;
  });

  it("names the string in the failure message", async () => {
    host.assertDifferenceNum = 0;
    await expect(assertDifference("assertDifferenceNum + 1", 1, () => {})).rejects.toThrow(
      "`assertDifferenceNum + 1` didn't change by 1, but by 0",
    );
    delete host.assertDifferenceNum;
  });

  it("assertChanges and assertNoChanges evaluate a String expression", async () => {
    host.assertDifferenceNum = 0;
    await assertChanges("assertDifferenceNum", null, { from: 0, to: 1 }, () => {
      host.assertDifferenceNum = 1;
    });
    await expect(
      assertNoChanges("assertDifferenceNum", null, {}, () => {
        host.assertDifferenceNum = 2;
      }),
    ).rejects.toThrow("`assertDifferenceNum` changed");
    delete host.assertDifferenceNum;
  });
});
