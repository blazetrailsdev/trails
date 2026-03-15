import { describe, expect, it } from "vitest";
import { wrap } from "../../index.js";

describe("WrapTest", () => {
  it("array", () => {
    const arr = [1, 2, 3];
    expect(wrap(arr)).toBe(arr);
  });

  it("nil", () => {
    expect(wrap(null)).toEqual([]);
  });

  it("object", () => {
    expect(wrap(42)).toEqual([42]);
  });

  it("string", () => {
    expect(wrap("hello")).toEqual(["hello"]);
  });

  it("string with newline", () => {
    expect(wrap("hello\nworld")).toEqual(["hello\nworld"]);
  });

  it("object with to ary", () => {
    // Objects that are arrays pass through
    const arr = [1, 2];
    expect(wrap(arr)).toBe(arr);
  });

  it("proxy object", () => {
    // A regular object gets wrapped
    const obj = { x: 1 };
    expect(wrap(obj as any)).toEqual([obj]);
  });

  it("proxy to object with to ary", () => {
    const arr = [1, 2, 3];
    expect(wrap(arr)).toBe(arr);
  });

  it("struct", () => {
    // Non-array object gets wrapped
    const struct = { name: "alice" };
    expect(wrap(struct as any)).toEqual([struct]);
  });

  it("wrap returns wrapped if to ary returns nil", () => {
    // undefined/null → empty array
    expect(wrap(undefined)).toEqual([]);
  });

  it("wrap does not complain if to ary does not return an array", () => {
    expect(() => wrap(42)).not.toThrow();
  });
});
