import { describe, it, expect, beforeEach } from "vitest";
import { ErrorReporter } from "./error-reporter.js";
import { ErrorSubscriber } from "./error-reporter/test-helper.js";
import { ExecutionContext } from "./execution-context.js";

class FailingErrorSubscriber {
  static Error = class extends globalThis.Error {
    constructor(message: string) {
      super(message);
      this.name = "FailingErrorSubscriber::Error";
    }
  };

  private error: Error;

  constructor(error: Error) {
    this.error = error;
  }

  report(): void {
    throw this.error;
  }
}

describe("ErrorReporterTest", () => {
  let reporter: ErrorReporter;
  let subscriber: ErrorSubscriber;
  let error: Error;

  // ExecutionContext is automatically reset in Rails app via executor hooks set in railtie
  // But not in Active Support's own test suite.
  beforeEach(() => {
    ExecutionContext.clear();
    reporter = new ErrorReporter();
    subscriber = new ErrorSubscriber();
    reporter.subscribe(subscriber);
    error = new Error("Oops");
  });

  it("receives the execution context", () => {
    reporter.setContext({ section: "admin" });
    const error = new Error("Oops");
    reporter.report(error, { handled: true });
    expect(subscriber.events).toEqual([
      [error, true, "warning", "application", { section: "admin" }],
    ]);
  });

  it("passed context has priority over the execution context", () => {
    reporter.setContext({ section: "admin" });
    const error = new Error("Oops");
    reporter.report(error, { handled: true, context: { section: "public" } });
    expect(subscriber.events).toEqual([
      [error, true, "warning", "application", { section: "public" }],
    ]);
  });

  it("passed source is forwarded", () => {
    const error = new Error("Oops");
    reporter.report(error, { handled: true, source: "my_gem" });
    expect(subscriber.events).toEqual([[error, true, "warning", "my_gem", {}]]);
  });

  it("#disable allow to skip a subscriber", () => {
    reporter.disable(subscriber, () => {
      reporter.report(new Error("Oops"), { handled: true });
    });
    expect(subscriber.events).toEqual([]);
  });

  it("#disable allow to skip a subscribers per class", () => {
    reporter.disable(ErrorSubscriber, () => {
      reporter.report(new Error("Oops"), { handled: true });
    });
    expect(subscriber.events).toEqual([]);
  });

  it("#handle swallow and report any unhandled error", () => {
    const error = new Error("Oops");
    reporter.handle(() => {
      throw error;
    });
    expect(subscriber.events).toEqual([[error, true, "warning", "application", {}]]);
  });

  it("#handle can be scoped to an exception class", () => {
    expect(() =>
      reporter.handle(TypeError, () => {
        throw new RangeError();
      }),
    ).toThrow(RangeError);
    expect(subscriber.events).toEqual([]);
  });

  it("#handle can be scoped to several exception classes", () => {
    expect(() =>
      reporter.handle(TypeError, SyntaxError, () => {
        throw new RangeError();
      }),
    ).toThrow(RangeError);
    expect(subscriber.events).toEqual([]);
  });

  it("#handle swallows and reports matching errors", () => {
    const error = new RangeError("Oops");
    reporter.handle(TypeError, RangeError, () => {
      throw error;
    });
    expect(subscriber.events).toEqual([[error, true, "warning", "application", {}]]);
  });

  it("#handle passes through the return value", () => {
    const result = reporter.handle(() => 2 + 2);
    expect(result).toBe(4);
  });

  it("#handle returns nil on handled raise", () => {
    const result = reporter.handle(() => {
      throw new Error();
      return 2 + 2;
    });
    expect(result).toBeNull();
  });

  it("#handle returns the value of the fallback as a proc on handled raise", () => {
    const result = reporter.handle({ fallback: () => 2 + 2 }, () => {
      throw new Error();
    });
    expect(result).toBe(4);
  });

  // Ruby raises NoMethodError from `fallback.call`; JS' equivalent for calling a
  // non-function is TypeError.
  it("#handle raises if the fallback is not a callable", () => {
    expect(() =>
      reporter.handle({ fallback: "four" }, () => {
        throw new Error();
      }),
    ).toThrow(TypeError);
  });

  it("#handle raises the error up if fallback is a proc that then also raises", () => {
    expect(() =>
      reporter.handle(
        {
          fallback: () => {
            throw new RangeError();
          },
        },
        () => {
          throw new Error();
        },
      ),
    ).toThrow(RangeError);
  });

  it("#record report any unhandled error and re-raise them", () => {
    const error = new RangeError("Oops");
    expect(() =>
      reporter.record(() => {
        throw error;
      }),
    ).toThrow(RangeError);
    expect(subscriber.events).toEqual([[error, false, "error", "application", {}]]);
  });

  it("#record can be scoped to an exception class", () => {
    expect(() =>
      reporter.record(TypeError, () => {
        throw new RangeError();
      }),
    ).toThrow(RangeError);
    expect(subscriber.events).toEqual([]);
  });

  it("#record can be scoped to several exception classes", () => {
    expect(() =>
      reporter.record(TypeError, SyntaxError, () => {
        throw new RangeError();
      }),
    ).toThrow(RangeError);
    expect(subscriber.events).toEqual([]);
  });

  it("#record report any matching, unhandled error and re-raise them", () => {
    const error = new RangeError("Oops");
    expect(() =>
      reporter.record(TypeError, RangeError, () => {
        throw error;
      }),
    ).toThrow(RangeError);
    expect(subscriber.events).toEqual([[error, false, "error", "application", {}]]);
  });

  it("#report assigns a backtrace if it's missing", () => {
    const error = new Error("Oops");
    delete (error as { stack?: string }).stack;
    expect(error.stack).toBeUndefined();

    expect(reporter.report(error)).toBeNull();
    expect(error.stack).not.toBe("");
    expect(error.stack).toBeTruthy();
  });

  it("#record passes through the return value", () => {
    const result = reporter.record(() => 2 + 2);
    expect(result).toBe(4);
  });

  it("#unexpected swallows errors by default", () => {
    const error = new Error("Oops");
    expect(reporter.unexpected(error)).toBeNull();
    expect(subscriber.events).toEqual([[error, true, "warning", "application", {}]]);
    expect(error.stack).toBeTruthy();
  });

  it("#unexpected accepts an error message", () => {
    expect(reporter.unexpected("Oops")).toBeNull();
    expect(subscriber.events.length).toBe(1);

    const [error, ...eventDetails] = subscriber.events[0];
    expect(eventDetails).toEqual([true, "warning", "application", {}]);

    expect((error as Error).message).toBe("Oops");
    expect((error as Error).name).toBe("RuntimeError");
    expect((error as Error).stack).toBeTruthy();
  });

  it("#unexpected re-raise errors in development and test", () => {
    reporter.debugMode = true;
    const error = new Error("Oops");
    let raisedError: Error | undefined;
    try {
      reporter.unexpected(error);
    } catch (e) {
      raisedError = e as Error;
    }
    expect(raisedError).toBeInstanceOf(ErrorReporter.UnexpectedError);
    expect(raisedError!.message).toContain("Error: Oops");
    expect(raisedError!.cause).not.toBeNull();
    expect(raisedError!.cause).toBe(error);
    expect(raisedError!.stack).toBe(error.stack);
  });

  it("can have multiple subscribers", () => {
    const secondSubscriber = new ErrorSubscriber();
    reporter.subscribe(secondSubscriber);

    const error = new Error("Oops");
    reporter.report(error, { handled: true });

    expect(subscriber.events.length).toBe(1);
    expect(secondSubscriber.events.length).toBe(1);
  });

  it("can unsubscribe", () => {
    const secondSubscriber = new ErrorSubscriber();
    reporter.subscribe(secondSubscriber);

    reporter.report(new Error("Oops"), { handled: true });

    reporter.unsubscribe(secondSubscriber);

    reporter.report(new Error("Oops 2"), { handled: true });

    expect(subscriber.events.length).toBe(2);
    expect(secondSubscriber.events.length).toBe(1);

    reporter.subscribe(secondSubscriber);
    reporter.unsubscribe(ErrorSubscriber);

    reporter.report(new Error("Oops 3"), { handled: true });

    expect(subscriber.events.length).toBe(2);
    expect(secondSubscriber.events.length).toBe(1);
  });

  it("handled errors default to :warning severity", () => {
    reporter.report(error, { handled: true });
    expect(subscriber.events[0][2]).toBe("warning");
  });

  it("unhandled errors default to :error severity", () => {
    reporter.report(error, { handled: false });
    expect(subscriber.events[0][2]).toBe("error");
  });

  it("report errors only once", () => {
    reporter.report(error, { handled: false });
    expect(subscriber.events.length).toBe(1);

    for (let i = 0; i < 3; i++) {
      reporter.report(error, { handled: false });
    }
    expect(subscriber.events.length).toBe(1);
  });

  it("causes can't be reported again either", () => {
    const original = new Error("Original");
    const another = new Error("Another", { cause: original });
    error = new Error("Yet Another", { cause: another });

    reporter.report(error, { handled: false });
    expect(subscriber.events.length).toBe(1);

    for (let i = 0; i < 3; i++) {
      reporter.report(original, { handled: false });
    }
    expect(subscriber.events.length).toBe(1);
  });

  it("can report frozen exceptions", () => {
    reporter.report(Object.freeze(error), { handled: false });
    expect(subscriber.events.length).toBe(1);
  });

  it("subscriber errors are re-raised if no logger is set", () => {
    const subscriberError = new FailingErrorSubscriber.Error("Big Oopsie");
    reporter.subscribe(new FailingErrorSubscriber(subscriberError));
    expect(() => reporter.report(error, { handled: true })).toThrow(FailingErrorSubscriber.Error);
  });

  it("subscriber errors are logged if a logger is set", () => {
    const subscriberError = new FailingErrorSubscriber.Error("Big Oopsie");
    reporter.subscribe(new FailingErrorSubscriber(subscriberError));
    const log: string[] = [];
    reporter.logger = { fatal: (message) => log.push(String(message)) };
    reporter.report(error, { handled: true });

    const expected = "Error subscriber raised an error: Big Oopsie (FailingErrorSubscriber::Error)";
    expect(log[0].split("\n")[0]).toBe(expected);
  });
});
