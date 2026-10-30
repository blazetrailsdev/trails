import { describe, expect, it } from "vitest";
import { Scope } from "./scope.js";

const make = (...args: string[]) => Scope.make(...args) as Scope;

describe("TestRakeScope", () => {
  it("path against empty scope", () => {
    const scope = make();
    expect(scope).toBe(Scope.EMPTY);
    expect(scope.path).toBe("");
  });

  it("path against one element", () => {
    expect(make("one").path).toBe("one");
  });

  it("path against two elements", () => {
    expect(make("inner", "outer").path).toBe("outer:inner");
  });

  it("path with task name", () => {
    expect(make("inner", "outer").pathWithTaskName("task")).toBe("outer:inner:task");
  });

  it("path with task name against empty scope", () => {
    expect(make().pathWithTaskName("task")).toBe("task");
  });

  it("conj against two elements", () => {
    const scope = make().conj("B").conj("A");
    expect(scope).toEqual(make("A", "B"));
  });

  it("trim", () => {
    const scope = make("A", "B");
    expect(scope.trim(0)).toEqual(scope);
    expect(scope.trim(1)).toEqual(scope.tail);
    expect(scope.trim(2)).toEqual(scope.tail.tail);
    expect(scope.trim(3)).toEqual(scope.tail.tail);
  });
});
