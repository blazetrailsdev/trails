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
import { FileFixtures } from "./testing/file-fixtures.js";
import { include } from "@blazetrails/ruby-compat/include";

export class TestCase {
  name: string;
  declare static fileFixturePath: string | null;
  declare readonly fileFixturePath: string | null;
  declare static isFileFixturePath: () => boolean;
  declare isFileFixturePath: () => boolean;
  declare fileFixture: typeof FileFixtures.fileFixture;

  constructor(name: string) {
    this.name = name;
  }

  get methodName(): string {
    return this.name;
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

  beforeSetup(): unknown {
    const runSetup = (): unknown => {
      taggedLoggingBeforeSetup();
      return setupAndTeardownBeforeSetup.call(this);
    };
    const result = (
      Object.getPrototypeOf(TestCase.prototype) as Partial<TestCase>
    ).beforeSetup?.call(this);
    return result instanceof Promise ? result.then(runSetup) : runSetup();
  }

  afterTeardown(test: RunningTest): unknown {
    const withoutAssertions = (): void => {
      testsWithoutAssertionsAfterTeardown({
        ...test,
        error: test.error || test.failures.some((f) => f instanceof UnexpectedError),
      });
      if (test.failures.length > 0) throw test.failures[0];
    };
    const callSuper = (): unknown => {
      timeHelpersAfterTeardown();
      const result = (
        Object.getPrototypeOf(TestCase.prototype) as Partial<TestCase>
      ).afterTeardown?.call(this, test);
      return result instanceof Promise ? result.then(withoutAssertions) : withoutAssertions();
    };
    const result = setupAndTeardownAfterTeardown.call(this, test);
    return result instanceof Promise ? result.then(callSuper) : callSuper();
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

include(TestCase, FileFixtures);
setupAndTeardownPrepended(TestCase);

runLoadHooks("active_support_test_case", TestCase);
