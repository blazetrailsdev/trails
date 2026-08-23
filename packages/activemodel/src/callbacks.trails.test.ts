/**
 * trails-only: `define_model_callbacks` dispatches its generators with
 * `send("_define_#{type}_model_callback", self, callback)` (callbacks.rb:124-126),
 * so an `only:` entry with no matching generated method raises `NoMethodError`.
 * TypeScript has no `send`, and the failure mode of the map that stands in for
 * it has to be pinned rather than assumed.
 */
import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { NoMethodError } from "./attribute-assignment.js";

describe("defineModelCallbacks", () => {
  it("raises NoMethodError for an only: entry with no generator", () => {
    class Topic extends Model {}

    expect(() =>
      (Topic as unknown as { defineModelCallbacks(...a: unknown[]): void }).defineModelCallbacks(
        "create",
        { only: ["bogus"] },
      ),
    ).toThrow(NoMethodError);
  });
});
