import { describe, it, expect } from "vitest";
import { ArgumentError } from "../attribute-assignment.js";
import { TypeRegistry, type TypeFactory } from "./registry.js";

class FooClass {
  readonly args: unknown[];
  constructor(...args: unknown[]) {
    this.args = args;
  }
}

class BarClass {
  readonly args: unknown[];
  constructor(...args: unknown[]) {
    this.args = args;
  }
}

describe("RegistryTest", () => {
  it("a class can be registered for a symbol", () => {
    const registry = new TypeRegistry();
    registry.register("foo", FooClass as never);
    registry.register("bar", BarClass as never);

    expect(registry.lookup("foo")).toEqual(new FooClass());
    expect(registry.lookup("bar")).toEqual(new BarClass());
    expect(registry.lookup("bar", 2, ":a")).toEqual(new BarClass(2, ":a"));
    expect(registry.lookup("bar", 2, {})).toEqual(new BarClass(2, {}));
  });

  it("a block can be registered", () => {
    const registry = new TypeRegistry();
    registry.register("foo", null, ((type: string, ...args: unknown[]) => [
      type,
      args,
      "block for foo",
    ]) as unknown as TypeFactory);
    registry.register("bar", null, ((type: string, ...args: unknown[]) => [
      type,
      args,
      "block for bar",
    ]) as unknown as TypeFactory);
    registry.register("baz", null, ((type: string, kwargs: Record<string, unknown>) => [
      type,
      kwargs,
      "block for baz",
    ]) as unknown as TypeFactory);

    expect(registry.lookup("foo", 1)).toEqual(["foo", [1], "block for foo"]);
    expect(registry.lookup("foo", 2)).toEqual(["foo", [2], "block for foo"]);
    expect(registry.lookup("bar", 1, 2, 3)).toEqual(["bar", [1, 2, 3], "block for bar"]);
    expect(registry.lookup("baz", { kw: 1 })).toEqual(["baz", { kw: 1 }, "block for baz"]);
  });

  it("a reasonable error is given when no type is found", () => {
    const registry = new TypeRegistry();

    let e: unknown;
    expect(() => {
      try {
        registry.lookup("foo");
      } catch (error) {
        e = error;
        throw error;
      }
    }).toThrow(ArgumentError);

    expect((e as ArgumentError).message).toBe("Unknown type :foo");
  });
});
