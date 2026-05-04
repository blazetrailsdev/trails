import { describe, it, expect } from "vitest";
import { SchemaCreation } from "./schema-creation.js";
import { ExclusionConstraintDefinition, UniqueConstraintDefinition } from "./schema-definitions.js";
import {
  ForeignKeyDefinition,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  ColumnDefinition,
} from "../abstract/schema-definitions.js";

const s = () => new SchemaCreation() as any;

describe("PostgreSQL SchemaCreation", () => {
  it("visitForeignKeyDefinition: NOT VALID + DEFERRABLE", () => {
    const fk1 = new ForeignKeyDefinition(
      "a",
      "b",
      "b_id",
      "id",
      "fk",
      undefined,
      undefined,
      undefined,
      false,
    );
    expect(s().visitForeignKeyDefinition(fk1)).not.toContain("NOT VALID");
    const fk2 = new ForeignKeyDefinition(
      "a",
      "b",
      "b_id",
      "id",
      "fk",
      undefined,
      undefined,
      "deferred",
      true,
    );
    expect(s().visitForeignKeyDefinition(fk2)).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("visitAddForeignKey: NOT VALID when validate=false", () => {
    expect(s().visitAddForeignKey("a", "b", { validate: false })).toContain("NOT VALID");
  });

  it("visitValidateConstraint", () => {
    expect(s().visitValidateConstraint("c")).toBe('VALIDATE CONSTRAINT "c"');
  });

  it("visitExclusionConstraintDefinition: EXCLUDE USING + WHERE + DEFERRABLE", () => {
    const ec = new ExclusionConstraintDefinition("t", "e WITH &&", {
      name: "c",
      using: "gist",
      where: "x=1",
      deferrable: "deferred",
    });
    const sql = s().visitExclusionConstraintDefinition(ec);
    expect(sql).toContain("EXCLUDE");
    expect(sql).toContain("USING gist");
    expect(sql).toContain("WHERE (x=1)");
    expect(sql).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("visitUniqueConstraintDefinition: basic + NULLS NOT DISTINCT + USING INDEX", () => {
    expect(
      s().visitUniqueConstraintDefinition(new UniqueConstraintDefinition("t", "e", { name: "u" })),
    ).toContain('CONSTRAINT "u" UNIQUE');
    expect(
      s().visitUniqueConstraintDefinition(
        new UniqueConstraintDefinition("t", "e", { name: "u", nullsNotDistinct: true }),
      ),
    ).toContain("NULLS NOT DISTINCT");
    expect(
      s().visitUniqueConstraintDefinition(
        new UniqueConstraintDefinition("t", "e", { name: "u", usingIndex: "idx" }),
      ),
    ).toContain('USING INDEX "idx"');
  });

  it("visitAddExclusionConstraint / visitAddUniqueConstraint", () => {
    expect(
      s().visitAddExclusionConstraint(
        new ExclusionConstraintDefinition("t", "e WITH &&", { name: "c" }),
      ),
    ).toMatch(/^ADD CONSTRAINT/);
    expect(
      s().visitAddUniqueConstraint(new UniqueConstraintDefinition("t", "col", { name: "c" })),
    ).toMatch(/^ADD CONSTRAINT/);
  });

  it("visitChangeColumnDefaultDefinition", () => {
    const col = new ColumnDefinition("x", "string");
    expect(
      s().visitChangeColumnDefaultDefinition(new ChangeColumnDefaultDefinition(col, null)),
    ).toContain("DROP DEFAULT");
    expect(
      s().visitChangeColumnDefaultDefinition(new ChangeColumnDefaultDefinition(col, "v")),
    ).toContain("SET DEFAULT");
  });

  it("visitChangeColumnDefinition: ALTER COLUMN TYPE", () => {
    const col = new ColumnDefinition("price", "decimal", { precision: 10, scale: 2 });
    expect(s().visitChangeColumnDefinition(new ChangeColumnDefinition(col, "price"))).toMatch(
      /ALTER COLUMN "price" TYPE/,
    );
  });

  it("addColumnOptionsBang: COLLATE + STORED + throws for virtual", () => {
    const col = new ColumnDefinition("n", "string");
    expect(s().addColumnOptionsBang("n", { collation: "en_US" })).toContain('COLLATE "en_US"');
    expect(s().addColumnOptionsBang("n", { as: "a||b", stored: true, column: col })).toContain(
      "STORED",
    );
    expect(() => s().addColumnOptionsBang("n", { as: "a||b", stored: false, column: col })).toThrow(
      "VIRTUAL",
    );
  });

  it("quotedIncludeColumns + tableModifierInCreate", () => {
    expect(s().quotedIncludeColumns("a, b")).toBe("a, b");
    expect(s().quotedIncludeColumns(["a", "b"])).toBe('"a", "b"');
    expect(s().tableModifierInCreate({ temporary: true })).toBe(" TEMPORARY");
    expect(s().tableModifierInCreate({ unlogged: true })).toBe(" UNLOGGED");
    expect(s().tableModifierInCreate({})).toBe("");
  });
});
