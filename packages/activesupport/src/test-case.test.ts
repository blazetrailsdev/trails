import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecureRandom } from "@blazetrails/ruby-compat";
import { NameError } from "./core-ext/name-error.js";
import { ArgumentError } from "./hash-utils.js";
import { Logger } from "./logger.js";
import { ActiveSupport } from "./index.js";
import { TestCase } from "./test-case.js";
import {
  Assertion,
  UnexpectedError,
  assert,
  assertChanges,
  assertDifference,
  assertIncludes,
  assertNoChanges,
  assertNoDifference,
  assertNot,
  assertRaises,
} from "./testing/assertions.js";
import { peekCallbackChain } from "./callbacks.js";
import { stubConst } from "./testing/constant-stubbing.js";

class Numbered {
  num = 0;

  increment(): void {
    this.num += 1;
  }

  decrement(): void {
    this.num -= 1;
  }
}

describe("AssertionsTest", () => {
  let object: Numbered;

  beforeEach(() => {
    object = new Numbered();
    object.num = 0;
  });

  it("assert not", async () => {
    expect(assertNot(null)).toEqual(true);
    expect(assertNot(false)).toEqual(true);

    let e = await assertRaises([Assertion], {}, () => {
      assertNot(true);
    });
    expect(e.message).toEqual("Expected true to be nil or false");

    e = await assertRaises([Assertion], {}, () => {
      assertNot(true, "custom");
    });
    expect(e.message).toEqual("custom");
  });

  it("assert raises with match pass", async () => {
    await assertRaises([ArgumentError], { match: /incorrect/i }, () => {
      throw new ArgumentError("Incorrect argument");
    });
  });

  it("assert raises with match fail", async () => {
    await assertRaises(
      [Assertion],
      { match: 'Expected /incorrect/i to match "Wrong argument".' },
      async () => {
        await assertRaises([ArgumentError], { match: /incorrect/i }, () => {
          throw new ArgumentError("Wrong argument");
        });
      },
    );
  });

  it("assert no difference pass", async () => {
    await assertNoDifference(
      () => object.num,
      null,
      () => {},
    );
  });

  it("assert no difference fail", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertNoDifference(
        () => object.num,
        null,
        () => {
          object.increment();
        },
      );
    });
    expect(error.message).toEqual(
      "`object.num` didn't change by 0, but by 1.\nExpected: 0\n  Actual: 1",
    );
  });

  it("assert no difference with message fail", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertNoDifference(
        () => object.num,
        "Object Changed",
        () => {
          object.increment();
        },
      );
    });
    expect(error.message).toEqual(
      "Object Changed.\n`object.num` didn't change by 0, but by 1.\nExpected: 0\n  Actual: 1",
    );
  });

  it("assert no difference with multiple expressions pass", async () => {
    const anotherObject = new Numbered();
    await assertNoDifference([() => object.num, () => anotherObject.num], null, () => {});
  });

  it("assert no difference with multiple expressions fail", async () => {
    const anotherObject = new Numbered();
    await assertRaises([Assertion], {}, async () => {
      await assertNoDifference(
        [() => object.num, () => anotherObject.num],
        "Another Object Changed",
        () => {
          anotherObject.increment();
        },
      );
    });
  });

  it("assert difference", async () => {
    await assertDifference(
      () => object.num,
      +1,
      null,
      () => {
        object.increment();
      },
    );
  });

  it("assert difference retval", async () => {
    const incremented = await assertDifference(
      () => object.num,
      +1,
      null,
      () => {
        object.increment();
        return 1;
      },
    );

    expect(incremented).toEqual(1);
  });

  it("assert difference with implicit difference", async () => {
    await assertDifference(
      () => object.num,
      undefined,
      null,
      () => {
        object.increment();
      },
    );
  });

  it("arbitrary expression", async () => {
    await assertDifference(
      () => object.num + 1,
      +2,
      null,
      () => {
        object.increment();
        object.increment();
      },
    );
  });

  it("negative differences", async () => {
    await assertDifference(
      () => object.num,
      -1,
      null,
      () => {
        object.decrement();
      },
    );
  });

  it("expression is evaluated in the appropriate scope", async () => {
    const localScope = "foo";
    void localScope;
    await assertDifference(
      () => object.num,
      undefined,
      null,
      () => {
        object.increment();
      },
    );
  });

  it("array of expressions", async () => {
    await assertDifference([() => object.num, () => object.num + 1], +1, null, () => {
      object.increment();
    });
  });

  it("array of expressions identify failure", async () => {
    await assertRaises([Assertion], {}, async () => {
      await assertDifference([() => object.num, () => 1 + 1], undefined, null, () => {
        object.increment();
      });
    });
  });

  it("array of expressions identify failure when message provided", async () => {
    await assertRaises([Assertion], {}, async () => {
      await assertDifference([() => object.num, () => 1 + 1], 1, "something went wrong", () => {
        object.increment();
      });
    });
  });

  it("hash of expressions", async () => {
    await assertDifference(
      new Map([
        [() => object.num, 1],
        [() => object.num + 1, 1],
      ]),
      null,
      () => {
        object.increment();
      },
    );
  });

  it("hash of expressions with message", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertDifference(new Map([[() => object.num, 0]]), "Object Changed", () => {
        object.increment();
      });
    });
    expect(error.message).toEqual(
      "Object Changed.\n`object.num` didn't change by 0, but by 1.\nExpected: 0\n  Actual: 1",
    );
  });

  it("assert difference message includes change", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertDifference(
        () => object.num,
        +5,
        null,
        () => {
          object.increment();
          object.increment();
        },
      );
    });
    expect(error.message).toEqual(
      "`object.num` didn't change by 5, but by 2.\nExpected: 5\n  Actual: 2",
    );
  });

  it("assert difference message with lambda", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertDifference(
        () => object.num,
        1,
        "Object Changed",
        () => {},
      );
    });
    expect(error.message).toEqual(
      "Object Changed.\n`object.num` didn't change by 1, but by 0.\nExpected: 1\n  Actual: 0",
    );
  });

  it("hash of lambda expressions", async () => {
    await assertDifference(
      new Map([
        [() => object.num, 1],
        [() => object.num + 1, 1],
      ]),
      null,
      () => {
        object.increment();
      },
    );
  });

  it("hash of expressions identify failure", async () => {
    await assertRaises([Assertion], {}, async () => {
      await assertDifference(
        new Map([
          [() => object.num, 1],
          [() => 1 + 1, 1],
        ]),
        null,
        () => {
          object.increment();
        },
      );
    });
  });

  it("assert changes pass", async () => {
    await assertChanges(
      () => object.num,
      null,
      {},
      () => {
        object.increment();
      },
    );
  });

  it("assert changes pass with lambda", async () => {
    await assertChanges(
      () => object.num,
      null,
      {},
      () => {
        object.increment();
      },
    );
  });

  it("assert changes with from option", async () => {
    await assertChanges(
      () => object.num,
      null,
      { from: 0 },
      () => {
        object.increment();
      },
    );
  });

  it("assert changes with from option with wrong value", async () => {
    await assertRaises([Assertion], {}, async () => {
      await assertChanges(
        () => object.num,
        null,
        { from: -1 },
        () => {
          object.increment();
        },
      );
    });
  });

  it("assert changes with from option with nil", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertChanges(
        () => object.num,
        null,
        { from: null },
        () => {
          object.increment();
        },
      );
    });

    expect(error.message).toEqual("Expected change from nil, got 0");
  });

  it("assert changes with to option", async () => {
    await assertChanges(
      () => object.num,
      null,
      { to: 1 },
      () => {
        object.increment();
      },
    );
  });

  it("assert changes with to option but no change has special message", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertChanges(
        () => object.num,
        null,
        { to: 0 },
        () => {},
      );
    });

    expect(error.message).toEqual(
      "`object.num` didn't change. It was already 0.\nExpected 0 to not be equal to 0.",
    );
  });

  it("assert changes message with lambda", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertChanges(
        () => object.num,
        null,
        { to: 0 },
        () => {},
      );
    });

    expect(error.message).toEqual(
      "`object.num` didn't change. It was already 0.\nExpected 0 to not be equal to 0.",
    );
  });

  it("assert changes with wrong to option", async () => {
    await assertRaises([Assertion], {}, async () => {
      await assertChanges(
        () => object.num,
        null,
        { to: 2 },
        () => {
          object.increment();
        },
      );
    });
  });

  it("assert changes with from option and to option", async () => {
    await assertChanges(
      () => object.num,
      null,
      { from: 0, to: 1 },
      () => {
        object.increment();
      },
    );
  });

  it("assert changes with from and to options and wrong to value", async () => {
    await assertRaises([Assertion], {}, async () => {
      await assertChanges(
        () => object.num,
        null,
        { from: 0, to: 2 },
        () => {
          object.increment();
        },
      );
    });
  });

  it("assert changes works with any object", async () => {
    let newObject: unknown = null;
    const retval = await assertChanges(
      () => newObject,
      null,
      { from: null, to: 42 },
      () => {
        newObject = 42;
        return 42;
      },
    );

    expect(retval).toEqual(42);
  });

  it("assert changes works with nil", async () => {
    const oldval: unknown = object;
    let current: unknown = object;

    const retval = await assertChanges(
      () => current,
      null,
      { from: oldval, to: null },
      () => {
        current = null;
        return null;
      },
    );

    expect(retval).toBeNull();
  });

  it("assert changes with to and case operator", async () => {
    let token: string | null = null;

    await assertChanges(
      () => token,
      null,
      { to: /\w{32}/ },
      () => {
        token = SecureRandom.hex();
      },
    );
  });

  it("assert changes with to and from and case operator", async () => {
    let token = SecureRandom.hex();

    await assertChanges(
      () => token,
      null,
      { from: /\w{32}/, to: /\w{32}/ },
      () => {
        token = SecureRandom.hex();
      },
    );
  });

  it("assert changes with message", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertChanges(
        () => object.num,
        "object.num should be 1",
        { to: 1 },
        () => {
          object.decrement();
        },
      );
    });

    expect(error.message).toEqual("object.num should be 1.\nExpected change to 1, got -1\n");
  });

  it("assert no changes pass", async () => {
    await assertNoChanges(
      () => object.num,
      null,
      {},
      () => {},
    );
  });

  it("assert no changes with from option", async () => {
    await assertNoChanges(
      () => object.num,
      null,
      { from: 0 },
      () => {},
    );
  });

  it("assert no changes with from option with wrong value", async () => {
    await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(
        () => object.num,
        null,
        { from: -1 },
        () => {},
      );
    });
  });

  it("assert no changes with from option with nil", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(
        () => object.num,
        null,
        { from: null },
        () => {
          object.increment();
        },
      );
    });
    expect(error.message).toEqual("Expected initial value of nil, got 0");
  });

  it("assert no changes with from and case operator", async () => {
    const token = SecureRandom.hex();

    await assertNoChanges(
      () => token,
      null,
      { from: /\w{32}/ },
      () => {},
    );
  });

  it("assert no changes with message", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(
        () => object.num,
        "object.num should not change",
        {},
        () => {
          object.increment();
        },
      );
    });

    expect(error.message).toEqual(
      "object.num should not change.\n`object.num` changed.\nExpected: 0\n  Actual: 1",
    );
  });

  it("assert no changes message with lambda", async () => {
    let error = await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(
        () => object.num,
        null,
        {},
        () => {
          object.increment();
        },
      );
    });
    expect(error.message).toEqual("`object.num` changed.\nExpected: 0\n  Actual: 1");

    let check = () => object.num;
    error = await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(check, null, {}, () => {
        object.increment();
      });
    });
    expect(error.message).toEqual("`object.num` changed.\nExpected: 1\n  Actual: 2");

    check = () => object.num;
    error = await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(check, null, {}, () => {
        object.increment();
      });
    });
    expect(error.message).toEqual("`object.num` changed.\nExpected: 2\n  Actual: 3");

    error = await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(
        () => object.num,
        null,
        {},
        () => {
          object.increment();
        },
      );
    });
    expect(error.message).toEqual("`object.num` changed.\nExpected: 3\n  Actual: 4");

    error = await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(
        (a = null) => (void a, object.num),
        null,
        {},
        () => {
          object.increment();
        },
      );
    });
    expect(error.message).toMatch(/#<Proc:0x.*changed/);
  });

  it("assert no changes message with multi line lambda", async () => {
    let check = () => {
      "title".toUpperCase();
      return object.num;
    };
    let error = await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(check, null, {}, () => {
        object.increment();
      });
    });
    expect(error.message).toMatch(/#<Proc:0x.*changed/);

    check = () => {
      "title".toUpperCase();
      return object.num;
    };
    error = await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(check, null, {}, () => {
        object.increment();
      });
    });
    expect(error.message).toMatch(/#<Proc:0x.*changed/);
  });

  it("assert no changes message with not real callable", async () => {
    const check = { call: () => object.num };

    const error = await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(check as unknown as () => unknown, null, {}, () => {
        object.increment();
      });
    });
    expect(error.message).toMatch(/#<Object:0x.*changed/);
  });

  it("assert no changes with long string wont output everything", async () => {
    let lines = "HEY\n".repeat(12);

    const error = await assertRaises([Assertion], {}, async () => {
      await assertNoChanges(
        () => lines,
        null,
        {},
        () => {
          lines += "HEY ALSO\n";
        },
      );
    });

    expect(error.message).toMatch(
      '`lines` changed.\n--- expected\n+++ actual\n@@ -10,4 +10,5 @@\n HEY\n HEY\n HEY\n+HEY ALSO\n "\n',
    );
  });
});

