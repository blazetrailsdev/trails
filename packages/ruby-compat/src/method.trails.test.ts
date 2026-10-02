import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import {
  Method,
  iseqLocationSetup,
  rbCheckArity,
  rbIseqMinMaxArity,
  rbObjMethod,
} from "./method.js";
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

describe("rbCheckArity", () => {
  it("raises MRI's wrong number of arguments for a fixed, optional or rest list", () => {
    expect(() => rbCheckArity(function (_a: unknown) {}, 0)).toThrow(ArgumentError);
    expect(() => rbCheckArity(function (_a: unknown) {}, 0)).toThrow(
      "wrong number of arguments (given 0, expected 1)",
    );
    expect(() => rbCheckArity(function (_a: unknown, _b = {}) {}, 3)).toThrow(
      "wrong number of arguments (given 3, expected 1..2)",
    );
    expect(() => rbCheckArity((_a: unknown, ..._b: unknown[]) => 1, 0)).toThrow(
      "wrong number of arguments (given 0, expected 1+)",
    );
    expect(() => rbCheckArity(() => 1, 1)).toThrow(
      "wrong number of arguments (given 1, expected 0)",
    );
  });

  it("counts a destructured parameter with defaults inside its pattern as required", () => {
    const min = rbIseqMinMaxArity;
    expect(min(({ a = 1 }: { a?: number }) => a)).toEqual([1, 1]);
    expect(min(([x = 1]: number[]) => x)).toEqual([1, 1]);
    expect(min(({ a = 1 }: { a?: number } = {}) => a)).toEqual([0, 1]);
    expect(min(async (a: unknown) => a)).toEqual([1, 1]);
    expect(min(new Function("return async x => x")())).toEqual([1, 1]);
    expect(
      min(function (a = "x, y = z", b = ")") {
        return [a, b];
      }),
    ).toEqual([0, 2]);
    expect(() => rbCheckArity(({ a = 1 }: { a?: number }) => a, 0)).toThrow(
      "wrong number of arguments (given 0, expected 1)",
    );
  });

  it("answers nothing when argc is in range", () => {
    expect(() => rbCheckArity(function (_a: unknown, _b = {}) {}, 1)).not.toThrow();
    expect(() => rbCheckArity(function (_a: unknown, _b = {}) {}, 2)).not.toThrow();
    expect(() => rbCheckArity((..._a: unknown[]) => 1, 7)).not.toThrow();
  });
});

describe("Method#source_location", () => {
  class Located {
    here(): void {}
    native(): void {}
  }
  iseqLocationSetup(Located.prototype.here, "located.ts", 12);

  it("answers the path and first line the body was set up with", () => {
    expect(rbObjMethod(new Located(), "here").sourceLocation()).toEqual(["located.ts", 12]);
  });

  it("answers nil for a body with no location", () => {
    expect(rbObjMethod(new Located(), "native").sourceLocation()).toBeNull();
  });
});
