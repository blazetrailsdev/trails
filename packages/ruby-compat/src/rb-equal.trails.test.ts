import { describe, it, expect } from "vitest";
import { rbEql, rbEqq, rbEqual } from "./rb-equal.js";
import { Range } from "./range.js";
import { stringSuperclass } from "./string/method-table.js";

describe("rbEqual over the values a Ruby binary String stands in for", () => {
  it("compares Uint8Array byte strings by value", () => {
    expect(rbEqual(new Uint8Array([0x80, 0xde]), new Uint8Array([0x80, 0xde]))).toBe(true);
    expect(rbEqual(new Uint8Array([0x80, 0xde]), new Uint8Array([0x80, 0x01]))).toBe(false);
    expect(rbEqual(new Uint8Array([0x80]), new Uint8Array([0x80, 0xde]))).toBe(false);
    expect(rbEqual(new Uint8Array([]), new Uint8Array([]))).toBe(true);
    expect(rbEqual(new Uint8Array([0x80]), "")).toBe(false);
  });

  it("answers false for a byte string against a non-String, and asks a to_str responder", () => {
    class Bytes extends Uint8Array {
      equals(): boolean {
        throw new Error("not a byte string");
      }
    }
    const bytes = Bytes.from([0x62, 0x6f]);
    expect(rbEqual(bytes, { other: true })).toBe(false);
    expect(rbEqual(bytes, 5)).toBe(false);
    expect(rbEqual(bytes, new Uint8Array([0x62, 0x6f]))).toBe(true);
    const data = { toStr: () => bytes, equals: (other: unknown) => other === bytes };
    expect(rbEqual(bytes, data)).toBe(true);
    expect(rbEql(bytes, data)).toBe(false);
  });

  it("compares a String with a binary String only where both are 7-bit", () => {
    expect(rbEqual("1", new Uint8Array([0x31]))).toBe(true);
    expect(rbEqual(new Uint8Array([0x31]), "1")).toBe(true);
    expect(rbEqual("", new Uint8Array([]))).toBe(true);
    expect(rbEqual("12", new Uint8Array([0x31]))).toBe(false);
    expect(rbEqual("ƒée", new TextEncoder().encode("ƒée"))).toBe(false);
    expect(rbEqual("\u00c6", new Uint8Array([0xc6]))).toBe(false);
    expect(rbEql(new Uint8Array([0x31]), "1")).toBe(true);
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

describe("rbEql is rb_equal without the `==` arm", () => {
  class OnlyEquals {
    equals(): boolean {
      return true;
    }
  }

  it("answers identity for a class that defines == and no eql?", () => {
    expect(rbEqual(new OnlyEquals(), new OnlyEquals())).toBe(true);
    expect(rbEql(new OnlyEquals(), new OnlyEquals())).toBe(false);
  });

  it("shares every value-class arm with rb_equal", () => {
    expect(rbEql([1n, { a: [2] }], [1, new Map([["a", [2]]])])).toBe(true);
    expect(rbEql("x", "x")).toBe(true);
    expect(rbEql([1], [2])).toBe(false);
  });

  it("finds a Hash key by eql?, never by the key's ==", () => {
    const key = new OnlyEquals();
    expect(rbEqual(new Map([[key, 1]]), new Map([[key, 1]]))).toBe(true);
    expect(rbEqual(new Map([[key, 1]]), new Map([[new OnlyEquals(), 1]]))).toBe(false);
  });
});

describe("rbEqual between a String and a String subclass", () => {
  class Literal extends stringSuperclass("eql", "hash") {}

  it("compares contents in either order, as rb_str_equal does for two T_STRINGs", () => {
    expect(rbEqual("a", new Literal("a"))).toBe(true);
    expect(rbEqual(new Literal("a"), "a")).toBe(true);
    expect(rbEql("a", new Literal("a"))).toBe(true);
    expect(rbEqual("a", new Literal("b"))).toBe(false);
    expect(rbEqual(["a"], [new Literal("a")])).toBe(true);
    expect(rbEqual("a", { toString: () => "a" })).toBe(false);
  });
});

describe("rbEqq, the === send", () => {
  it("dispatches to Range, Regexp, Set, Module, Proc and Kernel#===", () => {
    expect(rbEqq(new Range(1, 5), 3)).toBe(true);
    expect(rbEqq(new Range(1, 5), 6)).toBe(false);
    expect(rbEqq(/b/, "abc")).toBe(true);
    expect(rbEqq(/b/, 1)).toBe(false);
    expect(rbEqq(new Set([1, 2]), 2)).toBe(true);
    expect(rbEqq(Number, 3)).toBe(true);
    expect(rbEqq(Array, 3)).toBe(false);
    expect(rbEqq((x: unknown) => x === 2, 2)).toBe(true);
    expect(rbEqq((x: unknown) => (x === 2 ? 0 : null), 3)).toBe(false);
    expect(rbEqq((x: unknown) => (x === 2 ? 0 : null), 2)).toBe(true);
    expect(rbEqq([1, 2], [1, 2])).toBe(true);
    expect(
      rbEqq(function (x: unknown) {
        return x === 2;
      }, 2),
    ).toBe(true);
    class Point {}
    expect(rbEqq(Point, new Point())).toBe(true);
  });
});
