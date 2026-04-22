import { describe, it, expect, vi } from "vitest";
import {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
  TableDefinition,
  Table,
  AlterTable,
  type SchemaStatementsConstraintLike,
} from "./schema-definitions.js";

describe("ExclusionConstraintDefinition", () => {
  it("exposes options as accessors", () => {
    const defn = new ExclusionConstraintDefinition("products", "price WITH =, range WITH &&", {
      name: "price_check",
      using: "gist",
      where: "price > 0",
      deferrable: "deferred",
    });

    expect(defn.tableName).toBe("products");
    expect(defn.expression).toBe("price WITH =, range WITH &&");
    expect(defn.name).toBe("price_check");
    expect(defn.using).toBe("gist");
    expect(defn.where).toBe("price > 0");
    expect(defn.deferrable).toBe("deferred");
  });

  it("exportNameOnSchemaDump returns true when name is set", () => {
    const named = new ExclusionConstraintDefinition("t", "x WITH =", { name: "my_excl" });
    const unnamed = new ExclusionConstraintDefinition("t", "x WITH =", {});
    expect(named.exportNameOnSchemaDump()).toBe(true);
    expect(unnamed.exportNameOnSchemaDump()).toBe(false);
  });
});

describe("UniqueConstraintDefinition", () => {
  it("exposes options as accessors", () => {
    const defn = new UniqueConstraintDefinition("orders", "position", {
      name: "unique_position",
      deferrable: "deferred",
      usingIndex: "orders_position_idx",
      nullsNotDistinct: true,
    });

    expect(defn.tableName).toBe("orders");
    expect(defn.column).toBe("position");
    expect(defn.name).toBe("unique_position");
    expect(defn.deferrable).toBe("deferred");
    expect(defn.usingIndex).toBe("orders_position_idx");
    expect(defn.nullsNotDistinct).toBe(true);
  });

  it("exportNameOnSchemaDump returns true when name is set", () => {
    const named = new UniqueConstraintDefinition("t", "col", { name: "u_col" });
    const unnamed = new UniqueConstraintDefinition("t", "col", {});
    expect(named.exportNameOnSchemaDump()).toBe(true);
    expect(unnamed.exportNameOnSchemaDump()).toBe(false);
  });

  it("definedFor matches by name", () => {
    const defn = new UniqueConstraintDefinition("t", "col", { name: "u_col" });
    expect(defn.definedFor({ name: "u_col" })).toBe(true);
    expect(defn.definedFor({ name: "other" })).toBe(false);
  });

  it("definedFor matches by column", () => {
    const defn = new UniqueConstraintDefinition("t", ["a", "b"], { name: "u_ab" });
    expect(defn.definedFor({ column: ["a", "b"] })).toBe(true);
    expect(defn.definedFor({ column: ["a"] })).toBe(false);
  });

  it("definedFor matches stored options by string coercion", () => {
    const defn = new UniqueConstraintDefinition("t", "col", { name: "u", deferrable: "deferred" });
    expect(defn.definedFor({ deferrable: "deferred" })).toBe(true);
    expect(defn.definedFor({ deferrable: "immediate" })).toBe(false);
  });

  it("definedFor ignores keys not stored in options (Rails slice semantics)", () => {
    const defn = new UniqueConstraintDefinition("t", "col", { name: "u" });
    expect(defn.definedFor({ unknownKey: "value" } as never)).toBe(true);
  });
});

describe("TableDefinition", () => {
  it("accumulates exclusion constraints", () => {
    const td = new TableDefinition("products");
    td.exclusionConstraint("price WITH =, range WITH &&", { name: "price_check", using: "gist" });

    expect(td.exclusionConstraints).toHaveLength(1);
    const ec = td.exclusionConstraints[0];
    expect(ec.tableName).toBe("products");
    expect(ec.name).toBe("price_check");
    expect(ec.using).toBe("gist");
  });

  it("accumulates unique constraints", () => {
    const td = new TableDefinition("orders");
    td.uniqueConstraint("position", { name: "unique_position", deferrable: "deferred" });

    expect(td.uniqueConstraints).toHaveLength(1);
    const uc = td.uniqueConstraints[0];
    expect(uc.tableName).toBe("orders");
    expect(uc.name).toBe("unique_position");
    expect(uc.deferrable).toBe("deferred");
  });

  it("defaults unlogged to false", () => {
    const td = new TableDefinition("t");
    expect(td.unlogged).toBe(false);
  });

  it("accepts unlogged option", () => {
    const td = new TableDefinition("t", { unlogged: true });
    expect(td.unlogged).toBe(true);
  });

  it("newExclusionConstraintDefinition returns definition without pushing", () => {
    const td = new TableDefinition("products");
    const defn = td.newExclusionConstraintDefinition("price WITH =", { name: "pc" });
    expect(defn).toBeInstanceOf(ExclusionConstraintDefinition);
    expect(defn.tableName).toBe("products");
    expect(td.exclusionConstraints).toHaveLength(0);
  });

  it("newUniqueConstraintDefinition returns definition without pushing", () => {
    const td = new TableDefinition("orders");
    const defn = td.newUniqueConstraintDefinition("col", { name: "uc" });
    expect(defn).toBeInstanceOf(UniqueConstraintDefinition);
    expect(defn.tableName).toBe("orders");
    expect(td.uniqueConstraints).toHaveLength(0);
  });
});

