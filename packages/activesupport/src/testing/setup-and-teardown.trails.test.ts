import { describe, expect, it, vi } from "vitest";

const travelBack = vi.hoisted(() => ({ raises: null as Error | null }));
vi.mock("./time-helpers.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./time-helpers.js")>();
  return {
    ...original,
    afterTeardown: () => {
      if (travelBack.raises) throw travelBack.raises;
      original.afterTeardown();
    },
  };
});

import { Assertion, UnexpectedError } from "./assertions.js";
import { afterTeardown, beforeSetup, prepended, setup, teardown } from "./setup-and-teardown.js";
import {
  afterTeardown as testsWithoutAssertionsAfterTeardown,
  type RunningTest,
} from "./tests-without-assertions.js";
import { _takeAssertions, assertNot, assertRaises } from "./assertions.js";
import { TestCase } from "../test-case.js";
import { Module, include } from "@blazetrails/ruby-compat";

function testCase(): new () => object {
  const klass = class {};
  prepended(klass);
  return klass;
}

function runningTest(): Pick<RunningTest, "failures"> {
  return { failures: [] };
}

describe("SetupAndTeardown", () => {
  it("runs setup callbacks before_setup and teardown callbacks after_teardown", () => {
    const klass = testCase();
    const ran: string[] = [];
    setup.call(klass, () => ran.push("setup"));
    teardown.call(klass, () => ran.push("teardown"));

    const instance = new klass();
    beforeSetup.call(instance);
    expect(ran).toEqual(["setup"]);

    afterTeardown.call(instance, runningTest());
    expect(ran).toEqual(["setup", "teardown"]);
  });

  it("records a raising teardown callback as a failure instead of propagating", () => {
    const klass = testCase();
    const test = runningTest();
    const raised = new TypeError("boom");
    teardown.call(klass, () => {
      throw raised;
    });

    afterTeardown.call(new klass(), test);

    expect(test.failures.length).toBe(1);
    const failure = test.failures[0];
    expect(failure).toBeInstanceOf(UnexpectedError);
    expect((failure as UnexpectedError).error).toBe(raised);
  });

  it("records a failed assertion in a teardown callback as itself", () => {
    const klass = testCase();
    const test = runningTest();
    const raised = new Assertion("nope");
    teardown.call(klass, () => {
      throw raised;
    });

    afterTeardown.call(new klass(), test);

    expect(test.failures[0]).toBe(raised);
  });
});

describe("TestsWithoutAssertions", () => {
  const running = {
    assertions: 0,
    skipped: false,
    error: false,
    name: "a test",
    sourceLocation: ["some_test.ts", 12] as [string, number],
    failures: [],
  };

  it("warns when a test made no assertion", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    testsWithoutAssertionsAfterTeardown({ ...running });
    const calls = warn.mock.calls.map((c) => c[0]);
    warn.mockRestore();

    expect(calls).toContain("Test is missing assertions: `a test` some_test.ts:12");
  });

  it("stays quiet for a test that asserted, was skipped, or errored", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    testsWithoutAssertionsAfterTeardown({ ...running, assertions: 1 });
    testsWithoutAssertionsAfterTeardown({ ...running, skipped: true });
    testsWithoutAssertionsAfterTeardown({ ...running, error: true });
    const calls = warn.mock.calls;
    warn.mockRestore();

    expect(calls).toEqual([]);
  });
});

describe("TestCase after_teardown chain", () => {
  it("fails the running test when a teardown callback raised, and skips the warning", () => {
    const raised = new TypeError("boom");
    class TeardownRaisesTest extends TestCase {}
    TeardownRaisesTest.teardown(() => {
      throw raised;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() =>
        new TeardownRaisesTest("a test").afterTeardown({
          assertions: 0,
          skipped: false,
          error: false,
          name: "a test",
          sourceLocation: ["some_test.ts", 12],
          failures: [],
        }),
      ).toThrow(UnexpectedError);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("counts an assert helper as an assertion", async () => {
    _takeAssertions();
    assertNot(false);
    await assertRaises([RangeError], {}, () => {
      throw new RangeError("boom");
    });

    expect(_takeAssertions()).toBe(2);
  });
});

describe("TestCase lifecycle hooks", () => {
  it("runs each class's own setup chain against the instance", () => {
    class ParentTest extends TestCase {
      ran: string[] = [];
    }
    class ChildTest extends ParentTest {}
    ParentTest.setup(function (this: ParentTest) {
      this.ran.push("parent");
    });
    ChildTest.setup(function (this: ChildTest) {
      this.ran.push("child");
    });
    const parent = new ParentTest("a test");
    const child = new ChildTest("a test");
    parent.beforeSetup();
    child.beforeSetup();
    expect(parent.ran).toEqual(["parent"]);
    expect(child.ran).toEqual(["parent", "child"]);
  });

  const running = (): RunningTest => ({
    assertions: 1,
    skipped: false,
    error: false,
    name: "a test",
    sourceLocation: ["some_test.ts", 12],
    failures: [],
  });

  async function includedBeneath(
    klass: typeof TestCase,
    ran: string[],
    block: () => unknown,
  ): Promise<void> {
    const Fixtures = new Module();
    Fixtures.defineMethod("beforeSetup", async () => {
      await Promise.resolve();
      ran.push("before_setup");
    });
    Fixtures.defineMethod("afterTeardown", () => ran.push("after_teardown"));
    const proto = klass.prototype;
    const parent = Object.getPrototypeOf(proto);
    include(klass, Fixtures);
    try {
      await block();
    } finally {
      Object.setPrototypeOf(proto, parent);
    }
  }

  it("reaches a module included beneath the class through super, before the setup chain", async () => {
    class FixturesTest extends TestCase {}
    const ran: string[] = [];
    FixturesTest.setup(() => ran.push("setup"));
    FixturesTest.teardown(async () => {
      await Promise.resolve();
      ran.push("teardown");
    });
    await includedBeneath(TestCase, ran, async () => {
      const instance = new FixturesTest("a test");
      await instance.beforeSetup();
      await instance.afterTeardown(running());
    });
    expect(ran).toEqual(["before_setup", "setup", "teardown", "after_teardown"]);
  });

  it("records a rejected async teardown callback as a failure, then runs the hook beneath", async () => {
    class RejectsTest extends TestCase {}
    const raised = new TypeError("boom");
    const ran: string[] = [];
    RejectsTest.teardown(() => Promise.reject(raised));
    const test = running();
    await expect(
      includedBeneath(TestCase, ran, () => new RejectsTest("a test").afterTeardown(test)),
    ).rejects.toBeInstanceOf(UnexpectedError);
    expect(ran).toEqual(["after_teardown"]);
    expect(test.failures.map((failure) => (failure as UnexpectedError).error)).toEqual([raised]);
  });

  it("still runs the hook beneath when travel_back raises, then re-raises", async () => {
    vi.resetModules();
    const { TestCase: Reloaded } = await import("../test-case.js");
    const ran: string[] = [];
    travelBack.raises = new RangeError("travel_back");
    await expect(
      includedBeneath(Reloaded, ran, () => new Reloaded("a test").afterTeardown(running())),
    ).rejects.toBe(travelBack.raises);
    travelBack.raises = null;
    expect(ran).toEqual(["after_teardown"]);
  });
});
