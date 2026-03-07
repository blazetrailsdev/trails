import { describe, it, expect } from "vitest";
import { OrderedOptions, InheritableOptions } from "./ordered-options.js";

describe("OrderedOptionsTest", () => {
  it("usage", () => {
    const opts = new OrderedOptions();
    (opts as any).boy = "John";
    (opts as any).girl = "Mary";
    expect((opts as any).boy).toBe("John");
    expect((opts as any).girl).toBe("Mary");
  });

  it("looping", () => {
    const opts = new OrderedOptions({ a: 1, b: 2 });
    const keys: string[] = [];
    opts.each((k) => keys.push(k));
    expect(keys).toContain("a");
    expect(keys).toContain("b");
  });

  it("string dig", () => {
    const opts = new OrderedOptions({ name: "Alice" });
    expect(opts.dig("name")).toBe("Alice");
  });

  it("nested dig", () => {
    const opts = new OrderedOptions({ user: { name: "Bob" } });
    expect(opts.dig("user", "name")).toBe("Bob");
  });

  it("method access", () => {
    const opts = new OrderedOptions();
    (opts as any).color = "red";
    expect((opts as any).color).toBe("red");
  });

  it("introspection", () => {
    const opts = new OrderedOptions({ x: 1, y: 2 });
    expect(opts.keys()).toEqual(["x", "y"]);
  });

  it("raises with bang", () => {
    const opts = new OrderedOptions();
    expect(() => (opts as any).missing!()).toThrow();
  });

  it("ordered option inspect", () => {
    const opts = new OrderedOptions({ a: 1 });
    expect(opts.inspect()).toContain("a");
  });

  it("ordered options to h", () => {
    const opts = new OrderedOptions({ x: 1, y: 2 });
    expect(opts.toH()).toEqual({ x: 1, y: 2 });
  });

  it("ordered options dup", () => {
    const opts = new OrderedOptions({ a: 1 });
    const copy = opts.dup();
    (copy as any).b = 2;
    expect(opts.get("b")).toBeUndefined();
    expect(copy.get("b")).toBe(2);
  });

  it("ordered options key", () => {
    const opts = new OrderedOptions({ a: 1, b: 2 });
    expect(opts.key(1)).toBe("a");
    expect(opts.key(99)).toBeUndefined();
  });

  it("ordered options to s", () => {
    const opts = new OrderedOptions({ a: 1 });
    expect(opts.toString()).toContain("a");
  });

  it("odrered options pp", () => {
    // pp is inspect in Ruby — verify inspect works
    const opts = new OrderedOptions({ x: "y" });
    expect(opts.inspect()).toContain("x");
  });

  // InheritableOptions tests

  it("inheritable options continues lookup in parent", () => {
    const parent = new OrderedOptions({ color: "red" });
    const child = new InheritableOptions(parent);
    expect(child.get("color")).toBe("red");
  });

  it("inheritable options can override parent", () => {
    const parent = new OrderedOptions({ color: "red" });
    const child = new InheritableOptions(parent);
    (child as any).color = "blue";
    expect(child.get("color")).toBe("blue");
    expect(parent.get("color")).toBe("red");
  });

  it("inheritable options inheritable copy", () => {
    const opts = new InheritableOptions(null, { a: 1 });
    const copy = opts.inheritableCopy();
    expect(copy.get("a")).toBe(1);
    (copy as any).b = 2;
    expect(opts.get("b")).toBeUndefined();
  });

  it("inheritable option inspect", () => {
    const opts = new InheritableOptions(null, { x: 1 });
    expect(opts.inspect()).toContain("x");
  });

  it("inheritable options to h", () => {
    const opts = new InheritableOptions(null, { a: 1, b: 2 });
    expect(opts.toH()).toEqual({ a: 1, b: 2 });
  });

  it("inheritable options dup", () => {
    const parent = new OrderedOptions({ x: 1 });
    const child = new InheritableOptions(parent, { y: 2 });
    const copy = child.dup();
    expect(copy.get("y")).toBe(2);
  });

  it("inheritable options key", () => {
    const opts = new InheritableOptions(null, { a: 10 });
    expect(opts.key(10)).toBe("a");
  });

  it("inheritable options overridden", () => {
    const parent = new OrderedOptions({ val: "parent" });
    const child = new InheritableOptions(parent);
    (child as any).val = "child";
    expect(child.get("val")).toBe("child");
  });

  it("inheritable options overridden with nil", () => {
    const parent = new OrderedOptions({ val: "parent" });
    const child = new InheritableOptions(parent);
    (child as any).val = null;
    expect(child.get("val")).toBeNull();
  });

  it("inheritable options each", () => {
    const opts = new InheritableOptions(null, { a: 1, b: 2 });
    const keys: string[] = [];
    opts.each((k) => keys.push(k));
    expect(keys).toContain("a");
    expect(keys).toContain("b");
  });

  it("inheritable options to a", () => {
    const opts = new InheritableOptions(null, { x: 1 });
    expect(opts.entries()).toEqual([["x", 1]]);
  });

  it("inheritable options count", () => {
    const opts = new InheritableOptions(null, { a: 1, b: 2 });
    expect(opts.count).toBe(2);
  });

  it("inheritable options to s", () => {
    const opts = new InheritableOptions(null, { k: "v" });
    expect(opts.toString()).toContain("k");
  });

  it("inheritable options pp", () => {
    const opts = new InheritableOptions(null, { m: 1 });
    expect(opts.inspect()).toContain("m");
  });

  it("inheritable options with bang", () => {
    const opts = new InheritableOptions(null, {});
    expect(() => (opts as any).missing!()).toThrow();
  });
});
