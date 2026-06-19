import { describe, it, expect } from "vitest";
import { coder } from "./coder.js";

// Fidelity guarantees of the trails Marshal-equivalent serializer: the cases
// where plain JSON would lose or mangle a value. These are not Rails tests —
// they pin the type-round-trip property documented in coder.ts.
describe("cache coder fidelity", () => {
  function roundtrip(value: unknown): unknown {
    return coder.load(coder.dump(value));
  }

  it("preserves Date instances", () => {
    const date = new Date("2026-06-19T14:36:26.123Z");
    const result = roundtrip(date) as Date;
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(date.getTime());
  });

  it("preserves undefined distinct from null", () => {
    expect(roundtrip(undefined)).toBeUndefined();
    expect(roundtrip(null)).toBeNull();
    expect(roundtrip({ a: undefined, b: null })).toEqual({ a: undefined, b: null });
  });

  it("preserves undefined inside arrays without null-ifying", () => {
    const result = roundtrip([1, undefined, 3]) as unknown[];
    expect(result).toEqual([1, undefined, 3]);
  });

  it("preserves bigint values", () => {
    expect(roundtrip(9007199254740993n)).toBe(9007199254740993n);
  });

  it("preserves non-finite numbers", () => {
    expect(roundtrip(NaN)).toBeNaN();
    expect(roundtrip(Infinity)).toBe(Infinity);
    expect(roundtrip(-Infinity)).toBe(-Infinity);
  });

  it("round-trips nested mixed structures", () => {
    const value = {
      when: new Date(0),
      counts: [1n, 2n],
      ratio: NaN,
      missing: undefined,
      nested: { deep: [{ at: new Date("2020-01-01T00:00:00Z") }] },
    };
    expect(roundtrip(value)).toEqual(value);
  });

  it("escapes arrays whose head collides with a type tag", () => {
    // A genuine user array that happens to start with a sentinel-looking string
    // must not be mistaken for a Date/bigint/etc. tag.
    const value = ["~#d", 1750000000000];
    const result = roundtrip(value);
    expect(result).toEqual(value);
    expect(result).not.toBeInstanceOf(Date);
  });

  it("leaves objects carrying a tag-like key untouched", () => {
    // Tags are arrays, so objects never collide regardless of their keys.
    const value = { "~#d": "not really a date", value: 1 };
    expect(roundtrip(value)).toEqual(value);
  });

  it("leaves plain JSON-safe values untouched", () => {
    const value = { name: "test", count: 42, on: true, tags: ["a", "b"] };
    expect(roundtrip(value)).toEqual(value);
  });
});