describe("ExceptionsInsideAssertionsTest", () => {
  let out: string[];

  beforeEach(() => {
    out = [];
    TestCase.setTaggedLogger(new Logger({ write: (s: string) => out.push(s) }) as never);
  });

  async function runTestThatShouldPassAndLogAWarning(): Promise<void> {
    await assertRaises([UnexpectedError], {}, async () => {
      await assertNoChanges(
        () => 1,
        null,
        {},
        () => {
          throw new ArgumentError();
        },
      );
    });
  }

  async function runTestThatShouldFailConfusingly(): Promise<void> {
    await assertRaises([ArgumentError], {}, async () => {
      await assertNoChanges(
        () => 1,
        null,
        {},
        () => {
          throw new ArgumentError();
        },
      );
    });
  }

  async function runTestThatShouldPassAndNotLogAWarning(): Promise<void> {
    await assertNoChanges(
      () => 1,
      null,
      {},
      async () => {
        await assertRaises([ArgumentError], {}, () => {
          throw new ArgumentError();
        });
      },
    );
  }

  async function runTestThatShouldFailButNotLogAWarning(): Promise<void> {
    await assertNoChanges(
      () => Math.random(),
      null,
      {},
      async () => {
        await assertRaises([ArgumentError], {}, () => {
          throw new ArgumentError();
        });
      },
    );
  }

  it("warning is logged if caught internally", async () => {
    await runTestThatShouldPassAndLogAWarning();
    const expected =
      "ExceptionsInsideAssertionsTest - warning is logged if caught internally: ArgumentError raised.\n" +
      "If you expected this exception, use `assert_raises` as near to the code that raises as possible.\n" +
      "Other block based assertions (e.g. `assert_no_changes`) can be used, as long as `assert_raises` is inside their block.\n";
    assertIncludes(out.join(""), expected);
  });

  it("warning is not logged if caught correctly by user", async () => {
    await runTestThatShouldPassAndNotLogAWarning();
    assertNot(out.join("").includes("assert_nothing_raised"));
  });

  it.skip("warning is not logged if assertions are nested correctly", async () => {
    // BLOCKED: activesupport-exceptions-inside-assertions-warning-is-not-emitted
    const error = await assertRaises([Assertion], {}, async () => {
      await runTestThatShouldFailButNotLogAWarning();
    });
    assertNot(out.join("").includes("assert_nothing_raised"));
    assert(error.message.includes("`rand` changed"));
  });

  it.skip("fails and warning is logged if wrong error caught", async () => {
    // BLOCKED: activesupport-exceptions-inside-assertions-warning-is-not-emitted
    const error = await assertRaises([Assertion], {}, async () => {
      await runTestThatShouldFailConfusingly();
    });
    const expected =
      "ExceptionsInsideAssertionsTest - fails and warning is logged if wrong error caught: ArgumentError raised.\n" +
      "If you expected this exception, use `assert_raises` as near to the code that raises as possible.\n" +
      "Other block based assertions (e.g. `assert_no_changes`) can be used, as long as `assert_raises` is inside their block.\n";
    assertIncludes(out.join(""), expected);
    assertIncludes(error.message, "ArgumentError: ArgumentError");
    assertIncludes(error.message, "runTestThatShouldFailConfusingly");
  });
});

