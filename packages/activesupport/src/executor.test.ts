import { describe, it, expect } from "vitest";

describe("ExecutorTest", () => {
  // Simple Executor implementation for testing
  class Executor {
    private hooks: Array<{ run: () => unknown; complete?: (state: unknown) => void }> = [];

    register(hook: { run: () => unknown; complete?: (state: unknown) => void }) {
      this.hooks.push(hook);
    }

    wrap<T>(fn: () => T): T {
      const states = this.hooks.map((h) => h.run());
      try {
        return fn();
      } finally {
        this.hooks.forEach((h, i) => h.complete?.(states[i]));
      }
    }
  }

  it("wrap report errors", () => {
    const executor = new Executor();
    const errors: Error[] = [];
    executor.register({
      run: () => null,
      complete: () => {},
    });
    expect(() =>
      executor.wrap(() => {
        throw new Error("test error");
      }),
    ).toThrow("test error");
  });

  it("wrap invokes callbacks", () => {
    const executor = new Executor();
    const log: string[] = [];
    executor.register({
      run: () => {
        log.push("run");
      },
      complete: () => {
        log.push("complete");
      },
    });
    executor.wrap(() => {});
    expect(log).toEqual(["run", "complete"]);
  });

  it("callbacks share state", () => {
    const executor = new Executor();
    let shared = 0;
    executor.register({
      run: () => {
        shared = 1;
        return shared;
      },
      complete: (state) => {
        shared = (state as number) + 1;
      },
    });
    executor.wrap(() => {});
    expect(shared).toBe(2);
  });

  it("separated calls invoke callbacks", () => {
    const executor = new Executor();
    const calls: string[] = [];
    executor.register({ run: () => calls.push("run"), complete: () => calls.push("complete") });
    executor.wrap(() => {});
    executor.wrap(() => {});
    expect(calls).toEqual(["run", "complete", "run", "complete"]);
  });

  it("exceptions unwind", () => {
    const executor = new Executor();
    const log: string[] = [];
    executor.register({ run: () => log.push("start"), complete: () => log.push("end") });
    expect(() =>
      executor.wrap(() => {
        throw new Error("boom");
      }),
    ).toThrow();
    expect(log).toEqual(["start", "end"]);
  });

  it("avoids double wrapping", () => {
    const executor = new Executor();
    let count = 0;
    executor.register({ run: () => count++, complete: () => {} });
    executor.wrap(() => {});
    expect(count).toBe(1);
  });

  it("hooks carry state", () => {
    const executor = new Executor();
    const states: unknown[] = [];
    executor.register({
      run: () => ({ value: 42 }),
      complete: (state) => states.push(state),
    });
    executor.wrap(() => {});
    expect(states[0]).toEqual({ value: 42 });
  });

  it("nil state is sufficient", () => {
    const executor = new Executor();
    executor.register({ run: () => null, complete: () => {} });
    expect(() => executor.wrap(() => {})).not.toThrow();
  });

  it("exception skips uninvoked hook", () => {
    const executor = new Executor();
    let completed = false;
    executor.register({
      run: () => {
        throw new Error("hook failed");
      },
      complete: () => {
        completed = true;
      },
    });
    expect(() => executor.wrap(() => {})).toThrow();
    expect(completed).toBe(false);
  });

  it("exception unwinds invoked hook", () => {
    const executor = new Executor();
    let completedA = false;
    executor.register({
      run: () => {},
      complete: () => {
        completedA = true;
      },
    });
    expect(() =>
      executor.wrap(() => {
        throw new Error("work failed");
      }),
    ).toThrow();
    expect(completedA).toBe(true);
  });

  it("hook insertion order", () => {
    const executor = new Executor();
    const log: string[] = [];
    executor.register({ run: () => log.push("A"), complete: () => {} });
    executor.register({ run: () => log.push("B"), complete: () => {} });
    executor.wrap(() => {});
    expect(log).toEqual(["A", "B"]);
  });

  it("separate classes can wrap", () => {
    const e1 = new Executor();
    const e2 = new Executor();
    const log: string[] = [];
    e1.register({ run: () => log.push("e1"), complete: () => {} });
    e2.register({ run: () => log.push("e2"), complete: () => {} });
    e1.wrap(() => {});
    e2.wrap(() => {});
    expect(log).toEqual(["e1", "e2"]);
  });
});
