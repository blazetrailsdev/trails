/**
 * Mirrors: active_support/testing/tagged_logging.rb
 *
 * Logs a "PostsControllerTest: test name" heading before each test to make
 * test.log easier to search and follow along with.
 *
 * `before_setup` (tagged_logging.rb:10-19) is Minitest lifecycle — vitest has
 * no per-test-case hook a module can be mixed into, so it is not ported; the
 * skip is registered in `SKIP_GROUPS` with that reason.
 */
import { trailsLogger } from "../trails-logger-slot.js";

type TaggedLogger = { warn(msg: unknown): void; debug(msg: unknown): void };

let taggedLoggerValue: TaggedLogger | null = null;

/**
 * Mirrors `attr_writer :tagged_logger` (tagged_logging.rb:8) — points the
 * per-test logging at a logger of the caller's choosing.
 */
export function setTaggedLogger(logger: TaggedLogger | null): void {
  taggedLoggerValue = logger;
}

/**
 * Mirrors the private `tagged_logger` (tagged_logging.rb:22-24) —
 * `@tagged_logger ||= (defined?(Rails.logger) && Rails.logger)`, whose
 * late-bound `Trails.logger` is the `trailsLogger` slot here.
 *
 * Ruby's `||=` memoizes into the Minitest instance, which lives for one test;
 * the equivalent storage here is module-global, so memoizing would pin the
 * first test's logger for the whole run — the writer's value takes precedence
 * and the slot is re-read otherwise.
 * @internal
 */
export function taggedLogger(): TaggedLogger | null {
  return taggedLoggerValue ?? trailsLogger;
}

/**
 * The `"#{self.class} - #{name}"` pair Ruby reads off the running Minitest
 * instance (assertions.rb:285, tagged_logging.rb:12). These assertions are free
 * functions, so the identity comes from vitest's running task instead —
 * `currentTestName` is `"<describe> > <test>"`, whose halves are Minitest's
 * test-case class and test name.
 *
 * @internal
 * @noRailsEquivalent PERMANENT — Ruby reads `self.class`/`name` off the Minitest test-case
 * instance the module is mixed into; TypeScript's ported assertions have no
 * such receiver, so the same two values are read from the test runner.
 */
export function _testCaseIdentity(): string {
  const currentTestName =
    (globalThis as { expect?: { getState?(): { currentTestName?: string } } }).expect?.getState?.()
      ?.currentTestName ?? "";
  const separator = currentTestName.lastIndexOf(" > ");
  if (separator === -1) return currentTestName;
  return `${currentTestName.slice(0, separator)} - ${currentTestName.slice(separator + 3)}`;
}