class SetupAndTeardownTestCase extends TestCase {
  calledBack: string[] = [];

  resetCallbackRecord(): void {
    this.calledBack = [];
  }

  foo(): void {
    this.calledBack.push(":foo");
  }

  sentinel(): void {
    expect(this.calledBack).toEqual([":foo"]);
  }
}
SetupAndTeardownTestCase.setup(":resetCallbackRecord", ":foo");
SetupAndTeardownTestCase.teardown(":foo", ":sentinel");

class SubclassSetupAndTeardownTestCase extends SetupAndTeardownTestCase {
  bar(): void {
    this.calledBack.push(":bar");
  }

  override sentinel(): void {
    expect(this.calledBack).toEqual([":foo", ":bar", ":bar"]);
  }
}
SubclassSetupAndTeardownTestCase.setup(":bar");
SubclassSetupAndTeardownTestCase.teardown(":bar");

describe("SetupAndTeardownTest", () => {
  it.skip("inherited setup callbacks", () => {
    // BLOCKED: activesupport-test-case-setup-callback-chain-is-not-introspectable
    const instance = new SetupAndTeardownTestCase();
    instance.resetCallbackRecord();
    instance.foo();

    expect(
      peekCallbackChain(SetupAndTeardownTestCase, "setup")?.entries.map((c) => c.filter),
    ).toEqual([":resetCallbackRecord", ":foo"]);
    expect(instance.calledBack).toEqual([":foo"]);
    expect(
      peekCallbackChain(SetupAndTeardownTestCase, "teardown")?.entries.map((c) => c.filter),
    ).toEqual([":foo", ":sentinel"]);
  });
});

