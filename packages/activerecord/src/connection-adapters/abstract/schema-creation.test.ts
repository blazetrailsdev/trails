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

describe("SchemaCreation drop-constraint visitors", () => {
  it("visit_DropForeignKey emits DROP CONSTRAINT with a quoted name", () => {
    const sc = new SchemaCreation("postgres") as any;
    expect(sc.visitDropForeignKey("fk_rails_abc")).toBe('DROP CONSTRAINT "fk_rails_abc"');
  });

  it("visit_DropCheckConstraint emits DROP CONSTRAINT with a quoted name", () => {
    const sc = new SchemaCreation("postgres") as any;
    expect(sc.visitDropCheckConstraint("chk_rails_abc")).toBe('DROP CONSTRAINT "chk_rails_abc"');
  });
});

describe("SchemaCreation support predicates", () => {
  it("supports_indexes_in_create? is true only on MySQL", () => {
    expect((new SchemaCreation("mysql") as any).supportsIndexesInCreate()).toBe(true);
    expect((new SchemaCreation("postgres") as any).supportsIndexesInCreate()).toBe(false);
    expect((new SchemaCreation("sqlite") as any).supportsIndexesInCreate()).toBe(false);
  });

  it("supports_exclusion_constraints? is true only on PostgreSQL", () => {
    expect((new SchemaCreation("postgres") as any).supportsExclusionConstraints()).toBe(true);
    expect((new SchemaCreation("mysql") as any).supportsExclusionConstraints()).toBe(false);
  });

  it("supports_unique_constraints? is true only on PostgreSQL", () => {
    expect((new SchemaCreation("postgres") as any).supportsUniqueConstraints()).toBe(true);
    expect((new SchemaCreation("mysql") as any).supportsUniqueConstraints()).toBe(false);
  });
});

describe("SchemaCreation quoting delegations", () => {
  it("quote_column_name / quote_table_name delegate to the quoter", () => {
    const sc = new SchemaCreation("postgres") as any;
    expect(sc.quoteColumnName("title")).toBe('"title"');
    expect(sc.quoteTableName("posts")).toBe('"posts"');
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
