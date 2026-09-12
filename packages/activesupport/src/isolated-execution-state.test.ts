import { describe, expect, it, beforeEach } from "vitest";
import { IsolatedExecutionState } from "./isolated-execution-state.js";

describe("IsolatedExecutionStateTest", () => {
  beforeEach(() => IsolatedExecutionState.clear());

  it.skip("#[] when isolation level is :fiber");

  it.skip("#[] when isolation level is :thread");

  it.skip("changing the isolation level clear the old store");

  it("get/set/has/delete on the fallback (no scope)", () => {
    expect(IsolatedExecutionState.has("k")).toBe(false);
    IsolatedExecutionState.set("k", 1);
    expect(IsolatedExecutionState.get<number>("k")).toBe(1);
    expect(IsolatedExecutionState.has("k")).toBe(true);
    IsolatedExecutionState.delete("k");
    expect(IsolatedExecutionState.has("k")).toBe(false);
  });

  it("delete returns the deleted value", () => {
    IsolatedExecutionState.set("gone", 42);
    expect(IsolatedExecutionState.delete<number>("gone")).toBe(42);
    expect(IsolatedExecutionState.delete<number>("gone")).toBeUndefined();
    expect(IsolatedExecutionState.delete("never-set")).toBeUndefined();
  });

  it("fetch initializes once", () => {
    let n = 0;
    const a = IsolatedExecutionState.fetch("singleton", () => ++n);
    const b = IsolatedExecutionState.fetch("singleton", () => ++n);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("fetch caches an explicit undefined", () => {
    let n = 0;
    const a = IsolatedExecutionState.fetch<undefined>("nullable", () => {
      n++;
      return undefined;
    });
    const b = IsolatedExecutionState.fetch<undefined>("nullable", () => {
      n++;
      return undefined;
    });
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(n).toBe(1);
  });

  it("run isolates state from outer context", async () => {
    IsolatedExecutionState.set("outer", "A");
    await IsolatedExecutionState.run(async () => {
      expect(IsolatedExecutionState.get("outer")).toBeUndefined();
      IsolatedExecutionState.set("inner", "B");
      expect(IsolatedExecutionState.get("inner")).toBe("B");
    });
    expect(IsolatedExecutionState.get("outer")).toBe("A");
    expect(IsolatedExecutionState.get("inner")).toBeUndefined();
  });
});
