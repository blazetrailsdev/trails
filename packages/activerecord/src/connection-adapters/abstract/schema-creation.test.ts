import { describe, it, expect } from "vitest";
import { SchemaCreation } from "./schema-creation.js";

describe("SchemaCreation#typeToSql blank type guard", () => {
  it("throws a descriptive error for an empty custom type", () => {
    expect(() => new SchemaCreation("sqlite").typeToSql("" as any)).toThrow(/empty or blank type/);
  });

  it("throws a descriptive error for a whitespace-only custom type", () => {
    expect(() => new SchemaCreation("sqlite").typeToSql("   " as any)).toThrow(
      /empty or blank type/,
    );
  });
});

describe("SchemaCreation#typeToSql decimal precision/scale", () => {
  it("raises when a decimal scale is given without a precision", () => {
    expect(() => new SchemaCreation("sqlite").typeToSql("decimal", { scale: 2 })).toThrow(
      "Error adding decimal column: precision cannot be empty if scale is specified",
    );
  });

  it("honors precision and scale when both are given", () => {
    expect(new SchemaCreation("sqlite").typeToSql("decimal", { precision: 8, scale: 2 })).toBe(
      "DECIMAL(8, 2)",
    );
  });
});
