import { describe, expect, it } from "vitest";
import { Method, rbObjMethod } from "./method.js";
import { NameError } from "./name-error.js";

describe("rbObjMethod", () => {
  class Missing {
    respondToMissing(method: string): boolean {
      return method === "forwarded";
    }

    methodMissing(method: string, ...args: unknown[]): unknown {
      return [method, ...args];
    }
  }

  it("binds a method_missing-backed Method when respond_to_missing? answers", () => {
    const method = rbObjMethod(new Missing(), "forwarded");
    expect(method.name()).toEqual("forwarded");
    expect(method.call(1)).toEqual(["forwarded", 1]);
  });

  it("raises NameError for a name the receiver does not answer", () => {
    expect(() => rbObjMethod(new Missing(), "nope")).toThrow(NameError);
    expect(() => rbObjMethod(new Missing(), "nope")).toThrow(
      "undefined method 'nope' for an instance of Missing",
    );
  });
});

describe("Method#arity", () => {
  const arity = (fn: (...args: never[]) => unknown) => new Method(null, "m", fn as never).arity();

  it("counts required parameters and answers -min-1 once an optional or rest appears", () => {
    expect(arity(function (_a: unknown) {})).toBe(1);
    expect(arity(function (_a: unknown, _b = {}) {})).toBe(-2);
    expect(arity((...a: unknown[]) => a)).toBe(-1);
    expect(arity(() => 1)).toBe(0);
    expect(arity((a: unknown) => a)).toBe(1);
    expect(arity(async (a: unknown, b: unknown) => [a, b])).toBe(2);
    expect(arity(async (a: unknown) => a)).toBe(1);
  });

  it("reads method shorthand and async method forms", () => {
    const obj = {
      one(gid: unknown) {
        return gid;
      },
      async two(gid: unknown, options = {}) {
        return [gid, options];
      },
      async three({ a }: { a: unknown }, [b]: unknown[] = []) {
        return [a, b];
      },
    };
    expect(rbObjMethod(obj, "one").arity()).toBe(1);
    expect(rbObjMethod(obj, "two").arity()).toBe(-2);
    expect(rbObjMethod(obj, "three").arity()).toBe(-2);
  });

  it("answers -1 for a method_missing-backed Method", () => {
    const target = {
      respondToMissing: () => true,
      methodMissing: (...args: unknown[]) => args,
    };
    expect(rbObjMethod(target, "anything").arity()).toBe(-1);
  });
});