describe("AlterTable", () => {
  it("validateConstraint pushes to constraintValidations", () => {
    const td = new TableDefinition("products");
    const at = new AlterTable(td);
    at.validateConstraint("price_check");
    expect(at.constraintValidations).toEqual(["price_check"]);
  });

  it("addExclusionConstraint pushes to exclusionConstraintAdds", () => {
    const td = new TableDefinition("products");
    const at = new AlterTable(td);
    at.addExclusionConstraint("price WITH =", { name: "pc", using: "gist" });
    expect(at.exclusionConstraintAdds).toHaveLength(1);
    expect(at.exclusionConstraintAdds[0].name).toBe("pc");
  });

  it("addUniqueConstraint pushes to uniqueConstraintAdds", () => {
    const td = new TableDefinition("orders");
    const at = new AlterTable(td);
    at.addUniqueConstraint("position", { name: "unique_position" });
    expect(at.uniqueConstraintAdds).toHaveLength(1);
    expect(at.uniqueConstraintAdds[0].name).toBe("unique_position");
  });
});

describe("TableDefinition#toSql", () => {
  it("emits UNLOGGED when unlogged: true", () => {
    const td = new TableDefinition("products", { id: false, unlogged: true });
    td.string("name");
    expect(td.toSql()).toMatch(/^CREATE UNLOGGED TABLE/);
  });

  it("does not emit UNLOGGED by default", () => {
    const td = new TableDefinition("products", { id: false });
    td.string("name");
    expect(td.toSql()).toMatch(/^CREATE TABLE/);
    expect(td.toSql()).not.toContain("UNLOGGED");
  });

  it("emits exclusion constraint in CREATE TABLE", () => {
    const td = new TableDefinition("meetings", { id: false });
    td.exclusionConstraint("room WITH =, during WITH &&", { name: "no_overlap", using: "gist" });
    const sql = td.toSql();
    expect(sql).toContain(
      'CONSTRAINT "no_overlap" EXCLUDE USING gist (room WITH =, during WITH &&)',
    );
  });

  it("emits unique constraint in CREATE TABLE", () => {
    const td = new TableDefinition("orders", { id: false });
    td.uniqueConstraint("position", { name: "unique_pos", deferrable: "deferred" });
    const sql = td.toSql();
    expect(sql).toContain(
      'CONSTRAINT "unique_pos" UNIQUE ("position") DEFERRABLE INITIALLY DEFERRED',
    );
  });

  it("emits unique constraint with nulls not distinct", () => {
    const td = new TableDefinition("orders", { id: false });
    td.uniqueConstraint("position", { name: "unique_pos", nullsNotDistinct: true });
    const sql = td.toSql();
    expect(sql).toContain("NULLS NOT DISTINCT");
  });

  it("emits unique constraint using index", () => {
    const td = new TableDefinition("orders", { id: false });
    td.uniqueConstraint("position", { name: "unique_pos", usingIndex: "orders_pos_idx" });
    const sql = td.toSql();
    expect(sql).toContain('USING INDEX "orders_pos_idx"');
  });

  it("emits DEFERRABLE without INITIALLY clause when deferrable: true", () => {
    const td = new TableDefinition("orders", { id: false });
    td.uniqueConstraint("position", { name: "unique_pos", deferrable: true });
    const sql = td.toSql();
    expect(sql).toContain('CONSTRAINT "unique_pos" UNIQUE ("position") DEFERRABLE');
    expect(sql).not.toContain("INITIALLY TRUE");
    expect(sql).not.toContain("INITIALLY");
  });

  it("emits exclusion constraint without CONSTRAINT clause when name is omitted", () => {
    const td = new TableDefinition("meetings", { id: false });
    td.exclusionConstraint("room WITH =", { using: "gist" });
    const sql = td.toSql();
    expect(sql).toContain("EXCLUDE USING gist (room WITH =)");
    expect(sql).not.toContain('CONSTRAINT ""');
  });

  it("emits unique constraint without CONSTRAINT clause when name is omitted", () => {
    const td = new TableDefinition("orders", { id: false });
    td.uniqueConstraint("position");
    const sql = td.toSql();
    expect(sql).toContain('UNIQUE ("position")');
    expect(sql).not.toContain('CONSTRAINT ""');
  });

  it("handles constraint-only table with no columns (id: false)", () => {
    const td = new TableDefinition("link_table", { id: false });
    td.uniqueConstraint("ref", { name: "unique_ref" });
    const sql = td.toSql();
    expect(sql).not.toContain("(,");
    expect(sql).toContain('UNIQUE ("ref")');
  });

  it("injects constraints before trailing table options clause", () => {
    const td = new TableDefinition("logs", {
      id: false,
      options: "WITH (autovacuum_enabled = false)",
    });
    td.string("message");
    td.uniqueConstraint("message", { name: "unique_msg" });
    const sql = td.toSql();
    // Constraint must appear inside the column list, before the trailing WITH clause
    const constraintPos = sql.indexOf('CONSTRAINT "unique_msg"');
    const withPos = sql.indexOf("WITH (");
    expect(constraintPos).toBeGreaterThan(0);
    expect(constraintPos).toBeLessThan(withPos);
  });

  it("skips constraint injection for CREATE TABLE ... AS queries", () => {
    const td = new TableDefinition("archived_orders", {
      id: false,
      as: "SELECT (1) AS id, amount FROM orders WHERE archived = true",
    });
    td.uniqueConstraint("id", { name: "unique_id" });
    const sql = td.toSql();
    expect(sql).not.toContain("CONSTRAINT");
    expect(sql).toContain("AS SELECT");
  });

  it("handles default values containing doubled single-quotes without mis-parsing", () => {
    const td = new TableDefinition("messages", { id: false });
    td.string("body", { default: "Bob's" });
    td.uniqueConstraint("body", { name: "unique_body" });
    const sql = td.toSql();
    expect(sql).toContain("Bob''s");
    expect(sql).toContain('CONSTRAINT "unique_body"');
  });
});

