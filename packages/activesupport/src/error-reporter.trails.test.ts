import { describe, it, expect } from "vitest";
import { ErrorReporter } from "./error-reporter.js";
import { ErrorSubscriber } from "./error-reporter/test-helper.js";

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

describe("UnexpectedError is above the default rescue", () => {
  it("surfaces out of an enclosing handle under debugMode", () => {
    const subscriber = new ErrorSubscriber();
    const reporter = new ErrorReporter(subscriber);
    reporter.debugMode = true;

    expect(() =>
      reporter.handle(() => {
        reporter.unexpected("boom");
      }),
    ).toThrow(ErrorReporter.UnexpectedError);
    expect(subscriber.events.length).toBe(0);
  });

  it("surfaces out of an enclosing record under debugMode", () => {
    const subscriber = new ErrorSubscriber();
    const reporter = new ErrorReporter(subscriber);
    reporter.debugMode = true;

    expect(() =>
      reporter.record(() => {
        reporter.unexpected("boom");
      }),
    ).toThrow(ErrorReporter.UnexpectedError);
    expect(subscriber.events.length).toBe(0);
  });

  it("is still rescued when passed explicitly", () => {
    const subscriber = new ErrorSubscriber();
    const reporter = new ErrorReporter(subscriber);
    reporter.debugMode = true;

    reporter.handle(ErrorReporter.UnexpectedError, () => {
      reporter.unexpected("boom");
    });

    expect(subscriber.events.length).toBe(1);
  });
});
