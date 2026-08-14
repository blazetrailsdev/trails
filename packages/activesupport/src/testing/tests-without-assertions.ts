/**
 * Mirrors: active_support/testing/tests_without_assertions.rb
 *
 * Warns when a test case does not perform any assertions.
 *
 * This is helpful in detecting broken tests that do not perform intended
 * assertions.
 */

/**
 * The running test — the Minitest instance Ruby reads `assertions`,
 * `skipped?`, `error?`, `name` and `method(name).source_location` off. The
 * ported hook is a free function with no such receiver, so the runner's task
 * is handed to it instead; test-case.ts builds this from vitest's per-test
 * context.
 *
 * @noRailsEquivalent PERMANENT — a structural stand-in for the `self` of a
 * `Minitest::Test`, which lives in the minitest gem and so has no file in the
 * mapped Rails source to match against.
 */
export interface RunningTest {
  assertions: number;
  skipped: boolean;
  error: boolean;
  name: string;
  sourceLocation: [string, number];
}

/** Mirrors `after_teardown` (tests_without_assertions.rb:10-17). */
export function afterTeardown(test: RunningTest): void {
  if (test.assertions === 0 && !test.skipped && !test.error) {
    const [file, line] = test.sourceLocation;
    warn(`Test is missing assertions: \`${test.name}\` ${file}:${line}`);
  }
}

/**
 * Ruby's `Kernel#warn`, which writes to stderr.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core method, with no file in the
 * mapped Rails source to match against.
 */
function warn(message: string): void {
  console.warn(message);
}
