/**
 * Mirrors: active_support/testing/tagged_logging.rb
 *
 * Logs a "PostsControllerTest: test name" heading before each test to make
 * test.log easier to search and follow along with.
 *
 * `before_setup` (tagged_logging.rb:10-19) is Minitest lifecycle: Ruby mixes
 * the module into the test case and `super`s up the hook chain. The receiver
 * here is `TestCase` (test-case.ts, the port of test_case.rb), whose
 * `include` of this module — test_case.rb:144 — installs `beforeSetup` as the
 * suite's `beforeEach`.
 */
import { trailsLogger } from "../trails-logger-slot.js";

type TaggedLogger = {
  warn(msg: unknown): void;
  debug(msg: unknown): void;
  info?(msg: unknown): unknown;
  readonly "info?"?: boolean;
};

let taggedLoggerValue: TaggedLogger | null = null;

/**
 * Mirrors `attr_writer :tagged_logger` (tagged_logging.rb:8) — points the
 * per-test logging at a logger of the caller's choosing.
 */
export function setTaggedLogger(logger: TaggedLogger | null): void {
  taggedLoggerValue = logger;
}

/**
 * Mirrors `before_setup` (tagged_logging.rb:10-19) — logs the
 * `"<TestCase>: <name>"` heading, fenced by a divider of its own width, before
 * each test. Ruby's trailing `super` continues the Minitest hook chain; the
 * vitest `beforeEach` that calls this has no chain to continue.
 */
export function beforeSetup(): void {
  const logger = taggedLogger();
  if (logger && logger["info?"]) {
    const heading = _testCaseIdentity(": ");
    const divider = "-".repeat(heading.length);
    logger.info?.(divider);
    logger.info?.(heading);
    logger.info?.(divider);
  }
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
 * Ruby reads `self.class`/`name` off the Minitest test-case instance the module
 * is mixed into; the ported assertions are free functions with no such
 * receiver, so the same two values come from the test runner.
 *
 * `separator` is the punctuation Ruby writes between the pair at each site:
 * `" - "` for the assertion warning (assertions.rb:285) and `": "` for
 * `before_setup`'s heading (tagged_logging.rb:12).
 * @internal
 */
export function _testCaseIdentity(separator = " - "): string {
  const currentTestName =
    (globalThis as { expect?: { getState?(): { currentTestName?: string } } }).expect?.getState?.()
      ?.currentTestName ?? "";
  const sep = currentTestName.lastIndexOf(" > ");
  if (sep === -1) return currentTestName;
  return `${currentTestName.slice(0, sep)}${separator}${currentTestName.slice(sep + 3)}`;
}
