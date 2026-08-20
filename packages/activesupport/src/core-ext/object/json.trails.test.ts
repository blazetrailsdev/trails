import { describe, expect, it } from "vitest";

import { asJson } from "./json.js";

// TS-only arms of `core_ext/object/json.rb`: the three places where Ruby's
// answer is not directly encodable by `JSON.stringify`.
describe("asJson (TypeScript-only arms)", () => {
  it("NilClass#as_json answers null for undefined as well as null", () => {
    // `JSON.stringify({ a: undefined })` drops the key entirely, which would
    // make an unset attribute vanish instead of encoding as Ruby's `nil`.
    expect(asJson(undefined)).toBe(null);
    expect(asJson(null)).toBe(null);
    expect(asJson({ name: "x", missing: undefined, nested: [undefined, 1] })).toEqual({
      name: "x",
      missing: null,
      nested: [null, 1],
    });
  });

  it("Numeric#as_json answers a bigint's decimal digits as a string", () => {
    // `JSON.stringify` throws on a BigInt, and a JS number loses precision
    // above 2^53-1, so the digits survive as a string.
    expect(asJson(99999999999999999999n)).toBe("99999999999999999999");
    expect(asJson({ id: 12n })).toEqual({ id: "12" });
    expect(JSON.stringify(asJson({ id: 12n }))).toBe('{"id":"12"}');
  });

  it("Hash#as_json and Array#as_json answer null for a true cycle", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const out = asJson(a) as { name: string; self: unknown };
    expect(out.name).toBe("a");
    expect(out.self).toBe(null);
    expect(() => JSON.stringify(out)).not.toThrow();

    const arr: unknown[] = [1, 2];
    arr.push(arr);
    expect(asJson(arr)).toEqual([1, 2, null]);
  });

  it("a repeated reference is not a cycle and answers the same result", () => {
    const shared = { kind: "tag", count: 5 };
    const out = asJson({ a: shared, b: shared }) as { a: unknown; b: unknown };
    expect(out.a).toEqual({ kind: "tag", count: 5 });
    expect(out.a).toBe(out.b);
  });

  it("cycle state does not leak between top-level calls", () => {
    const shared = { kind: "tag" };
    const first = asJson({ a: shared }) as { a: unknown };
    const second = asJson({ a: shared }) as { a: unknown };
    expect(first.a).toEqual({ kind: "tag" });
    expect(second.a).toEqual({ kind: "tag" });
    expect(second.a).not.toBe(first.a);
  });

  it("Hash#as_json writes __proto__ as an entry, not as the result's prototype", () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "legit": 1}') as object;
    const out = asJson(hostile) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(out.legit).toBe(1);
  });
});
