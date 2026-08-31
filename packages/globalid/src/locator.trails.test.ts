import { describe, expect, it } from "vitest";
import { Locator } from "./locator.js";

// Rails' `Locator.use` guard (vendor/globalid/lib/global_id/locator.rb:131) has
// no dedicated upstream test; Ruby's `locator || block_given?` is the single
// optional parameter's presence in trails.
describe("Locator (trails)", () => {
  it("use without a locator or a block raises", () => {
    expect(() => Locator.use("app")).toThrow(
      "No locator provided. Pass a block or an object that responds to #locate.",
    );
  });
});
