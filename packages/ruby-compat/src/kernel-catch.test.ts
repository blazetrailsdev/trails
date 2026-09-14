import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { kernelCatch, kernelThrow, UncaughtThrowError } from "./kernel-catch.js";
import { LocalJumpError } from "./local-jump-error.js";

describe("Kernel.catch", () => {
  let recorded: unknown;

  it("executes its block and catches a thrown value matching its argument", () => {
    recorded = undefined;
    kernelCatch(":thrown_key", () => {
      recorded = ":catch_block";
      kernelThrow(":thrown_key");
      recorded = ":throw_failed";
    });
    expect(recorded).toBe(":catch_block");
  });

  it("returns the second value passed to throw", () => {
    expect(kernelCatch(":thrown_key", () => kernelThrow(":thrown_key", ":catch_value"))).toBe(
      ":catch_value",
    );
  });

  it("returns the last expression evaluated if throw was not called", () => {
    expect(kernelCatch(":thrown_key", () => ":catch_block")).toBe(":catch_block");
  });

  it("passes the given symbol to its block", () => {
    recorded = undefined;
    kernelCatch(":thrown_key", (tag) => {
      recorded = tag;
    });
    expect(recorded).toBe(":thrown_key");
  });

  it("raises an ArgumentError if a Symbol is thrown for a String catch value", () => {
    expect(() => kernelCatch("exit", () => kernelThrow(":exit"))).toThrow(ArgumentError);
  });

  it.skip("raises an ArgumentError if a String with different identity is thrown", () => {
    // PERMANENT-SKIP: a JS string has no identity distinct from its value
  });

  it("catches a Symbol when thrown a matching Symbol", () => {
    recorded = undefined;
    kernelCatch(":thrown_key", () => {
      recorded = ":catch_block";
      kernelThrow(":thrown_key");
    });
    expect(recorded).toBe(":catch_block");
  });

  it.skip("catches a String when thrown a String with the same identity", () => {
    // PERMANENT-SKIP: a JS string has no identity distinct from its value
  });

  it("accepts an object as an argument", () => {
    expect(kernelCatch({}, () => ":catch_block")).toBe(":catch_block");
  });

  it("yields an object when called without arguments", () => {
    const tag = kernelCatch((tag) => tag);
    expect(tag).toBeInstanceOf(Object);
  });

  it("can be used even in a method different from where throw is called", () => {
    const throwingMethod = () => kernelThrow(":blah", ":thrown_value");
    const catchingMethod = () => kernelCatch(":blah", () => throwingMethod());
    expect(catchingMethod()).toBe(":thrown_value");
  });

  describe("when nested", () => {
    it("catches across invocation boundaries", () => {
      const scratch: number[] = [];
      kernelCatch(":one", () => {
        scratch.push(1);
        kernelCatch(":two", () => {
          scratch.push(2);
          kernelCatch(":three", () => {
            scratch.push(3);
            kernelThrow(":one");
            scratch.push(4);
          });
          scratch.push(5);
        });
        scratch.push(6);
      });

      expect(scratch).toEqual([1, 2, 3]);
    });

    it("catches in the nested invocation with the same key object", () => {
      const scratch: number[] = [];
      kernelCatch(":thrown_key", () => {
        scratch.push(1);
        kernelCatch(":thrown_key", () => {
          scratch.push(2);
          kernelThrow(":thrown_key");
          scratch.push(3);
        });
        scratch.push(4);
      });

      expect(scratch).toEqual([1, 2, 4]);
    });
  });

  it("raises LocalJumpError if no block is given", () => {
    expect(() => kernelCatch(":blah")).toThrow(LocalJumpError);
  });
});

describe("Kernel#catch", () => {
  it.skip("is a private method", () => {
    // PERMANENT-SKIP: method visibility is not a runtime fact in JS (CLAUDE.md)
  });
});

describe("Kernel.throw", () => {
  it("transfers control to the end of the active catch block waiting for symbol", () => {
    expect(
      kernelCatch(":blah", () => {
        kernelThrow(":blah");
        throw new Error("throw didn't transfer the control");
      }),
    ).toBeNull();
  });

  it("transfers control to the innermost catch block waiting for the same symbol", () => {
    let one = 0;
    let two = 0;
    let three = 0;
    kernelCatch(":duplicate", () => {
      kernelCatch(":duplicate", () => {
        kernelCatch(":duplicate", () => {
          one = 1;
          kernelThrow(":duplicate");
        });
        two = 2;
        kernelThrow(":duplicate");
      });
      three = 3;
      kernelThrow(":duplicate");
    });
    expect([one, two, three]).toEqual([1, 2, 3]);
  });

  it("sets the return value of the catch block to nil by default", () => {
    const res = kernelCatch(":blah", () => {
      kernelThrow(":blah");
    });
    expect(res).toBe(null);
  });

  it("sets the return value of the catch block to a value specified as second parameter", () => {
    const res = kernelCatch(":blah", () => {
      kernelThrow(":blah", ":return_value");
    });
    expect(res).toBe(":return_value");
  });

  it("raises an ArgumentError if there is no catch block for the symbol", () => {
    expect(() => kernelThrow(":blah")).toThrow(ArgumentError);
  });

  it("raises an UncaughtThrowError if there is no catch block for the symbol", () => {
    expect(() => kernelThrow(":blah")).toThrow(UncaughtThrowError);
  });

  it("raises ArgumentError if 3 or more arguments provided", () => {
    const throw3 = kernelThrow as (...args: unknown[]) => never;
    expect(() => kernelCatch(":blah", () => throw3(":blah", ":return_value", 2))).toThrow(
      ArgumentError,
    );

    expect(() => kernelCatch(":blah", () => throw3(":blah", ":return_value", 2, 3, 4, 5))).toThrow(
      ArgumentError,
    );
  });

  it("can throw an object", () => {
    expect(() => {
      const obj = {};
      kernelCatch(obj, () => kernelThrow(obj));
    }).not.toThrow();
  });
});

describe("Kernel#throw", () => {
  it.skip("is a private method", () => {
    // PERMANENT-SKIP: method visibility is not a runtime fact in JS (CLAUDE.md)
  });
});
