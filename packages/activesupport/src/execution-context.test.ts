import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionContext } from "./execution-context.js";

describe("ExecutionContextTest", () => {
  beforeEach(() => {
    ExecutionContext.clear();
  });

  it("#set restore the modified keys when the block exits", () => {
    expect(ExecutionContext.toH().foo).toBeUndefined();
    ExecutionContext.set({ foo: "bar" }, () => {
      expect(ExecutionContext.toH().foo).toBe("bar");
      ExecutionContext.set({ foo: "plop" }, () => {
        expect(ExecutionContext.toH().foo).toBe("plop");
      });
      expect(ExecutionContext.toH().foo).toBe("bar");

      ExecutionContext.setKey("direct_assignment", "present");
      ExecutionContext.set({ multi_assignment: "present" });
    });

    expect(ExecutionContext.toH().foo).toBeUndefined();
    expect(ExecutionContext.toH().direct_assignment).toBe("present");
    expect(ExecutionContext.toH().multi_assignment).toBe("present");
  });

  it("#set coerce keys to symbol", () => {
    ExecutionContext.set({ foo: "bar" }, () => {
      expect(ExecutionContext.toH().foo).toBe("bar");
    });
  });

  it("#[]= coerce keys to symbol", () => {
    ExecutionContext.setKey("symbol_key", "symbolized");
    expect(ExecutionContext.toH().symbol_key).toBe("symbolized");
  });

  it("#to_h returns a copy of the context", () => {
    ExecutionContext.setKey("foo", 42);
    const context = ExecutionContext.toH();
    context.foo = 43;
    expect(ExecutionContext.toH().foo).toBe(42);
  });

  it("#set restores after async callback resolves", async () => {
    ExecutionContext.setKey("before", "yes");
    const result = ExecutionContext.set({ async_key: "during" }, async () => {
      expect(ExecutionContext.toH().async_key).toBe("during");
      return 99;
    });
    await result;
    expect(ExecutionContext.toH().async_key).toBeUndefined();
    expect(ExecutionContext.toH().before).toBe("yes");
  });

  it("#set restores after async callback rejects", async () => {
    await expect(
      ExecutionContext.set({ fail_key: "temp" }, async () => {
        throw new Error("async error");
      }),
    ).rejects.toThrow("async error");
    expect(ExecutionContext.toH().fail_key).toBeUndefined();
  });
});