describe("SubclassSetupAndTeardownTest", () => {
  it.skip("inherited setup callbacks", () => {
    // BLOCKED: activesupport-test-case-setup-callback-chain-is-not-introspectable
    const instance = new SubclassSetupAndTeardownTestCase();
    instance.resetCallbackRecord();
    instance.foo();
    instance.bar();

    expect(
      peekCallbackChain(SubclassSetupAndTeardownTestCase, "setup")?.entries.map((c) => c.filter),
    ).toEqual([":resetCallbackRecord", ":foo", ":bar"]);
    expect(instance.calledBack).toEqual([":foo", ":bar"]);
    expect(
      peekCallbackChain(SubclassSetupAndTeardownTestCase, "teardown")?.entries.map((c) => c.filter),
    ).toEqual([":foo", ":sentinel", ":bar"]);
  });
});

describe("TestCaseTaggedLoggingTest", () => {
  it.skip("logs tagged with current test case", () => {
    // BLOCKED: activesupport-test-case-does-not-tag-the-logger-with-the-running-test
    const out: string[] = [];
    TestCase.setTaggedLogger(new Logger({ write: (s: string) => out.push(s) }) as never);
    expect(out.join("")).toMatch("TestCaseTaggedLoggingTest: logs tagged with current test case\n");
  });
});

