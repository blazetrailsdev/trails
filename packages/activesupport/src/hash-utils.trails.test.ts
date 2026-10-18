import { describe, expect, it } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { reverseMerge, reverseMergeBang, transformKeys } from "./hash-utils.js";

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
    const result = transformKeys({ x: 1, y: 2 }, (k) => (k === "x" ? "x" : a) as object);
    expect([...result.keys()]).toEqual(["x", a]);
  });

  it("answers a plain object when the block yields strings", () => {
    expect(transformKeys({ x: 1 }, (k) => k.toUpperCase())).toEqual({ X: 1 });
  });
});

describe("reverseMerge on a Hash receiver", () => {
  it("answers other_hash.merge(self), the receiver's values winning", () => {
    const hash = new Hash<unknown, unknown>().set("a", 1).set("c", 3);
    const other = new Hash<unknown, unknown>().set("a", 0).set("b", 2);
    const result = reverseMerge(hash, other);
    expect(result).toBeInstanceOf(Hash);
    expect([...result]).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("reverseMergeBang keeps the receiver's keys", () => {
    const hash = new Hash<string, unknown>().set("onlyPath", true);
    reverseMergeBang(hash, { onlyPath: false, controller: "d" });
    expect(hash.get("onlyPath")).toBe(true);
    expect(hash.get("controller")).toBe("d");
  });
});
