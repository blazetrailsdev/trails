import { describe, expect, it } from "vitest";
import { assertDifference, assertNoDifference } from "../../lib/testing/assertions.js";

describe("assertNoDifference with the block in the message slot", () => {
  it("runs the block", async () => {
    const count = 0;
    let ran = false;
    await assertNoDifference(
      () => count,
      () => {
        ran = true;
      },
    );
    expect(ran).toBe(true);
  });

  it("fails when the block changes the expression", async () => {
    let count = 0;
    await expect(
      assertNoDifference(
        () => count,
        () => {
          count += 1;
        },
      ),
    ).rejects.toThrow();
  });

  it("assertDifference accepts (expression, difference, block)", async () => {
    let count = 0;
    await assertDifference(
      () => count,
      2,
      () => {
        count += 2;
      },
    );
  });
});
