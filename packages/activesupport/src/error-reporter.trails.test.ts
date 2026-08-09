import { describe, it, expect } from "vitest";
import { ErrorReporter } from "./error-reporter.js";
import { ErrorSubscriber } from "./error-reporter/test-helper.js";

/**
 * Ruby's parser separates a trailing kwargs Hash from a trailing positional
 * argument, so `initialize(*subscribers, logger: nil)`
 * (`error_reporter.rb:35-38`) never has to guess. TS has no kwargs, so the
 * binding is unpicked at runtime and the two cases are told apart by
 * `subscribe`'s own duck type (`:162`). These pin that seam; Rails has no
 * counterpart because Ruby cannot reach it.
 */
describe("ErrorReporter constructor binding", () => {
  it("keeps a plain object subscriber rather than reading it as logger kwargs", () => {
    const events: unknown[] = [];
    const reporter = new ErrorReporter({ report: (error) => events.push(error) });

    const error = new Error("Oops");
    reporter.report(error, { handled: true });

    expect(events).toEqual([error]);
    expect(reporter.logger).toBeNull();
  });

  it("reads a trailing object with no #report as the logger kwargs", () => {
    const logger = { fatal: () => true };
    const subscriber = new ErrorSubscriber();
    const reporter = new ErrorReporter(subscriber, { logger });

    reporter.report(new Error("Oops"), { handled: true });

    expect(reporter.logger).toBe(logger);
    expect(subscriber.events.length).toBe(1);
  });

  it("flattens the subscriber splat", () => {
    const first = new ErrorSubscriber();
    const second = new ErrorSubscriber();
    const reporter = new ErrorReporter(first, [second]);

    reporter.report(new Error("Oops"), { handled: true });

    expect(first.events.length).toBe(1);
    expect(second.events.length).toBe(1);
  });
});
