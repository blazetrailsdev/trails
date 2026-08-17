import { describe, it, expect } from "vitest";
import { Types } from "../index.js";
import { ArgumentError } from "../attribute-assignment.js";
import { TypeRegistry } from "./registry.js";

describe("RegistryTest", () => {
  it("a class can be registered for a symbol", () => {
    const registry = new TypeRegistry();
    // Rails registers a bare class — `registry.register(:foo, ::String)` — and
    // `register` wraps it in `proc { |_, *args| klass.new(*args) }`
    // (registry.rb:16). That default block is what a trails registration spells
    // out, since our `register` takes only the block form. Rails' remaining two
    // assertions (`lookup(:bar, 2, :a) == [:a, :a]`) are `Array.new(2, :a)` —
    // splatting positional args into a Ruby core class' constructor, which has
    // no counterpart here: a trails factory takes one options object.
    registry.register("foo", (_name, options) => new Types.StringType(options));
    registry.register("bar", (_name, options) => new Types.IntegerType(options));

    expect(registry.lookup("foo")).toEqual(new Types.StringType());
    expect(registry.lookup("bar")).toEqual(new Types.IntegerType());
  });

  it("a block can be registered", () => {
    const registry = new TypeRegistry();
    const calls: unknown[] = [];
    const fooType = new Types.StringType(),
      barType = new Types.IntegerType();
    registry.register("foo", (type, ...args) => {
      calls.push([type, args, "block for foo"]);
      return fooType;
    });
    registry.register("bar", (type, ...args) => {
      calls.push([type, args, "block for bar"]);
      return barType;
    });
    // Rails' third registration takes `|type, **kwargs|`; a trails factory
    // receives its options as a single object either way, so the kwargs arm is
    // the same shape as the args one and is not a separate case.

    expect(registry.lookup("foo", { limit: 1 })).toBe(fooType);
    expect(registry.lookup("foo", { limit: 2 })).toBe(fooType);
    expect(registry.lookup("bar", { limit: 3 })).toBe(barType);
    expect(calls).toEqual([
      ["foo", [{ limit: 1 }], "block for foo"],
      ["foo", [{ limit: 2 }], "block for foo"],
      ["bar", [{ limit: 3 }], "block for bar"],
    ]);
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

describe("TypeRegistry", () => {
  it("looks up built-in types", () => {
    const str = Types.typeRegistry.lookup("string");
    expect(str).toBeInstanceOf(Types.StringType);
  });

  it("looks up integer type", () => {
    const int = Types.typeRegistry.lookup("integer");
    expect(int).toBeInstanceOf(Types.IntegerType);
  });

  it("looks up all built-in types", () => {
    expect(Types.typeRegistry.lookup("float")).toBeInstanceOf(Types.FloatType);
    expect(Types.typeRegistry.lookup("boolean")).toBeInstanceOf(Types.BooleanType);
    expect(Types.typeRegistry.lookup("date")).toBeInstanceOf(Types.DateType);
    expect(Types.typeRegistry.lookup("datetime")).toBeInstanceOf(Types.DateTimeType);
    expect(Types.typeRegistry.lookup("decimal")).toBeInstanceOf(Types.DecimalType);
  });

  it("a reasonable error is given when no type is found", () => {
    expect(() => Types.typeRegistry.lookup("imaginary")).toThrow("Unknown type :imaginary");
  });

  it("uuid, json, array are not in AM TypeRegistry defaults (PG-specific types live in AR's OID layer)", () => {
    // Use a fresh instance — the singleton may be mutated by AR's type.ts
    // which re-registers "json" for its own purposes.
    const fresh = new TypeRegistry();
    expect(() => fresh.lookup("uuid")).toThrow("Unknown type :uuid");
    expect(() => fresh.lookup("json")).toThrow("Unknown type :json");
    expect(() => fresh.lookup("array")).toThrow("Unknown type :array");
  });

  it("a class can be registered for a symbol", () => {
    // Use a uniquely-scoped name — the type registry is a global singleton,
    // so generic names ("custom", "mytype") risk colliding as the test set
    // grows.
    Types.typeRegistry.register("type_registry_test_custom", () => new Types.StringType());
    const t = Types.typeRegistry.lookup("type_registry_test_custom");
    expect(t).toBeInstanceOf(Types.StringType);
  });
});
