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

  it("Hash#as_json writes __proto__ as an entry, not as the result's prototype", () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "legit": 1}') as object;
    const out = asJson(hostile) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(out.legit).toBe(1);
  });
});
