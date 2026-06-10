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
