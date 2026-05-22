import { beforeEach, describe, it, expect } from "vitest";
import { ActionableError, NonActionable } from "./actionable-error.js";

class TestError extends ActionableError {
  static override _actions: Record<string, () => void> = {};
}

class SiblingError extends ActionableError {
  static override _actions: Record<string, () => void> = {};
}

describe("ActionableErrorTest", () => {
  beforeEach(() => {
    TestError._actions = {};
    SiblingError._actions = {};
  });

  it("returns all action of an actionable error", () => {
    let called = false;
    TestError.action("Do something", () => {
      called = true;
    });
    const actions = ActionableError.actions(new TestError());
    expect(Object.keys(actions)).toContain("Do something");
  });

  it("returns no actions for non-actionable errors", () => {
    const actions = ActionableError.actions(new Error("plain"));
    expect(Object.keys(actions)).toHaveLength(0);
  });

  it("dispatches actions from error and name", () => {
    let dispatched = false;
    TestError.action("Fix it", () => {
      dispatched = true;
    });
    ActionableError.dispatch(new TestError(), "Fix it");
    expect(dispatched).toBe(true);
  });

  it("cannot dispatch missing actions", () => {
    expect(() => {
      ActionableError.dispatch(new TestError(), "Nonexistent");
    }).toThrow(NonActionable);
  });

  it("returns all action of an actionable error class", () => {
    TestError.action("Do something", () => {});
    const actions = ActionableError.actions(TestError);
    expect(Object.keys(actions)).toContain("Do something");
  });

  it("subclass actions do not leak to sibling classes", () => {
    TestError.action("Only on test", () => {});
    expect(Object.keys(ActionableError.actions(new SiblingError()))).toHaveLength(0);
  });

  it("warns when two distinct classes register under the same name", () => {
    class Dup1 extends ActionableError {}
    Object.defineProperty(Dup1, "name", { value: "DupCollision" });
    class Dup2 extends ActionableError {}
    Object.defineProperty(Dup2, "name", { value: "DupCollision" });

    const calls: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      ActionableError.register(Dup1);
      ActionableError.register(Dup1);
      ActionableError.register(Dup2);
    } finally {
      console.warn = original;
      ActionableError._registry.delete("DupCollision");
    }
    expect(calls).toHaveLength(1);
    expect(String(calls[0][0])).toContain("DupCollision");
  });
});
