/**
 * Mirrors Rails activerecord/test/cases/type/adapter_specific_registry_test.rb
 */
import { describe, it, expect } from "vitest";
import { AdapterSpecificRegistry, TypeConflictError } from "./adapter-specific-registry.js";
import { Type } from "@blazetrails/activemodel";

// Mirrors the TYPE constant in Rails' test — a simple type class whose
// equality is based on constructor args.
class TestType extends Type<unknown> {
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

// Two distinct type classes used to distinguish registrations (mirrors ::String / ::Array).
class FooType extends Type<unknown> {
  readonly name = "foo";
  cast(value: unknown) {
    return value;
  }
  override type() {
    return "foo";
  }
}
class BarType extends Type<unknown> {
  readonly name = "bar";
  cast(value: unknown) {
    return value;
  }
  override type() {
    return "bar";
  }
}

// Decoration wrapper — mirrors Ruby's `Struct.new(:value)`.
class Decoration extends Type<unknown> {
  readonly name = "decoration";
  readonly value: Type;
  constructor(value: Type) {
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
class OtherDecoration extends Type<unknown> {
  readonly name = "other_decoration";
  readonly value: Type;
  constructor(value: Type) {
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

    expect(registry.lookup("foo")).toBeInstanceOf(FooType);
    expect(registry.lookup("bar")).toBeInstanceOf(BarType);
  });

  it("a block can be registered", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", null, undefined, (symbol, opts) => new TestType([symbol, opts]));
    registry.register("bar", null, undefined, (symbol, opts) => new TestType([symbol, opts]));

    const foo = registry.lookup("foo") as TestType;
    expect((foo.args as unknown[]).at(0)).toBe("foo");
    const bar = registry.lookup("bar") as TestType;
    expect((bar.args as unknown[]).at(0)).toBe("bar");
  });

  it("filtering by adapter", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType, { adapter: "sqlite3" });
    registry.register("foo", BarType, { adapter: "postgresql" });

    expect(registry.lookup("foo", { adapter: "sqlite3" })).toBeInstanceOf(FooType);
    expect(registry.lookup("foo", { adapter: "postgresql" })).toBeInstanceOf(BarType);
  });

  it("an error is raised if both a generic and adapter specific type match", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType);
    registry.register("foo", BarType, { adapter: "postgresql" });

    expect(() => registry.lookup("foo", { adapter: "postgresql" })).toThrow(TypeConflictError);
    expect(registry.lookup("foo", { adapter: "sqlite3" })).toBeInstanceOf(FooType);
  });

  it("a generic type can explicitly override an adapter specific type", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType, { override: true });
    registry.register("foo", BarType, { adapter: "postgresql" });

    expect(registry.lookup("foo", { adapter: "postgresql" })).toBeInstanceOf(FooType);
    expect(registry.lookup("foo", { adapter: "sqlite3" })).toBeInstanceOf(FooType);
  });

  it("a generic type can explicitly allow an adapter type to be used instead", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType, { override: false });
    registry.register("foo", BarType, { adapter: "postgresql" });

    expect(registry.lookup("foo", { adapter: "postgresql" })).toBeInstanceOf(BarType);
    expect(registry.lookup("foo", { adapter: "sqlite3" })).toBeInstanceOf(FooType);
  });

  it("a reasonable error is given when no type is found", () => {
    const registry = new AdapterSpecificRegistry();
    expect(() => registry.lookup("foo")).toThrow("Unknown type :foo");
  });

  it("construct args are passed to the type", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", TestType);

    expect(registry.lookup("foo")).toEqual(new TestType());
    // keyword args are passed (adapter is stripped)
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
    expect(registry.lookup("foo")).toBeInstanceOf(FooType);
  });

  it("registering multiple modifiers", () => {
    const registry = new AdapterSpecificRegistry();
    registry.register("foo", FooType);
    registry.addModifier({ array: true }, Decoration);
    registry.addModifier({ range: true }, OtherDecoration);

    expect(registry.lookup("foo")).toBeInstanceOf(FooType);
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
