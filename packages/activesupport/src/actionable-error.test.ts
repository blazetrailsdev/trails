import { beforeEach, describe, it, expect } from "vitest";
import { ActionableError, NonActionable } from "./actionable-error.js";
import { assertChanges, assertPredicate, assertRaises } from "./testing/assertions.js";

class TestError extends ActionableError {
  static override _actions: Record<string, () => void> = {};
}

class NonActionableError extends Error {}

class DispatchableError extends ActionableError {
  static flip1 = false;
  static flip2 = false;

  static {
    this.action("Flip 1", () => {
      this.flip1 = true;
    });

    this.action("Flip 2", () => {
      this.flip2 = true;
    });
  }
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
    expect(Object.keys(ActionableError.actions(DispatchableError))).toEqual(["Flip 1", "Flip 2"]);
    expect(Object.keys(ActionableError.actions(new DispatchableError()))).toEqual([
      "Flip 1",
      "Flip 2",
    ]);
  });

  it("returns no actions for non-actionable errors", () => {
    assertPredicate(ActionableError.actions(Error), (a) => Object.keys(a).length === 0);
    assertPredicate(ActionableError.actions(new Error()), (a) => Object.keys(a).length === 0);
  });

  it("dispatches actions from error and name", async () => {
    await assertChanges(
      () => DispatchableError.flip1,
      null,
      { from: false, to: true },
      () => {
        ActionableError.dispatch(DispatchableError, "Flip 1");
      },
    );
  });

  it("cannot dispatch missing actions", async () => {
    const err = await assertRaises([NonActionable], {}, () => {
      ActionableError.dispatch(NonActionableError, "action");
    });

    expect(err.message).toEqual('Cannot find action "action"');
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
