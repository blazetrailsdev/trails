/**
 * Mirrors: active_support/testing/setup_and_teardown.rb
 *
 * Adds support for `setup` and `teardown` callbacks. These callbacks serve as
 * a replacement to overwriting the `#setup` and `#teardown` methods of your
 * TestCase.
 *
 *     class ExampleTest extends TestCase {
 *       static {
 *         this.setup(() => {
 *           // ...
 *         });
 *
 *         this.teardown(() => {
 *           // ...
 *         });
 *       }
 *     }
 *
 * Ruby `prepend`s this module into `ActiveSupport::TestCase`
 * (test_case.rb:145), which puts `before_setup` / `after_teardown` ahead of the
 * included modules' own hooks in the ancestor chain. The trails receiver
 * expresses the include list as assignments, so that ordering lives in the
 * hook installation at the bottom of test-case.ts instead.
 */
import { defineCallbacks, setCallback, runCallbacks } from "../callbacks.js";
import type { FilterListEntry } from "../callbacks.js";
import { Assertion, UnexpectedError } from "./assertions.js";
import type { RunningTest } from "./tests-without-assertions.js";

/**
 * Mirrors `self.prepended(klass)` (setup_and_teardown.rb:21-25):
 * `klass.include ActiveSupport::Callbacks` — `defineCallbacks` is that
 * include's only observable effect here — then `define_callbacks :setup,
 * :teardown`. Ruby's `klass.extend ClassMethods` is the `setup` / `teardown`
 * assignment on the receiver.
 */
export function prepended(klass: object): void {
  defineCallbacks(klass, "setup");
  defineCallbacks(klass, "teardown");
}

/**
 * Add a callback, which runs before `TestCase#setup`
 * (setup_and_teardown.rb:29-31).
 */
export function setup(this: object, ...args: FilterListEntry<object>[]): void {
  setCallback(this, "setup", "before", ...args);
}

/**
 * Add a callback, which runs after `TestCase#teardown`
 * (setup_and_teardown.rb:34-36).
 */
export function teardown(this: object, ...args: FilterListEntry<object>[]): void {
  setCallback(this, "teardown", "after", ...args);
}

/** Mirrors `before_setup` (setup_and_teardown.rb:39-42). */
export function beforeSetup(this: object): void {
  runCallbacks(this, "setup");
}

/**
 * Mirrors `after_teardown` (setup_and_teardown.rb:44-53). A teardown callback
 * that raises is recorded as a failure rather than propagated, so the rest of
 * the `after_teardown` chain still runs.
 *
 * Ruby's `self` is one object: the Minitest instance both `run_callbacks` and
 * `self.failures` (setup_and_teardown.rb:48,50) resolve against. Trails splits
 * it — the callback chains live on the receiver `prepended()` installed them
 * on, so the per-test half of that `self`, the `RunningTest` whose `failures`
 * list lives for exactly one test, is taken as an argument.
 *
 * Ruby's `rescue => e` arm reads first, but `Minitest::Assertion` descends
 * from `Exception`, not `StandardError`, so it is the second arm that takes
 * it — which is the order the `instanceof` check spells out.
 */
export function afterTeardown(this: object, test: Pick<RunningTest, "failures">): void {
  try {
    runCallbacks(this, "teardown");
  } catch (e) {
    if (e instanceof Assertion) {
      test.failures.push(e);
    } else {
      test.failures.push(new UnexpectedError(e as Error));
    }
  }
}
