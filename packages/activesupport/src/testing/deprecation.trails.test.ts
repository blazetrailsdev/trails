import { describe, expect, it } from "vitest";
import { Deprecation } from "../deprecation.js";
import { assertDeprecated } from "./deprecation.js";

describe("assertDeprecated", () => {
  it("takes the block after a lone deprecator, as assert_deprecated(deprecator) { }", async () => {
    const deprecator = new Deprecation("1.0", "Trails");
    let ran = false;
    const result = await assertDeprecated(deprecator, () => {
      ran = true;
      deprecator.warn("foo is deprecated");
      return 42;
    });
    expect(ran).toBe(true);
    expect(result).toBe(42);
  });

  it("keeps the (match, deprecator, block) order for the three-argument form", async () => {
    const deprecator = new Deprecation("1.0", "Trails");
    const result = await assertDeprecated(/foo/, deprecator, () => {
      deprecator.warn("foo is deprecated");
      return "ok";
    });
    expect(result).toBe("ok");
  });
});
