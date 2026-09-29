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

const runningTestCases = new WeakMap<object, TestCase>();

beforeEach(async (context: TestContext) => {
  _takeAssertions();
  const testCase = new (_testCaseClass(context.task))(context.task.name);
  runningTestCases.set(context.task, testCase);
  context.testCase = testCase;
  await testCase.beforeSetup?.();
  TestCase.beforeSetup();
});

afterEach(async (context: TestContext) => {
  const testCase = runningTestCases.get(context.task);
  runningTestCases.delete(context.task);
  const test = _runningTest(context);
  try {
    TestCase.afterTeardown(test);
  } finally {
    await testCase?.afterTeardown?.(test);
  }
});

/** @noRailsEquivalent PERMANENT */
function _testCaseClass(task: TestContext["task"]): typeof TestCase {
  for (let suite = task.suite; suite != null; suite = suite.suite) {
    const klass = safeConstantize(suite.name);
    if (typeof klass === "function" && klass.prototype instanceof TestCase) {
      return klass as typeof TestCase;
    }
  }
  return TestCase;
}

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
