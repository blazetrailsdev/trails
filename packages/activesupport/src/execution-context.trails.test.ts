import { describe, expect, it } from "vitest";
import { ExecutionContext } from "./execution-context.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";

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
