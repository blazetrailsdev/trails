import { describe, it, expect, beforeEach } from "vitest";
import { Executor } from "./executor.js";
import { ActiveSupport } from "./index.js";
import { ErrorReporter } from "./error-reporter.js";

class DummyError extends Error {}

class ErrorSubscriber {
  readonly events: unknown[][] = [];

  report(
    error: Error,
    {
      handled,
      severity,
      source,
      context,
    }: { handled: boolean; severity: string; source: string; context: object },
  ): void {
    this.events.push([error, handled, severity, source, context]);
  }
}

describe("ExecutorTest", () => {
  let executor: typeof Executor;

  beforeEach(() => {
    executor = class extends Executor {};
  });

  it("wrap report errors", () => {
    const previousReporter = ActiveSupport.errorReporter;
    ActiveSupport.errorReporter = new ErrorReporter();
    try {
      const subscriber = new ErrorSubscriber();
      executor.errorReporter().subscribe(subscriber);
      let error = new DummyError("Oops");
      expect(() =>
        executor.wrap(() => {
          throw error;
        }),
      ).toThrow(DummyError);
      expect(subscriber.events[subscriber.events.length - 1]).toEqual([
        error,
        false,
        "error",
        "application.active_support",
        {},
      ]);

      error = new DummyError("Oops");
      expect(() =>
        executor.wrap(
          () => {
            throw error;
          },
          { source: "custom" },
        ),
      ).toThrow(DummyError);
      expect(subscriber.events[subscriber.events.length - 1]).toEqual([
        error,
        false,
        "error",
        "custom",
        {},
      ]);
    } finally {
      ActiveSupport.errorReporter = previousReporter;
    }
  });

  it("wrap invokes callbacks", () => {
    const called: string[] = [];
    executor.toRun(() => called.push("run"));
    executor.toComplete(() => called.push("complete"));

    executor.wrap(() => {
      called.push("body");
    });

    expect(called).toEqual(["run", "body", "complete"]);
  });

  it("callbacks share state", () => {
    let result = false;
    executor.toRun((target: object) => ((target as { foo?: boolean }).foo = true));
    executor.toComplete((target: object) => (result = (target as { foo?: boolean }).foo === true));

    executor.wrap(() => {});

    expect(result).toBe(true);
  });

  it("separated calls invoke callbacks", () => {
    const called: string[] = [];
    executor.toRun(() => called.push("run"));
    executor.toComplete(() => called.push("complete"));

    const state = executor.runBang();
    called.push("body");
    state.completeBang();

    expect(called).toEqual(["run", "body", "complete"]);
  });

  it("exceptions unwind", () => {
    const called: string[] = [];
    executor.toRun(() => called.push("run_1"));
    executor.toRun(() => {
      throw new DummyError();
    });
    executor.toRun(() => called.push("run_2"));
    executor.toComplete(() => called.push("complete"));

    expect(() => executor.wrap(() => called.push("body"))).toThrow(DummyError);

    expect(called).toEqual(["run_1", "complete"]);
  });

  it("avoids double wrapping", () => {
    const called: string[] = [];
    executor.toRun(() => called.push("run"));
    executor.toComplete(() => called.push("complete"));

    executor.wrap(() => {
      called.push("early");
      executor.wrap(() => {
        called.push("body");
      });
      called.push("late");
    });

    expect(called).toEqual(["run", "early", "body", "late", "complete"]);
  });

  it("hooks carry state", () => {
    let suppliedState: unknown = "none";

    const hook = {
      run: () => "some_state",
      complete: (state: unknown) => {
        suppliedState = state;
      },
    };

    executor.registerHook(hook);

    executor.wrap(() => {});

    expect(suppliedState).toBe("some_state");
  });

  it("nil state is sufficient", () => {
    let suppliedState: unknown = "none";

    const hook = {
      run: () => null,
      complete: (state: unknown) => {
        suppliedState = state;
      },
    };

    executor.registerHook(hook);

    executor.wrap(() => {});

    expect(suppliedState).toBeNull();
  });

  it("exception skips uninvoked hook", () => {
    let suppliedState: unknown = "none";

    const hook = {
      run: () => "some_state",
      complete: (state: unknown) => {
        suppliedState = state;
      },
    };

    executor.toRun(() => {
      throw new DummyError();
    });
    executor.registerHook(hook);

    expect(() => executor.wrap(() => {})).toThrow(DummyError);

    expect(suppliedState).toBe("none");
  });

  it("exception unwinds invoked hook", () => {
    let suppliedState: unknown = "none";

    const hook = {
      run: () => "some_state",
      complete: (state: unknown) => {
        suppliedState = state;
      },
    };

    executor.registerHook(hook);
    executor.toRun(() => {
      throw new DummyError();
    });

    expect(() => executor.wrap(() => {})).toThrow(DummyError);

    expect(suppliedState).toBe("some_state");
  });

  it("hook insertion order", () => {
    const invoked: string[] = [];
    const suppliedState: unknown[] = [];

    class HookClass {
      constructor(readonly letter: string) {}

      run(): string {
        invoked.push(`run_${this.letter}`);
        return `state_${this.letter}`;
      }

      complete(state: unknown): void {
        invoked.push(`complete_${this.letter}`);
        suppliedState.push(state);
      }
    }

    executor.registerHook(new HookClass("a"));
    executor.registerHook(new HookClass("b"));
    executor.registerHook(new HookClass("c"), { outer: true });
    executor.registerHook(new HookClass("d"));

    executor.wrap(() => {});

    expect(invoked).toEqual([
      "run_c",
      "run_a",
      "run_b",
      "run_d",
      "complete_a",
      "complete_b",
      "complete_d",
      "complete_c",
    ]);
    expect(suppliedState).toEqual(["state_a", "state_b", "state_d", "state_c"]);
  });

  it("separate classes can wrap", () => {
    const otherExecutor = class extends Executor {};

    const called: string[] = [];
    executor.toRun(() => called.push("run"));
    executor.toComplete(() => called.push("complete"));
    otherExecutor.toRun(() => called.push("other_run"));
    otherExecutor.toComplete(() => called.push("other_complete"));

    executor.wrap(() => {
      otherExecutor.wrap(() => {
        called.push("body");
      });
    });

    expect(called).toEqual(["run", "other_run", "body", "other_complete", "complete"]);
  });
});
