import { describe, it, expect } from "vitest";
import * as Types from "../index.js";
import { defaultValue } from "../index.js";
import { rbObjDup } from "@blazetrails/ruby-compat";
import { TypeRegistry } from "./registry.js";

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

  it(":value is not a registered name — Type.default_value is not a registry entry", () => {
    expect(() => Types.typeRegistry.lookup("value")).toThrow("Unknown type :value");
    expect(defaultValue()).toBeInstanceOf(Types.ValueType);
  });

  it("a reasonable error is given when no type is found", () => {
    expect(() => Types.typeRegistry.lookup("imaginary")).toThrow("Unknown type :imaginary");
  });

  it("a new registry is empty — the defaults are registered by type.ts, not the constructor", () => {
    const fresh = new TypeRegistry();
    expect(() => fresh.lookup("string")).toThrow("Unknown type :string");
    expect(() => fresh.lookup("integer")).toThrow("Unknown type :integer");
  });

  it("uuid, json, array are not in AM TypeRegistry defaults (PG-specific types live in AR's OID layer)", () => {
    const fresh = new TypeRegistry();
    expect(() => fresh.lookup("uuid")).toThrow("Unknown type :uuid");
    expect(() => fresh.lookup("json")).toThrow("Unknown type :json");
    expect(() => fresh.lookup("array")).toThrow("Unknown type :array");
  });

  it("a class can be registered for a symbol", () => {
    Types.typeRegistry.register("type_registry_test_custom", null, () => new Types.StringType());
    const t = Types.typeRegistry.lookup("type_registry_test_custom");
    expect(t).toBeInstanceOf(Types.StringType);
  });
});

describe("ActiveModel::Type::Registry#initialize_copy", () => {
  it("a dup'd registry keeps the registrations it was copied with", () => {
    const registry = new TypeRegistry();
    registry.register("foo", Types.StringType);

    const copy = rbObjDup(registry);

    expect(copy).toBeInstanceOf(TypeRegistry);
    expect(copy.lookup("foo")).toBeInstanceOf(Types.StringType);
  });

  it("registering on the dup leaves the original untouched", () => {
    const registry = new TypeRegistry();
    registry.register("foo", Types.StringType);

    const copy = rbObjDup(registry);
    copy.register("foo", Types.IntegerType);
    copy.register("bar", Types.IntegerType);

    expect(copy.lookup("foo")).toBeInstanceOf(Types.IntegerType);
    expect(registry.lookup("foo")).toBeInstanceOf(Types.StringType);
    expect(() => registry.lookup("bar")).toThrow("Unknown type :bar");
  });

  it("registering on the original leaves the dup untouched", () => {
    const registry = new TypeRegistry();
    const copy = rbObjDup(registry);
    registry.register("foo", Types.StringType);

    expect(() => copy.lookup("foo")).toThrow("Unknown type :foo");
  });
});
