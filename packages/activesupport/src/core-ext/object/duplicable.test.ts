import { describe, expect, it } from "vitest";
import { isDuplicable, Method, UnboundMethod, Singleton } from "./duplicable.js";
import { assertNotPredicate, assertPredicate } from "../../testing/assertions.js";

describe("DuplicableTest", () => {
  const OBJECTS: unknown[] = [
    () => {},
    "1",
    {},
    /foo/,
    [],
    new Date(),
    new WeakMap(),
    true,
    false,
    1,
    2.3,
  ];

  it("#duplicable? matches #dup behavior", () => {
    for (const v of OBJECTS) {
      let duplicable: boolean;
      try {
        structuredClone(v);
        duplicable = true;
      } catch {
        duplicable = false;
      }

      if (duplicable) {
        assertPredicate(v, isDuplicable);
      } else {
        assertNotPredicate(v, isDuplicable);
      }
    }
  });

  it("isDuplicable for objects and arrays", () => {
    expect(isDuplicable({})).toBe(true);
    expect(isDuplicable({ a: 1 })).toBe(true);
    expect(isDuplicable([1, 2])).toBe(true);
    expect(isDuplicable("hello")).toBe(true);
    expect(isDuplicable(42)).toBe(true);
    expect(isDuplicable(true)).toBe(true);
  });

  it("isDuplicable returns false for null and undefined", () => {
    expect(isDuplicable(null)).toBe(false);
    expect(isDuplicable(undefined)).toBe(false);
  });

  it("isDuplicable returns false for functions", () => {
    expect(isDuplicable(() => {})).toBe(false);
    expect(isDuplicable(function named() {})).toBe(false);
  });

  it("isDuplicable returns false for symbols", () => {
    expect(isDuplicable(globalThis.Symbol("test"))).toBe(false);
  });

  it("isDuplicable returns false for Weak* types", () => {
    expect(isDuplicable(new WeakMap())).toBe(false);
    expect(isDuplicable(new WeakSet())).toBe(false);
    expect(isDuplicable(new WeakRef({}))).toBe(false);
  });

  it("Method is not duplicable", () => {
    expect(Method.isDuplicable()).toBe(false);
  });

  it("UnboundMethod is not duplicable", () => {
    expect(UnboundMethod.isDuplicable()).toBe(false);
  });

  it("Singleton is not duplicable", () => {
    expect(Singleton.isDuplicable()).toBe(false);
  });
});
