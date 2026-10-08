import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { excBacktraceLocations, rbFCaller } from "./backtrace-location.js";
import {
  Method,
  iseqLocationSetup,
  rbCheckArity,
  rbIseqMinMaxArity,
  rbObjMethod,
  rbObjMethods,
  rbObjPrivateMethods,
  rbObjProtectedMethods,
  rbObjPublicMethods,
} from "./method.js";
import { extend, rbObjClone, rbObjIsKindOf } from "./include.js";
import { NameError } from "./name-error.js";
import { TypeError } from "./type-error.js";

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

  it("takes the name as a Symbol or a String, and raises TypeError for anything else", () => {
    const obj = {
      check(): string {
        return "checked";
      },
    };
    expect(rbObjMethod(obj, ":check").name()).toEqual("check");
    expect(rbObjMethod(obj, "check").call()).toEqual("checked");
    expect(() => rbObjMethod(obj, 1)).toThrow(TypeError);
    expect(() => rbObjMethod(obj, 1)).toThrow("1 is not a symbol nor a string");
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

  it("raises with a backtrace that begins at its caller", () => {
    const sender = (): void => rbCheckArity((a: unknown) => a, 0);
    const exc = (() => {
      try {
        return sender();
      } catch (e) {
        return e;
      }
    })();
    expect(excBacktraceLocations(exc as Error)![0].label).toBe("sender");
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

describe("rbObjMethods / rbObjPublicMethods", () => {
  class Parent {
    inherited(): void {}
  }
  class Child extends Parent {
    title = "ivar";
    own(): void {}
  }

  it("lists singleton, class and ancestor methods, or the receiver's own class alone", () => {
    const child = Object.assign(new Child(), { singleton: () => 1 });
    expect(rbObjMethods(child)).toEqual(
      expect.arrayContaining(["singleton", "own", "inherited", "toString"]),
    );
    expect(rbObjMethods(child)).not.toContain("constructor");
    expect(rbObjMethods(child)).not.toContain("title");
    expect(rbObjPublicMethods(child)).toEqual(rbObjMethods(child));
    expect(rbObjPublicMethods(child, false)).toEqual(["singleton", "own"]);
    expect([rbObjPrivateMethods(child), rbObjProtectedMethods(child, false)]).toEqual([[], []]);
  });
});

describe("rbFCaller", () => {
  it("lists the frames above the method calling it", () => {
    const inner = (): string[] => rbFCaller();
    const caller = (function outer() {
      return inner();
    })();
    expect(caller[0]).toMatch(/^at outer /);
    expect(caller.some((frame) => /^at inner /.test(frame))).toBe(false);
  });
});

describe("Method#owner", () => {
  const M = {
    ds(): string {
      return "M";
    },
  };
  class B {
    declare static ds: () => string;
  }
  extend(B, M);
  class P extends B {
    static ds(): string {
      return "P";
    }
  }
  class Q extends B {}

  it("is the module an extended method came from", () => {
    expect(rbObjMethod(B, "ds").owner()).toBe(M);
    expect(rbObjMethod(Q, "ds").owner()).toBe(M);
  });

  it("is the class for a method of its singleton class", () => {
    expect(rbObjMethod(P, "ds").owner()).toBe(P);
  });

  it("is the class an instance method is defined in", () => {
    class Named {
      check(): void {}
    }
    expect(rbObjMethod(new Named(), "check").owner()).toBe(Named);
  });

  it("answers kind_of? for the modules a class was extended with", () => {
    expect(rbObjIsKindOf(B, rbObjMethod(Q, "ds").owner())).toBe(true);
    expect(rbObjIsKindOf(B, rbObjMethod(P, "ds").owner())).toBe(false);
    expect(rbObjIsKindOf(Q, M)).toBe(true);
    expect(rbObjIsKindOf(new B(), M)).toBe(false);
  });

  it("is the parent module for a member an extended module inherits", () => {
    const Parent = {
      inherited(): string {
        return "Parent";
      },
    };
    const Child = Object.create(Parent) as typeof Parent & { own(): string };
    Child.own = () => "Child";
    class Host {}
    extend(Host, Child);

    expect(rbObjMethod(Host, "inherited").owner()).toBe(Parent);
    expect(rbObjMethod(Host, "own").owner()).toBe(Child);
    expect(rbObjIsKindOf(Host, Parent)).toBe(true);
    expect(rbObjIsKindOf(Host, Child)).toBe(true);
    expect(rbObjIsKindOf(Host, {})).toBe(false);
  });

  it("is carried to a clone, which keeps its singleton class", () => {
    const host = extend({}, M);
    const clone = rbObjClone(host);

    expect(rbObjMethod(clone, "ds").owner()).toBe(M);
    expect(rbObjIsKindOf(clone, M)).toBe(true);
  });
});
