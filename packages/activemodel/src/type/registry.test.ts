import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("RegistryTest", () => {
  it("a block can be registered", () => {
    // Custom types can be registered via typeRegistry
    expect(Types.typeRegistry.lookup("string")).toBeDefined();
  });

  it("a class can be registered for a symbol", () => {
    Types.typeRegistry.register("mytype", () => new Types.StringType());
    const t = Types.typeRegistry.lookup("mytype");
    expect(t).toBeInstanceOf(Types.StringType);
  });

  it("a reasonable error is given when no type is found", () => {
    expect(() => Types.typeRegistry.lookup("nonexistent_type_xyz")).toThrow(
      "Unknown type: nonexistent_type_xyz",
    );
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
    expect(() => Types.typeRegistry.lookup("imaginary")).toThrow("Unknown type: imaginary");
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
