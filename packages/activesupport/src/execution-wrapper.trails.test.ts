import { Executor } from "./executor.js";
import { describe, it, expect } from "vitest";
import { ExecutionWrapper } from "./execution-wrapper.js";

describe("ExecutionWrapper.perform (trails)", () => {
  it("awaits an async to_run callback before the block", async () => {
    class Wrapper extends ExecutionWrapper {}
    const called: string[] = [];
    Wrapper.toRun(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      called.push("run");
    });
    Wrapper.toComplete(() => called.push("complete"));

    await Wrapper.perform(() => called.push("body"));
    expect(called).toEqual(["run", "body", "complete"]);
  });

  it("runs complete after an async block settles", async () => {
    class Wrapper extends ExecutionWrapper {}
    const called: string[] = [];
    Wrapper.toComplete(() => called.push("complete"));

    const result = await Wrapper.perform(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      called.push("body");
      return "done";
    });
    expect(result).toBe("done");
    expect(called).toEqual(["body", "complete"]);
  });
});

describe("a hook whose complete answers a promise", () => {
  for (const outer of [false, true]) {
    it(`is awaited when outer is ${outer}`, async () => {
      const executor = class extends Executor {};
      let completed = false;
      executor.registerHook(
        {
          run: () => null,
          complete: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            completed = true;
          },
        },
        { outer },
      );
      await executor.wrap(async () => {});
      expect(completed).toBe(true);
    });
  }
});

describe("ExecutionWrapper.wrap on concurrent flows of one Thread", () => {
  it("runs the hooks for each flow and excludes them under a monitor", async () => {
    const { Monitor } = await import("@blazetrails/ruby-compat");
    const executor = class extends ExecutionWrapper {};
    const monitor = new Monitor();
    const events: string[] = [];
    executor.registerHook(
      { run: () => monitor.enter(), complete: () => monitor.exit() },
      { outer: true },
    );
    const flow = (name: string) =>
      executor.wrap(async () => {
        events.push(`${name} start`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`${name} end`);
      });
    await Promise.all([flow("a"), flow("b")]);
    expect(events).toEqual(["a start", "a end", "b start", "b end"]);
  });

  it("answers active? to a wrap nested in another wrap's flow", async () => {
    const executor = class extends ExecutionWrapper {};
    let runs = 0;
    executor.registerHook({ run: () => (runs += 1), complete: () => undefined });
    await executor.wrap(async () => {
      await Promise.resolve();
      expect(executor.active()).toBe(true);
      await executor.wrap(async () => {
        await Promise.resolve();
      });
    });
    expect(runs).toBe(1);
    expect(executor.active()).toBe(false);
  });
});
