import { describe, expect, it } from "vitest";
import { Locator } from "./locator.js";

describe("Locator (trails)", () => {
  it("use without a locator or a block raises", () => {
    expect(() => Locator.use("app")).toThrow(
      "No locator provided. Pass a block or an object that responds to #locate.",
    );
  });
});
