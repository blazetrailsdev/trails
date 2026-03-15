import { describe, expect, it } from "vitest";

describe("ObjectInstanceVariableTest", () => {
  it("instance variable names", () => {
    class Obj {
      name = "test";
      value = 42;
    }
    const o = new Obj();
    expect(Object.keys(o)).toContain("name");
    expect(Object.keys(o)).toContain("value");
  });

  it("instance values", () => {
    class Obj {
      a = 1;
      b = "two";
    }
    const o = new Obj();
    expect(Object.values(o)).toContain(1);
    expect(Object.values(o)).toContain("two");
  });

  it("instance exec passes arguments to block", () => {
    const obj = { x: 10 };
    function instanceExec<T extends object, R>(
      o: T,
      fn: (this: T, ...args: unknown[]) => R,
      ...args: unknown[]
    ): R {
      return fn.apply(o, args);
    }
    const result = instanceExec(
      obj,
      function (this: typeof obj, n: unknown) {
        return this.x + (n as number);
      },
      5,
    );
    expect(result).toBe(15);
  });

  it("instance exec with frozen obj", () => {
    const obj = Object.freeze({ x: 10 });
    expect(() => {
      function instanceExec<T, R>(o: T, fn: (this: T) => R): R {
        return fn.call(o);
      }
      const r = instanceExec(obj, function (this: typeof obj) {
        return this.x;
      });
      expect(r).toBe(10);
    }).not.toThrow();
  });

  it("instance exec nested", () => {
    const outer = { x: 1 };
    const inner = { x: 2 };
    function instanceExec<T extends object, R>(o: T, fn: (this: T) => R): R {
      return fn.call(o);
    }
    const result = instanceExec(outer, function (this: typeof outer) {
      return (
        instanceExec(inner, function (this: typeof inner) {
          return this.x;
        }) + this.x
      );
    });
    expect(result).toBe(3);
  });
});
