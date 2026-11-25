import type { Pathname } from "@blazetrails/ruby-compat/pathname";
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
  Assertions,
  assertNotEmpty,
  assertNotEqual,
  assertNotInDelta,
  assertNotInEpsilon,
  assertNotIncludes,
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
import { ConstantStubbing } from "./testing/constant-stubbing.js";
import { Deprecation } from "./testing/deprecation.js";
import { TimeHelpers } from "./testing/time-helpers.js";
import { FileFixtures } from "./testing/file-fixtures.js";
import "./executor/test-helper.js";
import "./current-attributes/test-helper.js";
import "./execution-context/test-helper.js";
import { include, type Extended } from "@blazetrails/ruby-compat/include";
import { prepend } from "@blazetrails/ruby-compat/include";
import { rbAnyToS, rbModMethodDefined, rbModToS } from "@blazetrails/ruby-compat/object";
import { RuntimeError } from "@blazetrails/ruby-compat/runtime-error";

export class TestCase extends Minitest.Test {
  declare static fileFixturePath: string | Pathname | null;
  declare readonly fileFixturePath: string | Pathname | null;
  declare static isFileFixturePath: () => boolean;
  declare isFileFixturePath: () => boolean;
  declare fileFixture: typeof FileFixtures.fileFixture;
  declare assertNot: typeof Assertions.assertNot;
  declare assertRaises: typeof Assertions.assertRaises;
  declare assertRaise: typeof Assertions.assertRaise;
  declare assertNothingRaised: typeof Assertions.assertNothingRaised;
  declare assertDifference: typeof Assertions.assertDifference;
  declare assertNoDifference: typeof Assertions.assertNoDifference;
  declare assertChanges: typeof Assertions.assertChanges;
  declare assertNoChanges: typeof Assertions.assertNoChanges;
  declare assertNoErrorReported: typeof ErrorReporterAssertions.assertNoErrorReported;
  declare assertErrorReported: typeof ErrorReporterAssertions.assertErrorReported;
  declare assertDeprecated: typeof Deprecation.assertDeprecated;
  declare assertNotDeprecated: typeof Deprecation.assertNotDeprecated;
  declare collectDeprecations: typeof Deprecation.collectDeprecations;
  declare stubConst: typeof ConstantStubbing.stubConst;
  declare travel: typeof TimeHelpers.travel;
  declare travelTo: typeof TimeHelpers.travelTo;
  declare travelBack: typeof TimeHelpers.travelBack;
  declare unfreezeTime: typeof TimeHelpers.unfreezeTime;
  declare freezeTime: typeof TimeHelpers.freezeTime;
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

  declare assertNotEmpty: typeof assertNotEmpty;
  declare assertNotEqual: typeof assertNotEqual;
  declare assertNotInDelta: typeof assertNotInDelta;
  declare assertNotInEpsilon: typeof assertNotInEpsilon;
  declare assertNotIncludes: typeof assertNotIncludes;
  declare assertNotInstanceOf: typeof assertNotInstanceOf;
  declare assertNotKindOf: typeof assertNotKindOf;
  declare assertNoMatch: typeof assertNoMatch;
  declare assertNotNil: typeof assertNotNil;
  declare assertNotOperator: typeof assertNotOperator;
  declare assertNotPredicate: typeof assertNotPredicate;
  declare assertNotRespondTo: typeof assertNotRespondTo;
  declare assertNotSame: typeof assertNotSame;
}

include(TestCase, TaggedLogging);
prepend(TestCase, {
  beforeSetup: setupAndTeardownBeforeSetup,
  afterTeardown: setupAndTeardownAfterTeardown,
});
setupAndTeardownPrepended(TestCase);
prepend(TestCase, { afterTeardown: testsWithoutAssertionsAfterTeardown });
include(TestCase, Assertions);
include(TestCase, ErrorReporterAssertions);
include(TestCase, Deprecation);
include(TestCase, ConstantStubbing);
include(TestCase, TimeHelpers);
include(TestCase, FileFixtures);

Object.assign(TestCase.prototype, {
  assertNotEmpty,
  assertNotEqual,
  assertNotInDelta,
  assertNotInEpsilon,
  assertNotIncludes,
  assertNotInstanceOf,
  assertNotKindOf,
  assertNoMatch,
  assertNotNil,
  assertNotOperator,
  assertNotPredicate,
  assertNotRespondTo,
  assertNotSame,
});

ActiveSupport.TestCase = TestCase;

runLoadHooks("active_support_test_case", TestCase);