function makeSchema(): SchemaStatementsConstraintLike {
  return {
    addColumn: vi.fn(),
    addExclusionConstraint: vi.fn().mockResolvedValue(undefined),
    removeExclusionConstraint: vi.fn().mockResolvedValue(undefined),
    addUniqueConstraint: vi.fn().mockResolvedValue(undefined),
    removeUniqueConstraint: vi.fn().mockResolvedValue(undefined),
    validateConstraint: vi.fn().mockResolvedValue(undefined),
    validateCheckConstraint: vi.fn().mockResolvedValue(undefined),
  } as unknown as SchemaStatementsConstraintLike;
}

describe("Table delegation", () => {
  it("exclusionConstraint delegates to schema.addExclusionConstraint", async () => {
    const schema = makeSchema();
    const table = new Table("products", schema);
    await table.exclusionConstraint("price WITH =", { name: "price_check", using: "gist" });
    expect(schema.addExclusionConstraint).toHaveBeenCalledWith("products", "price WITH =", {
      name: "price_check",
      using: "gist",
    });
  });

  it("removeExclusionConstraint delegates to schema.removeExclusionConstraint", async () => {
    const schema = makeSchema();
    const table = new Table("products", schema);
    await table.removeExclusionConstraint({ name: "price_check" });
    expect(schema.removeExclusionConstraint).toHaveBeenCalledWith("products", {
      name: "price_check",
    });
  });

  it("uniqueConstraint delegates to schema.addUniqueConstraint", async () => {
    const schema = makeSchema();
    const table = new Table("orders", schema);
    await table.uniqueConstraint("position", { name: "unique_pos" });
    expect(schema.addUniqueConstraint).toHaveBeenCalledWith("orders", "position", {
      name: "unique_pos",
    });
  });

  it("removeUniqueConstraint delegates to schema.removeUniqueConstraint", async () => {
    const schema = makeSchema();
    const table = new Table("orders", schema);
    await table.removeUniqueConstraint({ name: "unique_pos" });
    expect(schema.removeUniqueConstraint).toHaveBeenCalledWith("orders", { name: "unique_pos" });
  });

  it("validateConstraint delegates to schema.validateConstraint", async () => {
    const schema = makeSchema();
    const table = new Table("products", schema);
    await table.validateConstraint("price_check");
    expect(schema.validateConstraint).toHaveBeenCalledWith("products", "price_check");
  });

  it("validateCheckConstraint delegates to schema.validateCheckConstraint", async () => {
    const schema = makeSchema();
    const table = new Table("products", schema);
    await table.validateCheckConstraint("price_check");
    expect(schema.validateCheckConstraint).toHaveBeenCalledWith("products", "price_check");
  });
});
