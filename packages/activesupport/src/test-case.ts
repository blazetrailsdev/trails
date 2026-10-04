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
  type ClassMethods as SetupAndTeardownClassMethods,
  beforeSetup as setupAndTeardownBeforeSetup,
  afterTeardown as setupAndTeardownAfterTeardown,
} from "./testing/setup-and-teardown.js";
import { afterTeardown as testsWithoutAssertionsAfterTeardown } from "./testing/tests-without-assertions.js";
import {
  Minitest,
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
import { include, type Extended } from "@blazetrails/ruby-compat/include";
import { prepend, type PrependMethod } from "@blazetrails/ruby-compat";

export class TestCase extends Minitest.Test {
  declare static fileFixturePath: string | null;
  declare readonly fileFixturePath: string | null;
  declare static isFileFixturePath: () => boolean;
  declare isFileFixturePath: () => boolean;
  declare fileFixture: typeof FileFixtures.fileFixture;
  declare static setup: Extended<typeof SetupAndTeardownClassMethods>["setup"];
  declare static teardown: Extended<typeof SetupAndTeardownClassMethods>["teardown"];

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

  override beforeSetup(): unknown {
    const result = super.beforeSetup();
    return result instanceof Promise
      ? result.then(taggedLoggingBeforeSetup)
      : taggedLoggingBeforeSetup();
  }

  override afterTeardown(): unknown {
    let raised: [unknown] | undefined;
    try {
      timeHelpersAfterTeardown();
    } catch (e) {
      raised = [e];
    }
    const afterSuper = (): void => {
      if (raised) throw raised[0];
    };
    const result = super.afterTeardown();
    return result instanceof Promise ? result.then(afterSuper) : afterSuper();
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
prepend(TestCase.prototype, {
  beforeSetup: setupAndTeardownBeforeSetup as PrependMethod,
  afterTeardown: setupAndTeardownAfterTeardown as PrependMethod,
});
setupAndTeardownPrepended(TestCase);
prepend(TestCase.prototype, {
  afterTeardown: testsWithoutAssertionsAfterTeardown as PrependMethod,
});

runLoadHooks("active_support_test_case", TestCase);
