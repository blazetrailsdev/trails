import { afterEach, beforeEach, expect } from "vitest";
import type { TestContext } from "vitest";
import { getFn, setFn } from "vitest/suite";
import { Time } from "@blazetrails/date";
import {
  RuntimeError,
  publicInstanceMethods,
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

type Matcher = RegExp | ((desc: string, ...additional: string[]) => boolean);
type DescribedSuite = { name: string; file?: unknown; suite?: DescribedSuite };
type SpecClass = typeof TestCase & { desc?: string; children?: SpecClass[] };

/** @noRailsEquivalent PERMANENT */
export const TYPES: [Matcher, typeof TestCase][] = [[/(?:)/, TestCase]];

/** @noRailsEquivalent PERMANENT */
export function registerSpecType(
  matcherOrKlass: Matcher | typeof TestCase,
  klass: typeof TestCase | undefined = undefined,
  block: Matcher | undefined = undefined,
): void {
  let matcher: Matcher;
  if (block) {
    [matcher, klass] = [block, matcherOrKlass as typeof TestCase];
  } else {
    matcher = matcherOrKlass as Matcher;
  }
  TYPES.unshift([matcher, klass!]);
}

/** @noRailsEquivalent PERMANENT */
export function specType(desc: string, ...additional: string[]): typeof TestCase {
  return TYPES.find(([matcher]) => {
    if (typeof matcher === "function") {
      return matcher(desc, ...additional);
    } else {
      return matcher.test(String(desc));
    }
  })![1];
}

function children(klass: SpecClass): SpecClass[] {
  if (!Object.hasOwn(klass, "children")) klass.children = [];
  return klass.children!;
}

function nukeTestMethodsBang(klass: SpecClass): void {
  for (const name of publicInstanceMethods(klass).filter((n) => /^test_/.test(n))) {
    Object.defineProperty(klass.prototype, name, { value: undefined, configurable: true });
  }
}

function create(sclas: SpecClass, name: string, desc: string): SpecClass {
  const cls: SpecClass = class extends sclas {};
  Object.defineProperty(cls, "name", { value: name });
  cls.desc = desc;
  nukeTestMethodsBang(cls);

  children(sclas).push(cls);

  return cls;
}

const described = new WeakMap<object, SpecClass>();
let fileClass: SpecClass | undefined;

/** @noRailsEquivalent PERMANENT */
export function describe(suite: DescribedSuite | undefined): SpecClass {
  if (suite === undefined || suite.file === suite) {
    return (fileClass ??= create(specType(""), "", ""));
  }
  let cls = described.get(suite);
  if (cls === undefined) {
    const constant = safeConstantize(suite.name);
    if (typeof constant === "function" && constant.prototype instanceof TestCase) {
      cls = constant as SpecClass;
    } else {
      const parent =
        suite.suite === undefined || suite.suite.file === suite.suite ? undefined : suite.suite;
      const stackLast = parent === undefined ? fileClass : describe(parent);
      const name = [stackLast?.name, suite.name].filter((n) => n != null && n !== "").join("::");
      const sclas = stackLast || specType(suite.name);
      cls = create(sclas, name, suite.name);
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
