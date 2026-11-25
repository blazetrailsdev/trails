import { Fiber, Thread } from "@blazetrails/ruby-compat";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { IsolatedExecutionState } from "../lib/isolated-execution-state.js";

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

  it("#[] when isolation level is :fiber", async () => {
    IsolatedExecutionState.isolationLevel = "fiber";

    IsolatedExecutionState.set("test", 42);
    expect(IsolatedExecutionState.get("test")).toBe(42);
    const enumerator = new Fiber(() => IsolatedExecutionState.get("test"));
    expect(enumerator.resume()).toBeUndefined();

    expect(await new Thread(() => IsolatedExecutionState.get("test")).value()).toBeUndefined();
  });

  it("#[] when isolation level is :thread", async () => {
    IsolatedExecutionState.isolationLevel = "thread";

    IsolatedExecutionState.set("test", 42);
    expect(IsolatedExecutionState.get("test")).toBe(42);
    const enumerator = new Fiber(() => IsolatedExecutionState.get("test"));
    expect(enumerator.resume()).toBe(42);

    expect(await new Thread(() => IsolatedExecutionState.get("test")).value()).toBeUndefined();
  });

  it("changing the isolation level clear the old store", () => {
    const original = IsolatedExecutionState.isolationLevel!;
    const other = IsolatedExecutionState.isolationLevel === "fiber" ? "thread" : "fiber";

    IsolatedExecutionState.set("test", 42);
    IsolatedExecutionState.isolationLevel = original;
    expect(IsolatedExecutionState.get("test")).toBe(42);

    IsolatedExecutionState.isolationLevel = other;
    expect(IsolatedExecutionState.get("test")).toBeUndefined();

    IsolatedExecutionState.isolationLevel = original;
    expect(IsolatedExecutionState.get("test")).toBeUndefined();
  });

  it("#share_with copies state from another thread", async () => {
    IsolatedExecutionState.set("foo", "bar");
    IsolatedExecutionState.set("baz", "qux");

    const t1 = Thread.current();
    let result: Record<string, unknown> | null = null;

    await new Thread(() => {
      IsolatedExecutionState.shareWith(t1);
      result = {
        foo: IsolatedExecutionState.get("foo"),
        baz: IsolatedExecutionState.get("baz"),
      };
    }).join();

    expect(result!.foo).toBe("bar");
    expect(result!.baz).toBe("qux");
  });

  it("#share_with restores original state after block", async () => {
    IsolatedExecutionState.set("original", "value");

    const t1 = Thread.current();
    IsolatedExecutionState.set("foo", "parent");

    await new Thread(() => {
      IsolatedExecutionState.set("foo", "child");
      IsolatedExecutionState.set("bar", "child_only");

      IsolatedExecutionState.shareWith(t1);
      expect(IsolatedExecutionState.get("foo")).toBe("parent");
      expect(IsolatedExecutionState.get("bar")).toBeUndefined();
    }).join();
  });

  it("#share_with with except parameter accepts single key or array", async () => {
    IsolatedExecutionState.set("foo", "bar");
    IsolatedExecutionState.set("secret1", "should not copy");
    IsolatedExecutionState.set("secret2", "also should not copy");
    IsolatedExecutionState.set("keep", "keep this");

    const t1 = Thread.current();
    let result: Record<string, unknown> | null = null;

    await new Thread(() => {
      IsolatedExecutionState.shareWith(t1, { except: ["secret1", "secret2"] });
      result = {
        foo: IsolatedExecutionState.get("foo"),
        secret1: IsolatedExecutionState.get("secret1"),
        secret2: IsolatedExecutionState.get("secret2"),
        keep: IsolatedExecutionState.get("keep"),
      };
    }).join();

    expect(result!.foo).toBe("bar");
    expect(result!.secret1).toBeUndefined();
    expect(result!.secret2).toBeUndefined();
    expect(result!.keep).toBe("keep this");
  });

  it("get/set/has/delete on the fallback (no scope)", () => {
    expect(IsolatedExecutionState.isKey("k")).toBe(false);
    IsolatedExecutionState.set("k", 1);
    expect(IsolatedExecutionState.get<number>("k")).toBe(1);
    expect(IsolatedExecutionState.isKey("k")).toBe(true);
    IsolatedExecutionState.delete("k");
    expect(IsolatedExecutionState.isKey("k")).toBe(false);
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
