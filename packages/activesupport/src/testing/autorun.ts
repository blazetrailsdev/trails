import { afterEach, beforeEach, expect } from "vitest";
import type { TestContext } from "vitest";
import { Time } from "@blazetrails/date";
import { safeConstantize } from "../inflector.js";
import { TestCase } from "../test-case.js";
import { Skip, UnexpectedError, _takeAssertions } from "./assertions.js";

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
  await testCase.beforeSetup();
});

afterEach(async (context: TestContext) => {
  const testCase = context.testCase;
  if (testCase === undefined) return;
  const task = context.task as {
    mode?: string;
    location?: { line?: number };
    file?: { filepath?: string };
    result?: { state?: string; errors?: unknown[] };
  };
  testCase.assertions = (expect.getState().assertionCalls ?? 0) + _takeAssertions();
  testCase.sourceLocation = [task.file?.filepath ?? "", task.location?.line ?? 0];
  if (task.mode === "skip" || task.mode === "todo") testCase.failures.push(new Skip());
  if (task.result?.state === "fail" || (task.result?.errors?.length ?? 0) > 0) {
    testCase.failures.push(new UnexpectedError(new Error(context.task.name)));
  }
  const failures = testCase.failures.length;
  await testCase.afterTeardown();
  if (testCase.failures.length > failures) throw testCase.failures[failures];
});

expect.addEqualityTesters([
  function timeEquals(a: unknown, b: unknown): boolean | undefined {
    if (!(a instanceof Time) || !(b instanceof Time)) return undefined;
    return a.toR().cmp(b.toR()) === 0;
  },
]);
