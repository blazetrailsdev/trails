import { describe, expect, it } from "vitest";

import { Object } from "./instance-variables.js";

describe("ObjectInstanceVariableTest", () => {
  /** Rails' `setup` (instance_variables_test.rb:7-11). */
  function source(): object {
    return { bar: "bar", baz: "baz" };
  }

  it("instance variable names", () => {
    expect(Object.instanceVariableNames(source()).sort()).toEqual(["bar", "baz"]);
  });

  it("instance values", () => {
    expect(Object.instanceValues(source())).toEqual({ bar: "bar", baz: "baz" });
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
    const obj = globalThis.Object.freeze({ x: 10 });
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
