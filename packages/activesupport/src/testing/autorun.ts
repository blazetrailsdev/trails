import { afterEach, beforeEach, expect } from "vitest";
import type { TestContext } from "vitest";
import { getFn, setFn } from "vitest/suite";
import { Time } from "@blazetrails/date";
import {
  RuntimeError,
  iseqLocationSetup,
  rbModMethodDefined,
  rbModToS,
} from "@blazetrails/ruby-compat";
import { safeConstantize } from "../inflector.js";
import { TestCase } from "../test-case.js";
import { Assertion, Skip, UnexpectedError, _takeAssertions } from "./assertions.js";

declare module "vitest" {
  interface TestContext {
    testCase: TestCase;
  }
}

type Matcher = RegExp | ((desc: string) => boolean);
type DescribedSuite = { name: string; file?: unknown; suite?: DescribedSuite };

/** @noRailsEquivalent PERMANENT */
export const TYPES: [Matcher, typeof TestCase][] = [[/(?:)/, TestCase]];

/** @noRailsEquivalent PERMANENT */
export function registerSpecType(matcher: Matcher, klass: typeof TestCase): void {
  TYPES.unshift([matcher, klass]);
}

/** @noRailsEquivalent PERMANENT */
export function specType(desc: string): typeof TestCase {
  return TYPES.find(([matcher]) =>
    typeof matcher === "function" ? matcher(desc) : matcher.test(String(desc)),
  )![1];
}

function create(sclas: typeof TestCase, name: string): typeof TestCase {
  const cls = class extends sclas {};
  Object.defineProperty(cls, "name", { value: name });
  return cls;
}

const described = new WeakMap<object, typeof TestCase>();
let fileClass: typeof TestCase | undefined;

/** @noRailsEquivalent PERMANENT */
export function describe(suite: DescribedSuite | undefined): typeof TestCase {
  if (suite === undefined || suite.file === suite) {
    return (fileClass ??= create(specType(""), ""));
  }
  let cls = described.get(suite);
  if (cls === undefined) {
    const constant = safeConstantize(suite.name);
    if (typeof constant === "function" && constant.prototype instanceof TestCase) {
      cls = constant as typeof TestCase;
    } else {
      const sclas = describe(suite.suite);
      cls = create(sclas, [sclas.name, suite.name].filter((n) => n !== "").join("::"));
    }
    described.set(suite, cls);
  }
  return cls;
}

const capturing = new WeakSet<object>();
const captured = new WeakMap<TestCase, { from: number; at: number; count: number }>();

beforeEach(async (context: TestContext) => {
  _takeAssertions();
  const klass = describe(context.task.suite);
  const testName = `test_${context.task.name.replace(/\s+/g, "_")}`;
  const defined = rbModMethodDefined(klass, testName);
  if (defined) throw new RuntimeError(`${testName} is already defined in ${rbModToS(klass)}`);
  const testCase = (context.testCase = new klass(testName));
  captured.set(testCase, { from: context.task.result?.errors?.length ?? 0, at: -1, count: 0 });
  const run = getFn(context.task);
  if (!capturing.has(run)) {
    const captureExceptions = async (): Promise<void> => {
      try {
        await run();
      } catch (e) {
        if ((e as { code?: unknown } | null)?.code !== "VITEST_PENDING") {
          const body = captured.get(context.testCase)!;
          body.at = context.task.result?.errors?.length ?? 0;
          body.count = Array.isArray(e) ? e.length : 1;
          context.testCase.failures.push(
            e instanceof Assertion ? e : new UnexpectedError(e as Error),
          );
        }
        throw e;
      }
    };
    capturing.add(captureExceptions);
    setFn(context.task, captureExceptions);
  }
  const test = getFn(context.task);
  iseqLocationSetup(test, context.task.file.filepath, context.task.location?.line ?? 0);
  Object.defineProperty(testCase, testName, { value: test, configurable: true });
  await testCase.beforeSetup();
});

afterEach(async (context: TestContext) => {
  const testCase = context.testCase;
  if (testCase === undefined) return;
  const task = context.task as {
    mode?: string;
    result?: { state?: string; errors?: unknown[] };
  };
  testCase.assertions = (expect.getState().assertionCalls ?? 0) + _takeAssertions();
  const { from, at, count } = captured.get(testCase) ?? { from: 0, at: -1, count: 0 };
  (task.result?.errors ?? []).forEach((e, i) => {
    if (i < from || (i >= at && i < at + count)) return;
    testCase.failures.push(new UnexpectedError(e as Error));
  });
  if (task.mode === "skip" || task.mode === "todo" || task.result?.state === "skip") {
    testCase.failures.push(new Skip());
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
