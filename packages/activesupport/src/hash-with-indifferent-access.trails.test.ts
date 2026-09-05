/**
 * trails-only covers for `HashWithIndifferentAccess`'s two inherited seats:
 * `rb_obj_dig`'s Array and `no_dig_method` arms (`vendor/ruby/object.c:3906`,
 * `:3897-3900`), which Rails' own suite only reaches through nested hashes,
 * and `rb_hash_default_value`'s yield of the RECEIVER
 * (`vendor/ruby/hash.c:2068`), which subclassing `Hash` is what buys.
 */
import { describe, it, expect } from "vitest";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import { Hash } from "@blazetrails/ruby-compat";

describe("HashWithIndifferentAccess", () => {
  it("dig with array", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: [1, { b: 2 }] });
    expect(h.dig("a", 0)).toBe(1);
    expect(h.dig("a", 1, "b")).toBe(2);
    expect(h.dig("a", -1, ":b")).toBe(2);
    expect(h.dig("a", 5)).toBeUndefined();
  });

  it("dig with array rejects a non-Integer index", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: [1, { b: 2 }] });
    expect(() => h.dig("a", "0")).toThrow("no implicit conversion of String into Integer");
  });

  it("dig raises TypeError for non-diggable intermediate", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(() => h.dig("a", "b")).toThrow("Integer does not have #dig method");
  });

  it("default proc is yielded the hash itself", () => {
    const hash = new HashWithIndifferentAccess<unknown>();
    hash.setDefaultProc((h, k) => {
      expect(h).toBe(hash);
      return k;
    });
    expect(hash.get(":missing")).toBe("missing");
  });

  it("has converts the key like key?", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.has(":a")).toBe(true);
    expect(h.has("a")).toBe(true);
    expect(h.has(":b")).toBe(false);
  });

  it("symbolize keys keeps the seat to_hash gave the copy", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    h.setDefault(0);
    expect(h.symbolizeKeys().default()).toBe(0);
    expect(h.deepSymbolizeKeys().default()).toBe(0);
  });
  it("to_h does not convert nested values the way to_hash does", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: { b: 1 } });
    h.setDefault(0);
    const toH = h.toH();
    expect(toH).toBeInstanceOf(Hash);
    expect(toH).not.toBeInstanceOf(HashWithIndifferentAccess);
    expect(toH.get("a")).toBeInstanceOf(HashWithIndifferentAccess);
    expect(toH.default()).toBe(0);
    expect(h.toHash().get("a")).not.toBeInstanceOf(HashWithIndifferentAccess);
  });
});
