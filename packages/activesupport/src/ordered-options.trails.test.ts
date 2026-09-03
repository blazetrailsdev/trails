/**
 * trails-only covers for `OrderedOptions#dig`'s inherited `rb_obj_dig` seats
 * (`vendor/ruby/object.c:3906`) — the object-that-answers-`dig` arm and
 * `no_dig_method`'s TypeError (`:3897-3900`) — which the gem's own suite
 * reaches only through nested Hashes.
 */
import { describe, it, expect } from "vitest";
import { OrderedOptions } from "./ordered-options.js";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";

describe("OrderedOptions", () => {
  it("dig hands the remaining identifiers to an object that answers dig", () => {
    const a = new OrderedOptions();
    a.set("testKey", new HashWithIndifferentAccess<unknown>({ a: { b: 1 } }));
    expect(a.dig("testKey", ":a", "b")).toBe(1);
  });

  it("dig raises TypeError for a non-diggable intermediate", () => {
    const a = new OrderedOptions();
    a.set("testKey", 56);
    expect(() => a.dig("testKey", "a")).toThrow("Integer does not have #dig method");
  });

  it("dig raises TypeError for a non-Integer Array index", () => {
    const a = new OrderedOptions();
    a.set("testKey", [{ a: 1 }]);
    expect(() => a.dig("testKey", "0")).toThrow("no implicit conversion of String into Integer");
  });

  it("dig indexes a Map intermediate through rb_hash_aref", () => {
    const a = new OrderedOptions();
    a.set("testKey", new Map([["a", 1]]));
    expect(a.dig("testKey", "a")).toBe(1);
  });
});
