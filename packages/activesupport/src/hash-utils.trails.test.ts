import { describe, expect, it } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { transformKeys } from "./hash-utils.js";

describe("transformKeys on a plain object", () => {
  it("answers a Hash keyed by the objects the block yields", () => {
    const a = { name: "a" };
    const b = { name: "b" };
    const keys: Record<string, object> = { x: a, y: b };
    const result = transformKeys({ x: 1, y: 2 }, (k) => keys[k]);
    expect(result).toBeInstanceOf(Hash);
    expect(result.get(a)).toBe(1);
    expect(result.get(b)).toBe(2);
  });

  it("keeps string keys yielded before the first object key", () => {
    const a = { name: "a" };
    const result = transformKeys({ x: 1, y: 2 }, (k) => (k === "x" ? "x" : a)) as Hash<
      unknown,
      unknown
    >;
    expect([...result.keys()]).toEqual(["x", a]);
  });

  it("answers a plain object when the block yields strings", () => {
    expect(transformKeys({ x: 1 }, (k) => k.toUpperCase())).toEqual({ X: 1 });
  });
});
