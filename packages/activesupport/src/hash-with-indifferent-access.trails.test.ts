/**
 * trails-only covers for `HashWithIndifferentAccess`'s two inherited seats:
 * `rb_obj_dig`'s Array and `no_dig_method` arms (`vendor/ruby/object.c:3906`,
 * `:3897-3900`), which Rails' own suite only reaches through nested hashes,
 * and `rb_hash_default_value`'s yield of the RECEIVER
 * (`vendor/ruby/hash.c:2068`), which subclassing `Hash` is what buys.
 */
import { describe, it, expect } from "vitest";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";

describe("HashWithIndifferentAccess", () => {
  it("dig with array", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: [1, { b: 2 }] });
    expect(h.dig("a", 0)).toBe(1);
    expect(h.dig("a", 1, "b")).toBe(2);
    expect(h.dig("a", -1, ":b")).toBe(2);
    expect(h.dig("a", 5)).toBeUndefined();
  });

  it("dig raises TypeError for non-diggable intermediate", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(() => h.dig("a", "b")).toThrow("Number does not have #dig method");
  });

  it("default proc is yielded the hash itself", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.setDefaultProc((h, k) => {
      expect(h).toBe(hash);
      return k;
    });
    expect(hash.get(":missing")).toBe("missing");
  });
});