describe("TestOrderTest", () => {
  const TestOrder = TestCase as unknown as {
    testOrder: string;
    setTestOrder(order: string | null): void;
  };
  const ActiveSupportTestOrder = ActiveSupport as unknown as {
    testOrder: string;
    setTestOrder(order: string | null): void;
  };
  let originalTestOrder: string;

  beforeEach(() => {
    originalTestOrder = TestOrder.testOrder;
  });

  afterEach(() => {
    TestOrder.setTestOrder(originalTestOrder);
  });

  it.skip("defaults to random", () => {
    // BLOCKED: activesupport-test-case-has-no-test-order
    TestOrder.setTestOrder(null);

    expect(TestOrder.testOrder).toEqual(":random");

    expect(ActiveSupportTestOrder.testOrder).toEqual(":random");
  });

  it.skip("test order is global", () => {
    // BLOCKED: activesupport-test-case-has-no-test-order
    TestOrder.setTestOrder(":sorted");

    expect(ActiveSupportTestOrder.testOrder).toEqual(":sorted");
    expect(TestOrder.testOrder).toEqual(":sorted");
    expect(TestOrder.testOrder).toEqual(":sorted");
    expect((class extends TestCase {} as unknown as typeof TestOrder).testOrder).toEqual(":sorted");

    ActiveSupportTestOrder.setTestOrder(":random");

    expect(ActiveSupportTestOrder.testOrder).toEqual(":random");
    expect(TestOrder.testOrder).toEqual(":random");
    expect(TestOrder.testOrder).toEqual(":random");
    expect((class extends TestCase {} as unknown as typeof TestOrder).testOrder).toEqual(":random");
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

  it("stubbing a constant that does not exist can be done with `exists: false`", async () => {
    stubConst(
      ConstStubbable as never,
      "NOT_A_CONSTANT",
      1,
      () => {
        expect((ConstStubbable as { NOT_A_CONSTANT?: number }).NOT_A_CONSTANT).toEqual(1);
      },
      { exists: false },
    );

    await assertRaises([NameError], {}, () => {
      constantLookup(ConstStubbable, "NOT_A_CONSTANT");
    });

    const namespace = { ConstStubbable } as unknown as Record<string, unknown>;
    await assertRaises([NameError], {}, () => {
      stubConst(namespace, "ConstStubbable", 1, () => {}, { exists: false });
    });
  });
});

function constantLookup(receiver: object, name: string): unknown {
  if (!(name in receiver)) throw new NameError(`uninitialized constant ${name}`);
  return (receiver as Record<string, unknown>)[name];
}
