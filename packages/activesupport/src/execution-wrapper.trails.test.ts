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
