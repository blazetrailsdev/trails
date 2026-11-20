import type { Pathname } from "@blazetrails/ruby-compat";
import { runLoadHooks } from "./lazy-load-hooks.js";
import { ActiveSupport } from "./namespaces.js";
import {
  testOrder as activeSupportTestOrder,
  setTestOrder as activeSupportSetTestOrder,
} from "./active-support.js";
import { setTaggedLogger, taggedLogger, TaggedLogging } from "./testing/tagged-logging.js";
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
  assertNotEmpty,
  assertNotEqual,
  assertNotInDelta,
  assertNotInEpsilon,
  assertNotInstanceOf,
  assertNotKindOf,
  assertNoMatch,
  assertNotNil,
  assertNotOperator,
  assertNotPredicate,
  assertNotRespondTo,
  assertNotSame,
} from "./testing/assertions.js";
import { ErrorReporterAssertions } from "./testing/error-reporter-assertions.js";
import { stubConst } from "./testing/constant-stubbing.js";
import {
  assertDeprecated,
  assertNotDeprecated,
  collectDeprecations,
} from "./testing/deprecation.js";
import { TimeHelpers } from "./testing/time-helpers.js";
import { FileFixtures } from "./testing/file-fixtures.js";
import "./executor/test-helper.js";
import "./current-attributes/test-helper.js";
import "./execution-context/test-helper.js";
import { include, type Extended } from "@blazetrails/ruby-compat/include";
import {
  prepend,
  rbAnyToS,
  rbModMethodDefined,
  rbModToS,
  RuntimeError,
} from "@blazetrails/ruby-compat";

export class TestCase extends Minitest.Test {
  declare static fileFixturePath: string | Pathname | null;
  declare readonly fileFixturePath: string | Pathname | null;
  declare static isFileFixturePath: () => boolean;
  declare isFileFixturePath: () => boolean;
  declare fileFixture: typeof FileFixtures.fileFixture;
  declare assertNoErrorReported: typeof ErrorReporterAssertions.assertNoErrorReported;
  declare assertErrorReported: typeof ErrorReporterAssertions.assertErrorReported;
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

  static test(name: string, block?: (this: TestCase) => unknown): void {
    const testName = `test_${name.replace(/\s+/g, "_")}`;
    const defined = rbModMethodDefined(this, testName);
    if (defined) throw new RuntimeError(`${testName} is already defined in ${rbModToS(this)}`);
    if (block) {
      Reflect.set(this.prototype, testName, block);
    } else {
      Reflect.set(this.prototype, testName, function (this: TestCase) {
        this.flunk(`No implementation provided for ${name}`);
      });
    }
  }

  inspect(): string {
    return rbAnyToS(this);
  }

  static setTaggedLogger = setTaggedLogger;
  /** @internal */
  static taggedLogger = taggedLogger;

  static assertNot = assertNot;
  static assertNotIncludes = assertNotIncludes;
  static assertRaises = assertRaises;
  static assertRaise = assertRaise;
  static assertNothingRaised = assertNothingRaised;
  static assertDifference = assertDifference;
  static assertNoDifference = assertNoDifference;
  static assertChanges = assertChanges;
  static assertNoChanges = assertNoChanges;

  static assertNotEmpty = assertNotEmpty;
  static assertNotEqual = assertNotEqual;
  static assertNotInDelta = assertNotInDelta;
  static assertNotInEpsilon = assertNotInEpsilon;
  static assertNotInstanceOf = assertNotInstanceOf;
  static assertNotKindOf = assertNotKindOf;
  static assertNoMatch = assertNoMatch;
  static assertNotNil = assertNotNil;
  static assertNotOperator = assertNotOperator;
  static assertNotPredicate = assertNotPredicate;
  static assertNotRespondTo = assertNotRespondTo;
  static assertNotSame = assertNotSame;

  static assertDeprecated = assertDeprecated;
  static assertNotDeprecated = assertNotDeprecated;
  static collectDeprecations = collectDeprecations;

  static stubConst = stubConst;
}

include(TestCase, TaggedLogging);
prepend(TestCase, {
  beforeSetup: setupAndTeardownBeforeSetup,
  afterTeardown: setupAndTeardownAfterTeardown,
});
setupAndTeardownPrepended(TestCase);
prepend(TestCase, { afterTeardown: testsWithoutAssertionsAfterTeardown });
include(TestCase, ErrorReporterAssertions);
include(TestCase, TimeHelpers);
include(TestCase, FileFixtures);

ActiveSupport.TestCase = TestCase;

runLoadHooks("active_support_test_case", TestCase);
