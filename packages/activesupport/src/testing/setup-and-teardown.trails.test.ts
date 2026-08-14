import { describe, expect, it, vi } from "vitest";

import { resetCallbacks } from "../callbacks.js";
import { Assertion, UnexpectedError } from "./assertions.js";
import { afterTeardown, beforeSetup, prepended, setup, teardown } from "./setup-and-teardown.js";
import {
  afterTeardown as testsWithoutAssertionsAfterTeardown,
  type RunningTest,
} from "./tests-without-assertions.js";
import { TestCase } from "../test-case.js";

function testCase(): Record<string, never> {
  const klass = {} as Record<string, never>;
  prepended(klass);
  return klass;
}

/** The `self` Ruby's `self.failures` resolves against — one list per test. */
function runningTest(): Pick<RunningTest, "failures"> {
  return { failures: [] };
}

describe("SetupAndTeardown", () => {
  it("runs setup callbacks before_setup and teardown callbacks after_teardown", () => {
    const klass = testCase();
    const ran: string[] = [];
    setup.call(klass, () => ran.push("setup"));
    teardown.call(klass, () => ran.push("teardown"));

    beforeSetup.call(klass);
    expect(ran).toEqual(["setup"]);

    afterTeardown.call(klass, runningTest());
    expect(ran).toEqual(["setup", "teardown"]);
    resetCallbacks(klass, "setup");
    resetCallbacks(klass, "teardown");
  });

  it("records a raising teardown callback as a failure instead of propagating", () => {
    const klass = testCase();
    const test = runningTest();
    const raised = new TypeError("boom");
    teardown.call(klass, () => {
      throw raised;
    });

    afterTeardown.call(klass, test);

    expect(test.failures.length).toBe(1);
    const failure = test.failures[0];
    expect(failure).toBeInstanceOf(UnexpectedError);
    expect((failure as UnexpectedError).error).toBe(raised);
    resetCallbacks(klass, "teardown");
  });

  it("records a failed assertion in a teardown callback as itself", () => {
    const klass = testCase();
    const test = runningTest();
    const raised = new Assertion("nope");
    teardown.call(klass, () => {
      throw raised;
    });

    afterTeardown.call(klass, test);

    expect(test.failures[0]).toBe(raised);
    resetCallbacks(klass, "teardown");
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
    teardown.call(TestCase, () => {
      throw raised;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() =>
        TestCase.afterTeardown({
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
      resetCallbacks(TestCase, "teardown");
    }
  });
});
