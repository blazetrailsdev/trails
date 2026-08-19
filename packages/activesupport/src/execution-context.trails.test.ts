import { describe, expect, it } from "vitest";
import { ExecutionContext } from "./execution-context.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";

/**
 * Rails reads the execution context out of
 * `IsolatedExecutionState[:active_support_execution_context]`
 * (execution_context.rb:47-49), so a context opened for one logical task never
 * bleeds into another. Rails has no test for this in `execution_context_test.rb`
 * — in Ruby it falls out of Thread/Fiber-local storage — so the guard is
 * trails-only.
 */
describe("ExecutionContext isolation", () => {
  it("does not leak keys written inside an isolated execution state", () => {
    ExecutionContext.clear();

    IsolatedExecutionState.run(() => {
      ExecutionContext.setKey("request_id", "inner");
      expect(ExecutionContext.get("request_id")).toBe("inner");
    });

    expect(ExecutionContext.get("request_id")).toBeUndefined();
  });

  it("gives each isolated execution state its own context", () => {
    ExecutionContext.clear();
    ExecutionContext.setKey("request_id", "outer");

    IsolatedExecutionState.run(() => {
      expect(ExecutionContext.get("request_id")).toBeUndefined();
      ExecutionContext.setKey("request_id", "inner");
    });

    expect(ExecutionContext.get("request_id")).toBe("outer");
  });
});
