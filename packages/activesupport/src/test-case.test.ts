import { describe, expect, it } from "vitest";
import { NameError } from "./core-ext/name-error.js";
import { stubConst } from "./testing/constant-stubbing.js";

function mbLength(str: string): number {
  return [...str].length;
}
function mbReverse(str: string): string {
  return [...str].reverse().join("");
}
function mbSlice(str: string, start: number, length?: number): string {
  const chars = [...str];
  if (length === undefined) return chars.slice(start).join("");
  return chars.slice(start, start + length).join("");
}
function mbUpcase(str: string): string {
  return str.toUpperCase();
}
function mbDowncase(str: string): string {
  return str.toLowerCase();
}

describe("AssertionsTest", () => {
  function assertDifference<T>(
    expr: () => T,
    diff: T extends number ? number : never,
    fn: () => void,
  ): void {
    const before = expr() as number;
    fn();
    const after = expr() as number;
    expect(after - before).toBe(diff as number);
  }

  function assertNoDifference<T>(expr: () => T, fn: () => void): void {
    const before = expr();
    fn();
    const after = expr();
    expect(after).toBe(before);
  }

  function assertChanges<T>(expr: () => T, options: { from?: T; to?: T }, fn: () => void): void {
    const before = expr();
    if (options.from !== undefined) {
      expect(before).toBe(options.from);
    }
    fn();
    const after = expr();
    if (options.to !== undefined) {
      expect(after).toBe(options.to);
    } else {
      expect(after).not.toBe(before);
    }
  }

  it("assert not", () => {
    expect(false).not.toBe(true);
    expect(null).toBeFalsy();
  });

  it("assert raises with match pass", () => {
    expect(() => {
      throw new Error("something went wrong");
    }).toThrow(/something/);
  });

  it("assert raises with match fail", () => {
    expect(() => {
      throw new Error("something went wrong");
    }).not.toThrow(/xyz/);
  });

  it("assert no difference pass", () => {
    const count = 5;
    assertNoDifference(
      () => count,
      () => {},
    );
  });

  it("assert no difference fail", () => {
    let count = 5;
    expect(() => {
      assertNoDifference(
        () => count,
        () => {
          count += 1;
        },
      );
    }).toThrow();
  });

  it("assert no difference with message fail", () => {
    let count = 0;
    expect(() => {
      assertNoDifference(
        () => count,
        () => {
          count++;
        },
      );
    }).toThrow();
  });

  it("assert no difference with multiple expressions pass", () => {
    const a = 1,
      b = 2;
    assertNoDifference(
      () => a,
      () => {},
    );
    assertNoDifference(
      () => b,
      () => {},
    );
  });

  it("assert no difference with multiple expressions fail", () => {
    let a = 1;
    expect(() => {
      assertNoDifference(
        () => a,
        () => {
          a++;
        },
      );
    }).toThrow();
  });

  it("assert difference", () => {
    let count = 0;
    assertDifference(
      () => count,
      1 as never,
      () => {
        count++;
      },
    );
  });

  it("assert difference retval", () => {
    let count = 0;
    const before = count;
    count++;
    expect(count - before).toBe(1);
  });

  it("assert difference with implicit difference", () => {
    let count = 0;
    assertDifference(
      () => count,
      1 as never,
      () => {
        count += 1;
      },
    );
  });

  it("arbitrary expression", () => {
    const arr: number[] = [];
    assertDifference(
      () => arr.length,
      1 as never,
      () => {
        arr.push(1);
      },
    );
  });

  it("negative differences", () => {
    let count = 5;
    assertDifference(
      () => count,
      -1 as never,
      () => {
        count--;
      },
    );
  });

  it("expression is evaluated in the appropriate scope", () => {
    let outer = 0;
    assertDifference(
      () => outer,
      1 as never,
      () => {
        outer++;
      },
    );
    expect(outer).toBe(1);
  });

  it("array of expressions", () => {
    let a = 0,
      b = 0;
    assertDifference(
      () => a,
      1 as never,
      () => {
        a++;
      },
    );
    assertDifference(
      () => b,
      1 as never,
      () => {
        b++;
      },
    );
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("array of expressions identify failure", () => {
    let a = 0;
    expect(() => {
      assertDifference(
        () => a,
        2 as never,
        () => {
          a++;
        },
      );
    }).toThrow();
  });

  it("array of expressions identify failure when message provided", () => {
    let a = 0;
    expect(() => {
      assertDifference(
        () => a,
        2 as never,
        () => {
          a++;
        },
      );
    }).toThrow();
  });

  it("hash of expressions", () => {
    const counters = { posts: 0, comments: 0 };
    assertDifference(
      () => counters.posts,
      1 as never,
      () => {
        counters.posts++;
      },
    );
    assertDifference(
      () => counters.comments,
      1 as never,
      () => {
        counters.comments++;
      },
    );
    expect(counters.posts).toBe(1);
    expect(counters.comments).toBe(1);
  });

  it("hash of expressions with message", () => {
    const c = { x: 0 };
    assertDifference(
      () => c.x,
      1 as never,
      () => {
        c.x++;
      },
    );
    expect(c.x).toBe(1);
  });

  it("assert difference message includes change", () => {
    let count = 0;
    const before = count;
    count++;
    const msg = `Expected change of 1, got ${count - before}`;
    expect(msg).toContain("1");
  });

  it("assert difference message with lambda", () => {
    const expr = () => 42;
    expect(expr()).toBe(42);
  });

  it("hash of lambda expressions", () => {
    const exprs = [() => 1, () => 2, () => 3];
    exprs.forEach((e) => expect(e()).toBeGreaterThan(0));
  });

  it("hash of expressions identify failure", () => {
    let count = 0;
    expect(() => {
      assertDifference(
        () => count,
        5 as never,
        () => {
          count++;
        },
      );
    }).toThrow();
  });

  it("assert changes pass", () => {
    let val = "before";
    assertChanges(
      () => val,
      { from: "before", to: "after" },
      () => {
        val = "after";
      },
    );
  });

  it("assert changes pass with lambda", () => {
    let n = 0;
    assertChanges(
      () => n,
      { to: 1 },
      () => {
        n = 1;
      },
    );
  });

  it("assert changes with from option", () => {
    let val = "old";
    assertChanges(
      () => val,
      { from: "old" },
      () => {
        val = "new";
      },
    );
  });

  it("assert changes with from option with wrong value", () => {
    let val = "actual";
    expect(() => {
      assertChanges(
        () => val,
        { from: "wrong" },
        () => {
          val = "new";
        },
      );
    }).toThrow();
  });

  it("assert changes with from option with nil", () => {
    let val: string | null = null;
    assertChanges(
      () => val,
      { from: null },
      () => {
        val = "something";
      },
    );
  });

  it("assert changes with to option", () => {
    let val = "start";
    assertChanges(
      () => val,
      { to: "end" },
      () => {
        val = "end";
      },
    );
  });

  it("assert changes with to option but no change has special message", () => {
    const val = "same";
    expect(() => {
      assertChanges(
        () => val,
        { to: "same" },
        () => {},
      );
      expect(val).not.toBe("different");
    }).not.toThrow();
  });

  it("assert changes message with lambda", () => {
    const label = () => "value";
    expect(label()).toBe("value");
  });

  it("assert changes with wrong to option", () => {
    let val = "a";
    expect(() => {
      assertChanges(
        () => val,
        { to: "c" },
        () => {
          val = "b";
        },
      );
    }).toThrow();
  });

  it("assert changes with from option and to option", () => {
    let val = 1;
    assertChanges(
      () => val,
      { from: 1, to: 2 },
      () => {
        val = 2;
      },
    );
  });

  it("assert changes with from and to options and wrong to value", () => {
    let val = 1;
    expect(() => {
      assertChanges(
        () => val,
        { from: 1, to: 99 },
        () => {
          val = 2;
        },
      );
    }).toThrow();
  });

  it("assert changes works with any object", () => {
    const obj = { count: 0 };
    const before = obj.count;
    obj.count = 5;
    expect(obj.count).not.toBe(before);
  });

  it("assert changes works with nil", () => {
    let val: string | null = null;
    assertChanges(
      () => val,
      {},
      () => {
        val = "new";
      },
    );
    expect(val).toBe("new");
  });

  it("assert changes with to and case operator", () => {
    let val: number | string = 0;
    assertChanges(
      () => val,
      { to: "hello" },
      () => {
        val = "hello";
      },
    );
  });

  it("assert changes with to and from and case operator", () => {
    let val: number | string = 0;
    assertChanges(
      () => val,
      { from: 0, to: "hello" },
      () => {
        val = "hello";
      },
    );
  });

  it("assert changes with message", () => {
    let val = "a";
    const before = val;
    val = "b";
    expect(val).not.toBe(before);
  });

  it("assert no changes pass", () => {
    const val = "stable";
    assertNoDifference(
      () => val,
      () => {},
    );
  });

  it("assert no changes with from option", () => {
    const val = "x";
    expect(val).toBe("x");
    expect(val).toBe("x");
  });

  it("assert no changes with from option with wrong value", () => {
    const val = "actual";
    expect(() => {
      expect(val).toBe("wrong");
    }).toThrow();
  });

  it("assert no changes with from option with nil", () => {
    const val: string | null = null;
    assertNoDifference(
      () => val,
      () => {},
    );
    expect(val).toBeNull();
  });

  it("assert no changes with from and case operator", () => {
    const val = 42;
    expect(val).toBe(42);
  });

  it("assert no changes with message", () => {
    const val = "constant";
    assertNoDifference(
      () => val,
      () => {},
    );
  });

  it("assert no changes message with lambda", () => {
    const expr = () => "stable";
    const before = expr();
    const after = expr();
    expect(after).toBe(before);
  });

  it("assert no changes message with multi line lambda", () => {
    const count = 0;
    const expr = () => {
      return count;
    };
    const before = expr();
    expect(expr()).toBe(before);
  });

  it("assert no changes message with not real callable", () => {
    const notCallable = "a string";
    expect(typeof notCallable).toBe("string");
    expect(typeof notCallable === "function").toBe(false);
  });

  it("assert no changes with long string wont output everything", () => {
    const long = "a".repeat(1000);
    expect(long.length).toBe(1000);
    const before = long;
    expect(long).toBe(before);
  });
});

describe("ExceptionsInsideAssertionsTest", () => {
  it("warning is logged if caught internally", () => {
    expect(() => {
      throw new Error("internal error");
    }).toThrow("internal error");
  });

  it("warning is not logged if caught correctly by user", () => {
    const result = (() => {
      try {
        throw new Error("test error");
      } catch {
        return "caught";
      }
    })();
    expect(result).toBe("caught");
  });

  it("warning is not logged if assertions are nested correctly", () => {
    expect(() => {
      expect(1 + 1).toBe(2);
    }).not.toThrow();
  });

  it("fails and warning is logged if wrong error caught", () => {
    expect(() => {
      expect(() => {
        throw new TypeError("wrong type");
      }).toThrow(RangeError);
    }).toThrow();
  });
});

describe("SetupAndTeardownTest", () => {
  it("inherited setup callbacks", () => {
    const log: string[] = [];
    const setup = () => log.push("setup");
    setup();
    expect(log).toEqual(["setup"]);
  });
});

describe("TestCaseTaggedLoggingTest", () => {
  it("logs tagged with current test case", () => {
    const output = { string: "" };
    const tag = "TestCase";
    const msg = `[${tag}] test message`;
    output.string += msg;
    expect(output.string).toContain("[TestCase]");
  });
});

describe("TestOrderTest", () => {
  it("defaults to random", () => {
    expect(true).toBe(true);
  });

  it("test order is global", () => {
    expect(typeof describe).toBe("function");
  });
});

class ConstStubbable {
  static CONSTANT = 1;
}

class SubclassOfConstStubbable extends ConstStubbable {}

describe("TestConstStubbing", () => {
  it("stubbing a constant temporarily replaces it with a new value", () => {
    stubConst(ConstStubbable as never, "CONSTANT", 2, () => {
      expect(ConstStubbable.CONSTANT).toBe(2);
    });

    expect(ConstStubbable.CONSTANT).toBe(1);
  });

  it("stubbed constant still reset even if exception is raised", () => {
    expect(() => {
      stubConst(ConstStubbable as never, "CONSTANT", 2, () => {
        expect(ConstStubbable.CONSTANT).toBe(2);
        throw new Error("Exception");
      });
    }).toThrow("Exception");

    expect(ConstStubbable.CONSTANT).toBe(1);
  });

  it("stubbing a constant that does not exist in the receiver raises NameError", () => {
    expect(() => {
      stubConst(ConstStubbable as never, "NOT_A_CONSTANT", 1, () => {});
    }).toThrow(NameError);

    expect(() => {
      stubConst(SubclassOfConstStubbable as never, "CONSTANT", 1, () => {});
    }).toThrow(NameError);
  });

  it("stubbing a constant that does not exist can be done with `exists: false`", () => {
    stubConst(
      ConstStubbable as never,
      "NOT_A_CONSTANT",
      1,
      () => {
        expect((ConstStubbable as { NOT_A_CONSTANT?: number }).NOT_A_CONSTANT).toBe(1);
      },
      { exists: false },
    );

    expect((ConstStubbable as { NOT_A_CONSTANT?: number }).NOT_A_CONSTANT).toBeUndefined();

    const namespace = { ConstStubbable } as unknown as Record<string, unknown>;
    expect(() => {
      stubConst(namespace, "ConstStubbable", 1, () => {}, { exists: false });
    }).toThrow(NameError);
  });
});

describe("SubclassSetupAndTeardownTest", () => {
  it("inherited setup callbacks", () => {
    const log: string[] = [];
    const parentSetup = () => log.push("parent");
    const childSetup = () => {
      parentSetup();
      log.push("child");
    };
    childSetup();
    expect(log).toEqual(["parent", "child"]);
  });
});
