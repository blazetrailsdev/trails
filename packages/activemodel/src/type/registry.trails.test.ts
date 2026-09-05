import { describe, it, expect } from "vitest";
import { Types, defaultValue } from "../index.js";
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

  it("keyFor returns the registry key a type instance was built from", () => {
    for (const key of [
      "string",
      "integer",
      "float",
      "boolean",
      "date",
      "datetime",
      "decimal",
      "big_integer",
      "immutable_string",
      "binary",
      "time",
    ]) {
      expect(Types.typeRegistry.keyFor(Types.typeRegistry.lookup(key))).toBe(key);
    }
  });

  it("keyFor returns null for a type that was never registered", () => {
    expect(Types.typeRegistry.keyFor(defaultValue())).toBeNull();
  });
});
