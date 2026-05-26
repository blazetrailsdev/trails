import { describe, expect, it, beforeEach } from "vitest";
import { IsolatedExecutionState } from "./isolated-execution-state.js";

describe("IsolatedExecutionStateTest", () => {
  beforeEach(() => IsolatedExecutionState.clear());

  // Rails parameterizes isolation as `:fiber` vs `:thread`. trails has no
  // fiber/thread distinction (single-threaded Node + AsyncLocalStorage), so
  // these three Rails tests are not portable; they stay skipped to preserve
  // the test:compare mapping with the upstream file.
  it.skip("#[] when isolation level is :fiber");

  it.skip("#[] when isolation level is :thread");

  it.skip("changing the isolation level clear the old store");

  // ---------------------------------------------------------------------------
  // trails-specific behavioral coverage (no Rails counterpart)
  // ---------------------------------------------------------------------------

  it("get/set/has/delete on the fallback (no scope)", () => {
    expect(IsolatedExecutionState.has("k")).toBe(false);
    IsolatedExecutionState.set("k", 1);
    expect(IsolatedExecutionState.get<number>("k")).toBe(1);
    expect(IsolatedExecutionState.has("k")).toBe(true);
    IsolatedExecutionState.delete("k");
    expect(IsolatedExecutionState.has("k")).toBe(false);
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

  it("scope overrides one key and inherits the rest", () => {
    IsolatedExecutionState.set("a", 1);
    IsolatedExecutionState.set("b", 2);
    IsolatedExecutionState.scope("b", 99, () => {
      expect(IsolatedExecutionState.get("a")).toBe(1);
      expect(IsolatedExecutionState.get("b")).toBe(99);
    });
    expect(IsolatedExecutionState.get("b")).toBe(2);
  });

  it("scope mutations do not leak to the parent", () => {
    IsolatedExecutionState.set("x", "original");
    IsolatedExecutionState.scope("scoped", true, () => {
      IsolatedExecutionState.set("x", "mutated");
      expect(IsolatedExecutionState.get("x")).toBe("mutated");
    });
    expect(IsolatedExecutionState.get("x")).toBe("original");
  });

  it("scope preserves the scoped value across await boundaries", async () => {
    const result = await IsolatedExecutionState.scope("tx", "txA", async () => {
      await new Promise((r) => setTimeout(r, 1));
      return IsolatedExecutionState.get("tx");
    });
    expect(result).toBe("txA");
    expect(IsolatedExecutionState.get("tx")).toBeUndefined();
  });

  it("scope nests correctly", () => {
    IsolatedExecutionState.scope("level", 1, () => {
      expect(IsolatedExecutionState.get("level")).toBe(1);
      IsolatedExecutionState.scope("level", 2, () => {
        expect(IsolatedExecutionState.get("level")).toBe(2);
      });
      expect(IsolatedExecutionState.get("level")).toBe(1);
    });
  });
});
