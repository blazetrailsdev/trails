/**
 * trails-only: `define_model_callbacks` dispatches its generators with
 * `send("_define_#{type}_model_callback", self, callback)` (callbacks.rb:124-126),
 * so an `only:` entry with no matching generated method raises `NoMethodError`.
 * TypeScript has no `send`, and the failure mode of the map that stands in for
 * it has to be pinned rather than assumed.
 */
import { describe, it, expect } from "vitest";
import { extend } from "@blazetrails/activesupport";
import { Model } from "./index.js";
import { Callbacks } from "./callbacks.js";
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

/**
 * trails-only: `ActiveModel::Callbacks.extended` (callbacks.rb:66-70) does
 * `base.class_eval { include ActiveSupport::Callbacks }`, so a bare class that
 * extends the module gets the chain engine from the module and never from its
 * own body. Ruby fires `self.extended` for free; trails routes it through the
 * `extended` symbol hook, which has to be pinned.
 */
describe("Callbacks.extended", () => {
  it("installs ActiveSupport::Callbacks on the extending class", () => {
    class Topic {}
    extend(Topic, Callbacks);

    const topic = Topic as unknown as {
      defineModelCallbacks(...a: unknown[]): void;
      beforeSave(fn: () => void): void;
      setCallback: unknown;
      prototype: { runCallbacks: unknown };
    };
    expect(typeof topic.setCallback).toBe("function");
    expect(typeof topic.prototype.runCallbacks).toBe("function");

    const order: string[] = [];
    topic.defineModelCallbacks("save");
    topic.beforeSave(() => order.push("before"));

    const record = new Topic() as unknown as {
      runCallbacks(event: string, fn: () => void): void;
    };
    record.runCallbacks("save", () => order.push("body"));
    expect(order).toEqual(["before", "body"]);
  });
});
