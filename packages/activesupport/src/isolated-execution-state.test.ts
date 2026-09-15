import { Thread } from "@blazetrails/ruby-compat";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { IsolatedExecutionState } from "./isolated-execution-state.js";

describe("IsolatedExecutionStateTest", () => {
  let originalIsolationLevel: typeof IsolatedExecutionState.isolationLevel;

  beforeEach(() => {
    IsolatedExecutionState.clear();
    originalIsolationLevel = IsolatedExecutionState.isolationLevel;
  });

  afterEach(() => {
    IsolatedExecutionState.clear();
    IsolatedExecutionState.isolationLevel = originalIsolationLevel!;
  });

  it.skip("#[] when isolation level is :fiber");

  it("#[] when isolation level is :thread", async () => {
    IsolatedExecutionState.isolationLevel = "thread";

    IsolatedExecutionState.set("test", 42);
    expect(IsolatedExecutionState.get("test")).toBe(42);

    expect(await new Thread(() => IsolatedExecutionState.get("test")).value()).toBeUndefined();
  });

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

  it("run isolates state from outer context", async () => {
    IsolatedExecutionState.set("outer", "A");
    await new Thread(async () => {
      expect(IsolatedExecutionState.get("outer")).toBeUndefined();
      IsolatedExecutionState.set("inner", "B");
      expect(IsolatedExecutionState.get("inner")).toBe("B");
    }).value();
    expect(IsolatedExecutionState.get("outer")).toBe("A");
    expect(IsolatedExecutionState.get("inner")).toBeUndefined();
  });
});
