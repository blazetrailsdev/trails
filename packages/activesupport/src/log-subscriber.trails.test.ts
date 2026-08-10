import { describe, it, expect, afterEach } from "vitest";
import { LogSubscriber } from "./log-subscriber.js";
import { _setTrailsLogger } from "./trails-logger-slot.js";
import type { Logger } from "./logger.js";

/**
 * `LogSubscriber.logger`'s application-logger fallback
 * (`activesupport/lib/active_support/log_subscriber.rb:93-97`). Rails has no
 * test for it — `defined?(Rails)` is false in its own suite — so the coverage
 * is trails-only and lives here rather than in the ported `log-subscriber.test.ts`.
 */
describe("LogSubscriber.logger fallback", () => {
  afterEach(() => {
    LogSubscriber.logger = null;
    _setTrailsLogger(null);
  });

  it("falls back to Trails.logger when nothing has been assigned", () => {
    const appLogger = { warn() {}, debug() {} };
    _setTrailsLogger(appLogger);
    expect(LogSubscriber.logger).toBe(appLogger);
  });

  it("answers null while there is no application logger", () => {
    expect(LogSubscriber.logger).toBeNull();
  });

  it("lets an explicit assignment win over the fallback", () => {
    const appLogger = { warn() {}, debug() {} };
    const own = { warn() {}, debug() {} } as unknown as Logger;
    _setTrailsLogger(appLogger);
    LogSubscriber.logger = own;
    expect(LogSubscriber.logger).toBe(own);
  });

  it("memoizes with Rails' `||=`, so a later Trails.logger does not retroactively win", () => {
    const first = { warn() {}, debug() {} };
    _setTrailsLogger(first);
    expect(LogSubscriber.logger).toBe(first);

    _setTrailsLogger({ warn() {}, debug() {} });
    expect(LogSubscriber.logger).toBe(first);
  });
});
