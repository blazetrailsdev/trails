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
import { afterEach, beforeEach, expect } from "vitest";
import type { TestContext } from "vitest";
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
  // include ActiveSupport::Testing::TaggedLogging (test_case.rb:144)
  static setTaggedLogger = setTaggedLogger;
  static taggedLogger = taggedLogger;

  // prepend ActiveSupport::Testing::SetupAndTeardown (test_case.rb:145)
  static setup = setup;
  static teardown = teardown;

  /**
   * The `before_setup` chain the two `prepend`s produce (test_case.rb:144-145):
   * `SetupAndTeardown#before_setup` opens with `super`, which reaches
   * `TaggedLogging#before_setup`, and only then runs the `:setup` callbacks.
   * `TestsWithoutAssertions` defines no `before_setup`.
   */
  static beforeSetup(): void {
    taggedLoggingBeforeSetup();
    setupAndTeardownBeforeSetup.call(TestCase);
  }

  /**
   * The `after_teardown` chain (test_case.rb:145-146, 151), in ancestor order:
   * `TestsWithoutAssertions#after_teardown` — prepended last, so it comes
   * first — opens with `super`, which reaches `SetupAndTeardown#after_teardown`
   * (the `:teardown` callbacks), whose own trailing `super` reaches
   * `TimeHelpers#after_teardown`. Its assertion check runs on the way back out,
   * last.
   */
  static afterTeardown(test: RunningTest): void {
    setupAndTeardownAfterTeardown.call(TestCase, test);
    timeHelpersAfterTeardown();
    testsWithoutAssertionsAfterTeardown({
      ...test,
      // Minitest's `error?` is `failures.any? { UnexpectedError === _1 }`, so a
      // teardown that raised suppresses the missing-assertion warning.
      error: test.error || test.failures.some((f) => f instanceof UnexpectedError),
    });
    // `self.failures` is the list Minitest reports the test on; vitest has no
    // per-test failure list, so what makes the runner see the failure is the
    // hook raising it.
    if (test.failures.length > 0) throw test.failures[0];
  }

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
}

// `prepend` runs `SetupAndTeardown.prepended` (setup_and_teardown.rb:21), which
// is what defines the `:setup` / `:teardown` callback chains on the receiver.
setupAndTeardownPrepended(TestCase);

beforeEach(() => {
  TestCase.beforeSetup();
});

afterEach((context: TestContext) => {
  TestCase.afterTeardown(_runningTest(context));
});

/**
 * The Minitest instance Ruby reads `assertions` / `skipped?` / `error?` /
 * `name` / `method(name).source_location` off, read from vitest's per-test
 * context instead.
 *
 * @noRailsEquivalent PERMANENT — bridges the runner's task onto the `self` of
 * `tests_without_assertions.rb`, a `Minitest::Test` that lives in the minitest
 * gem and so has no file in the mapped Rails source.
 */
function _runningTest(context: TestContext): RunningTest {
  const task = context.task as {
    name: string;
    mode?: string;
    location?: { line?: number };
    file?: { filepath?: string };
    result?: { state?: string; errors?: unknown[] };
  };
  return {
    assertions: expect.getState().assertionCalls ?? 0,
    skipped: task.mode === "skip" || task.mode === "todo",
    error: task.result?.state === "fail" || (task.result?.errors?.length ?? 0) > 0,
    name: task.name,
    sourceLocation: [task.file?.filepath ?? "", task.location?.line ?? 0],
    failures: [],
  };
}
