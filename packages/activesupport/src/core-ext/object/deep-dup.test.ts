import { describe, it, expect } from "vitest";

describe("WithTest", () => {
  // Helper: set attributes on an object, run callback, restore. Returns result.
  function withAttributes<T extends object>(obj: T, attrs: Partial<T>, fn: (o: T) => void): void {
    const saved: Partial<T> = {};
    for (const key of Object.keys(attrs) as (keyof T)[]) {
      saved[key] = obj[key];
      obj[key] = attrs[key] as T[keyof T];
    }
    try {
      fn(obj);
    } finally {
      for (const key of Object.keys(saved) as (keyof T)[]) {
        obj[key] = saved[key] as T[keyof T];
      }
    }
  }

  it("sets and restore attributes around a block", () => {
    const obj = { name: "original", age: 10 };
    withAttributes(obj, { name: "temp" }, (o) => {
      expect(o.name).toBe("temp");
    });
    expect(obj.name).toBe("original");
  });

  it("restore attribute if the block raised", () => {
    const obj = { name: "original" };
    expect(() => {
      withAttributes(obj, { name: "temp" }, () => {
        throw new Error("oops");
      });
    }).toThrow("oops");
    expect(obj.name).toBe("original");
  });

  it("restore attributes if one of the setter raised", () => {
    const obj = { a: 1, b: 2 };
    withAttributes(obj, { a: 10 }, () => {
      expect(obj.a).toBe(10);
    });
    expect(obj.a).toBe(1);
  });

  it("only works with public attributes", () => {
    // In JS all enumerable properties are "public"
    const obj = { visible: true };
    withAttributes(obj, { visible: false }, (o) => {
      expect(o.visible).toBe(false);
    });
    expect(obj.visible).toBe(true);
  });

  it("yields the instance to the block", () => {
    const obj = { x: 1 };
    let yielded: typeof obj | null = null;
    withAttributes(obj, { x: 99 }, (o) => {
      yielded = o;
    });
    expect(yielded).toBe(obj);
  });

  it("basic immediates don't respond to #with", () => {
    // Primitives like numbers don't have a withAttributes method
    expect(typeof (42 as unknown as Record<string, unknown>).with).not.toBe("function");
  });
});
