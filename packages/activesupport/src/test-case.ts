/**
 * Mirrors: active_support/test_case.rb
 *
 * `ActiveSupport::TestCase` is the receiver Rails' testing modules are mixed
 * into (test_case.rb:144-153), and the single place that list is written down.
 * Minitest gives Ruby a per-test instance to mix into; vitest has no such
 * object, so the settled mixin idiom applies at the class itself — the module
 * functions are assigned to `TestCase` under their Rails names, one assignment
 * per `include`, in Rails' order.
 *
 * Loading this file is the `include` of `ActiveSupport::Testing::TaggedLogging`
 * (test_case.rb:144): Ruby's include hands Minitest the module's `before_setup`
 * hook, and the `beforeEach` at the bottom of this file is that same
 * installation for vitest. It is registered once, as a setup file of every
 * vitest project, in place of the per-project TaggedLogging wiring that stood
 * in for the receiver before.
 *
 * `test_case.rb` requires minitest, and `active_support.rb:92` reaches it
 * through `autoload :TestCase`, so a booting app never loads the runner. An
 * ESM re-export is eager, so this file is deliberately absent from `index.ts`
 * — importing it there would pull vitest into every consumer of the package.
 */
import { beforeEach } from "vitest";
import { setTaggedLogger, beforeSetup, taggedLogger } from "./testing/tagged-logging.js";
import {
  assertNot,
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
  afterTeardown,
  travel,
  travelTo,
  travelBack,
  freezeTime,
  unfreezeTime,
} from "./testing/time-helpers.js";

export class TestCase {
  // include ActiveSupport::Testing::TaggedLogging (test_case.rb:144)
  static setTaggedLogger = setTaggedLogger;
  static beforeSetup = beforeSetup;
  /** @internal */
  static taggedLogger = taggedLogger;

  // include ActiveSupport::Testing::Assertions (test_case.rb:147)
  static assertNot = assertNot;
  static assertRaises = assertRaises;
  static assertRaise = assertRaise;
  static assertNothingRaised = assertNothingRaised;
  static assertDifference = assertDifference;
  static assertNoDifference = assertNoDifference;
  static assertChanges = assertChanges;
  static assertNoChanges = assertNoChanges;

  // include ActiveSupport::Testing::ErrorReporterAssertions (test_case.rb:148)
  static assertErrorReported = assertErrorReported;
  static assertNoErrorReported = assertNoErrorReported;

  // include ActiveSupport::Testing::Deprecation (test_case.rb:149)
  static assertDeprecated = assertDeprecated;
  static assertNotDeprecated = assertNotDeprecated;
  static collectDeprecations = collectDeprecations;

  // include ActiveSupport::Testing::ConstantStubbing (test_case.rb:150)
  static stubConst = stubConst;

  // include ActiveSupport::Testing::TimeHelpers (test_case.rb:151)
  static travel = travel;
  static travelTo = travelTo;
  static travelBack = travelBack;
  static freezeTime = freezeTime;
  static unfreezeTime = unfreezeTime;
  static afterTeardown = afterTeardown;
}

beforeEach(() => {
  TestCase.beforeSetup();
});
