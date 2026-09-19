import { describe, it, expect } from "vitest";
import { AdapterSpecificRegistry, TypeConflictError } from "./adapter-specific-registry.js";
import { assertRaises } from "@blazetrails/activesupport";
import { ArgumentError, ValueType } from "@blazetrails/activemodel";

class TestType extends ValueType<unknown> {
  readonly name = "test";
  readonly args: unknown;
  constructor(args?: unknown) {
    super();
    this.args = args;
  }
  cast(value: unknown) {
    return value;
  }
  override type() {
    return "test";
  }
}

class FooType extends ValueType<unknown> {
  readonly name = "foo";
  cast(value: unknown) {
    return value;
  }
  override type() {
    return "foo";
  }
}
class BarType extends ValueType<unknown> {
  readonly name = "bar";
  cast(value: unknown) {
    return value;
  }
  override type() {
    return "bar";
  }
}

class Decoration extends ValueType<unknown> {
  readonly name = "decoration";
  readonly value: ValueType;
  constructor(value: ValueType) {
    super();
    this.value = value;
  }
  cast(v: unknown) {
    return v;
  }
  override type() {
    return "decoration";
  }
}
class OtherDecoration extends ValueType<unknown> {
  readonly name = "other_decoration";
  readonly value: ValueType;
  constructor(value: ValueType) {
    super();
    this.value = value;
  }
  cast(v: unknown) {
    return v;
  }
  override type() {
    return "other_decoration";
  }
}

describe("AdapterSpecificRegistryTest", () => {
  it("a class can be registered for a symbol", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType);
    registry.register("bar", BarType);

    expect(registry.lookup("foo")).toEqual(new FooType());
    expect(registry.lookup("bar")).toEqual(new BarType());
  });

  it("a block can be registered", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register(
      "foo",
      null,
      undefined,
      (...args) => [...args, "block for foo"] as unknown as ValueType,
    );
    registry.register(
      "bar",
      null,
      undefined,
      (...args) => [...args, "block for bar"] as unknown as ValueType,
    );

    expect(registry.lookup("foo", 1)).toEqual(["foo", 1, "block for foo"]);
    expect(registry.lookup("foo", 2)).toEqual(["foo", 2, "block for foo"]);
    expect(registry.lookup("bar", 1, 2, 3)).toEqual(["bar", 1, 2, 3, "block for bar"]);
  });

  it("filtering by adapter", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType, { adapter: "sqlite3" });
    registry.register("foo", BarType, { adapter: "postgresql" });

    expect(registry.lookup("foo", { adapter: "sqlite3" })).toEqual(new FooType());
    expect(registry.lookup("foo", { adapter: "postgresql" })).toEqual(new BarType());
  });

  it("an error is raised if both a generic and adapter specific type match", async () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType);
    registry.register("foo", BarType, { adapter: "postgresql" });

    await assertRaises([TypeConflictError], {}, () => {
      registry.lookup("foo", { adapter: "postgresql" });
    });
    expect(registry.lookup("foo", { adapter: "sqlite3" })).toEqual(new FooType());
  });

  it("a generic type can explicitly override an adapter specific type", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType, { override: true });
    registry.register("foo", BarType, { adapter: "postgresql" });

    expect(registry.lookup("foo", { adapter: "postgresql" })).toEqual(new FooType());
    expect(registry.lookup("foo", { adapter: "sqlite3" })).toEqual(new FooType());
  });

  it("a generic type can explicitly allow an adapter type to be used instead", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType, { override: false });
    registry.register("foo", BarType, { adapter: "postgresql" });

    expect(registry.lookup("foo", { adapter: "postgresql" })).toEqual(new BarType());
    expect(registry.lookup("foo", { adapter: "sqlite3" })).toEqual(new FooType());
  });

  it("a reasonable error is given when no type is found", async () => {
    const registry = new AdapterSpecificRegistry();
    const e = await assertRaises([ArgumentError], {}, () => {
      registry.lookup("foo");
    });
    expect(e.message).toBe("Unknown type :foo");
  });

  it("construct args are passed to the type", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", TestType);

    expect(registry.lookup("foo")).toEqual(new TestType());
    expect(registry.lookup("foo", ":ordered_arg")).toEqual(new TestType(":ordered_arg"));
    expect(registry.lookup("foo", { keyword: "arg" })).toEqual(new TestType({ keyword: "arg" }));
    expect(registry.lookup("foo", { keyword: "arg", adapter: "postgresql" })).toEqual(
      new TestType({ keyword: "arg" }),
    );
  });

  it("registering a modifier", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType);
    registry.register("bar", BarType);
    registry.addModifier({ array: true }, Decoration);

    expect(registry.lookup("foo", { array: true })).toEqual(new Decoration(new FooType()));
    expect(registry.lookup("bar", { array: true })).toEqual(new Decoration(new BarType()));
    expect(registry.lookup("foo")).toEqual(new FooType());
  });

  it("registering multiple modifiers", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType);
    registry.addModifier({ array: true }, Decoration);
    registry.addModifier({ range: true }, OtherDecoration);

    expect(registry.lookup("foo")).toEqual(new FooType());
    expect(registry.lookup("foo", { array: true })).toEqual(new Decoration(new FooType()));
    expect(registry.lookup("foo", { range: true })).toEqual(new OtherDecoration(new FooType()));
    expect(registry.lookup("foo", { array: true, range: true })).toEqual(
      new Decoration(new OtherDecoration(new FooType())),
    );
  });

  it("registering adapter specific modifiers", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", TestType);
    registry.addModifier({ array: true }, Decoration, { adapter: "postgresql" });

    expect(registry.lookup("foo", { array: true, adapter: "postgresql", keyword: "arg" })).toEqual(
      new Decoration(new TestType({ keyword: "arg" })),
    );
    expect(registry.lookup("foo", { array: true, adapter: "sqlite3" })).toEqual(
      new TestType({ array: true }),
    );
  });
});
