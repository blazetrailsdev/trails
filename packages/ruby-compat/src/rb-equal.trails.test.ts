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
