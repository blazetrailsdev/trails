import { afterEach, beforeEach, expect } from "vitest";
import type { TestContext } from "vitest";
import { Time } from "@blazetrails/date";
import { safeConstantize } from "../inflector.js";
import { TestCase } from "../test-case.js";
import { _takeAssertions } from "./assertions.js";
import type { RunningTest } from "./tests-without-assertions.js";

declare module "vitest" {
  interface TestContext {
    testCase: TestCase;
  }
}

beforeEach(async (context: TestContext) => {
  _takeAssertions();
  let klass = TestCase;
  for (let suite = context.task.suite; suite != null && klass === TestCase; suite = suite.suite) {
    const constant = safeConstantize(suite.name);
    if (typeof constant === "function" && constant.prototype instanceof TestCase) {
      klass = constant as typeof TestCase;
    }
  }
  const testCase = (context.testCase = new klass(context.task.name));
  await testCase.beforeSetup?.();
  TestCase.beforeSetup();
});

afterEach(async (context: TestContext) => {
  const test = _runningTest(context);
  try {
    TestCase.afterTeardown(test);
  } finally {
    await context.testCase?.afterTeardown?.(test);
  }
  if (test.failures.length > 0) throw test.failures[0];
});

/** @noRailsEquivalent PERMANENT */
function _runningTest(context: TestContext): RunningTest {
  const task = context.task as {
    name: string;
    mode?: string;
    location?: { line?: number };
    file?: { filepath?: string };
    result?: { state?: string; errors?: unknown[] };
  };
  return {
    assertions: (expect.getState().assertionCalls ?? 0) + _takeAssertions(),
    skipped: task.mode === "skip" || task.mode === "todo",
    error: task.result?.state === "fail" || (task.result?.errors?.length ?? 0) > 0,
    name: task.name,
    sourceLocation: [task.file?.filepath ?? "", task.location?.line ?? 0],
    failures: [],
  };
}

expect.addEqualityTesters([
  function timeEquals(a: unknown, b: unknown): boolean | undefined {
    if (!(a instanceof Time) || !(b instanceof Time)) return undefined;
    return a.toR().cmp(b.toR()) === 0;
  },
]);
