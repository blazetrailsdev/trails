import { afterEach, beforeEach, expect } from "vitest";
import type { TestContext } from "vitest";
import { Time } from "@blazetrails/date";
import { runLoadHooks } from "./lazy-load-hooks.js";
import {
  testOrder as activeSupportTestOrder,
  setTestOrder as activeSupportSetTestOrder,
} from "./active-support.js";
import {
  setTaggedLogger,
  beforeSetup as taggedLoggingBeforeSetup,
  taggedLogger,
} from "./testing/tagged-logging.js";
import {
  prepended as setupAndTeardownPrepended,
  setup,
  teardown,
  beforeSetup as setupAndTeardownBeforeSetup,
  afterTeardown as setupAndTeardownAfterTeardown,
} from "./testing/setup-and-teardown.js";
import {
  afterTeardown as testsWithoutAssertionsAfterTeardown,
  type RunningTest,
} from "./testing/tests-without-assertions.js";
import { UnexpectedError, _takeAssertions } from "./testing/assertions.js";
import {
  assertNot,
  assertNotIncludes,
  assertRaises,
  assertRaise,
  assertNothingRaised,
  assertDifference,
  assertNoDifference,
  assertChanges,
  assertNoChanges,
} from "./testing/assertions.js";
import { assertErrorReported, assertNoErrorReported } from "./testing/error-reporter-assertions.js";
import { stubConst } from "./testing/constant-stubbing.js";
import {
  assertDeprecated,
  assertNotDeprecated,
  collectDeprecations,
} from "./testing/deprecation.js";
import {
  afterTeardown as timeHelpersAfterTeardown,
  travel,
  travelTo,
  travelBack,
  freezeTime,
  unfreezeTime,
} from "./testing/time-helpers.js";

export class TestCase {
  static setTestOrder(newOrder: string | null): void {
    activeSupportSetTestOrder(newOrder);
  }

  static get testOrder(): string {
    if (activeSupportTestOrder() == null) activeSupportSetTestOrder(":random");
    return activeSupportTestOrder()!;
  }

  static setTaggedLogger = setTaggedLogger;
  /** @internal */
  static taggedLogger = taggedLogger;

  static setup = setup;
  static teardown = teardown;

  static beforeSetup(): void {
    taggedLoggingBeforeSetup();
    setupAndTeardownBeforeSetup.call(TestCase);
  }

  static afterTeardown(test: RunningTest): void {
    setupAndTeardownAfterTeardown.call(TestCase, test);
    timeHelpersAfterTeardown();
    testsWithoutAssertionsAfterTeardown({
      ...test,
      error: test.error || test.failures.some((f) => f instanceof UnexpectedError),
    });
    if (test.failures.length > 0) throw test.failures[0];
  }

  static assertNot = assertNot;
  static assertNotIncludes = assertNotIncludes;
  static assertRaises = assertRaises;
  static assertRaise = assertRaise;
  static assertNothingRaised = assertNothingRaised;
  static assertDifference = assertDifference;
  static assertNoDifference = assertNoDifference;
  static assertChanges = assertChanges;
  static assertNoChanges = assertNoChanges;

  static assertErrorReported = assertErrorReported;
  static assertNoErrorReported = assertNoErrorReported;

  static assertDeprecated = assertDeprecated;
  static assertNotDeprecated = assertNotDeprecated;
  static collectDeprecations = collectDeprecations;

  static stubConst = stubConst;

  static travel = travel;
  static travelTo = travelTo;
  static travelBack = travelBack;
  static freezeTime = freezeTime;
  static unfreezeTime = unfreezeTime;
}

setupAndTeardownPrepended(TestCase);

runLoadHooks("active_support_test_case", TestCase);

beforeEach(() => {
  _takeAssertions();
  TestCase.beforeSetup();
});

afterEach((context: TestContext) => {
  TestCase.afterTeardown(_runningTest(context));
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
