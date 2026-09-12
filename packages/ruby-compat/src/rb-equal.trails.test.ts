import { describe, it, expect } from "vitest";
import { rbEqual } from "./rb-equal.js";

describe("rbEqual over the values a Ruby binary String stands in for", () => {
  it("compares Uint8Array byte strings by value", () => {
    expect(rbEqual(new Uint8Array([0x80, 0xde]), new Uint8Array([0x80, 0xde]))).toBe(true);
    expect(rbEqual(new Uint8Array([0x80, 0xde]), new Uint8Array([0x80, 0x01]))).toBe(false);
    expect(rbEqual(new Uint8Array([0x80]), new Uint8Array([0x80, 0xde]))).toBe(false);
    expect(rbEqual(new Uint8Array([]), new Uint8Array([]))).toBe(true);
    expect(rbEqual(new Uint8Array([0x80]), "")).toBe(false);
  });

  it("compares two Temporal values by class and instant, never by their own equals", () => {
    const at = (tag: string, value: number, widened?: unknown) => ({
      [Symbol.toStringTag]: tag,
      value,
      ...(widened === undefined ? {} : { toPlainDateTime: () => widened }),
      constructor: {
        compare: (l: { value: number }, r: { value: number }) =>
          l.value < r.value ? -1 : l.value > r.value ? 1 : 0,
      },
      equals() {
        throw new TypeError("year is required");
      },
    });

    expect(rbEqual(at("Temporal.PlainDate", 1), at("Temporal.PlainDate", 1))).toBe(true);
    expect(rbEqual(at("Temporal.PlainDate", 1), at("Temporal.PlainDate", 2))).toBe(false);
    expect(rbEqual(at("Temporal.PlainDate", 1), at("Temporal.Instant", 1))).toBe(false);
    expect(rbEqual(at("Temporal.PlainDate", 1), { value: 1 })).toBe(false);
  });
});

describe("rbEqual over the two JS seats of a Ruby Hash", () => {
  it("compares a Map against a plain object key for key", () => {
    expect(rbEqual(new Map([["a", 1]]), { a: 1 })).toBe(true);
    expect(rbEqual({ a: 1 }, new Map([["a", 1]]))).toBe(true);
    expect(rbEqual(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
    expect(rbEqual(new Map([["a", 1]]), { a: 1, b: 2 })).toBe(false);
    expect(rbEqual(new Map([[[1], "v"]]), new Map([[[1], "v"]]))).toBe(true);
  });

  it("recurses into nested values", () => {
    expect(rbEqual({ a: new Map([["b", [1n]]]) }, { a: { b: [1] } })).toBe(true);
  });

  it("compares the two JS seats of a Ruby Integer by value", () => {
    expect(rbEqual(1, 1n)).toBe(true);
    expect(rbEqual(1n, 1)).toBe(true);
    expect(rbEqual(2n, 1)).toBe(false);
    expect(rbEqual(1.5, 1n)).toBe(false);
    expect(rbEqual(1n, "1")).toBe(false);
  });
});
