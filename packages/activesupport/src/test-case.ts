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
import { UnexpectedError } from "./testing/assertions.js";
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the optional before_setup / after_teardown an included module (TestFixtures) supplies.
export interface TestCase {
  beforeSetup?(): unknown;
  afterTeardown?(test: RunningTest): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TestCase {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

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
