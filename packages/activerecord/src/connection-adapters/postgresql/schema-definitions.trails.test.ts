import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { SchemaDumper } from "../../schema-dumper.js";
import { ColumnDefinition } from "../abstract/schema-definitions.js";
import {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
  TableDefinition,
  Table,
  AlterTable,
  type SchemaStatementsConstraintLike,
} from "./schema-definitions.js";
import {
  SchemaCreation as PgSchemaCreation,
  type PgSchemaCreationHost,
} from "./schema-creation.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../../base.js";
import { PostgreSQLAdapter } from "../postgresql-adapter.js";
import { describeIfPostgresqlAdapter } from "../../support/describe-if-postgresql-adapter.js";
import type { TableDefinitionConn } from "../abstract/schema-definitions.js";

let leased: TableDefinitionConn;

beforeAll(async () => {
  leased = (await Base.leaseConnection()) as unknown as TableDefinitionConn;
});

describe("ExclusionConstraintDefinition", () => {
  it("exposes options as accessors", async () => {
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

  it("exportNameOnSchemaDump returns false for auto-generated names matching exclIgnorePattern", () => {
    const autoNamed = new ExclusionConstraintDefinition("t", "x WITH =", {
      name: "excl_rails_74c9160f55",
    });
    expect(autoNamed.exportNameOnSchemaDump()).toBe(false);
  });

  describe("with a g-flagged exclIgnorePattern", () => {
    afterEach(() => {
      SchemaDumper.exclIgnorePattern = /^excl_rails_[0-9a-f]{10}$/;
    });

    it("exportNameOnSchemaDump is stable across repeated calls", () => {
      SchemaDumper.exclIgnorePattern = /^excl_rails_[0-9a-f]{10}$/g;
      const autoNamed = new ExclusionConstraintDefinition("t", "x WITH =", {
        name: "excl_rails_74c9160f55",
      });
      expect(autoNamed.exportNameOnSchemaDump()).toBe(false);
      expect(autoNamed.exportNameOnSchemaDump()).toBe(false);
      expect(autoNamed.exportNameOnSchemaDump()).toBe(false);
    });
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

  it("exportNameOnSchemaDump returns false for auto-generated names matching uniqueIgnorePattern", () => {
    const autoNamed = new UniqueConstraintDefinition("t", "col", {
      name: "uniq_rails_1e07660b77",
    });
    expect(autoNamed.exportNameOnSchemaDump()).toBe(false);
  });

  describe("with a g-flagged uniqueIgnorePattern", () => {
    afterEach(() => {
      SchemaDumper.uniqueIgnorePattern = /^uniq_rails_[0-9a-f]{10}$/;
    });

    it("exportNameOnSchemaDump is stable across repeated calls", () => {
      SchemaDumper.uniqueIgnorePattern = /^uniq_rails_[0-9a-f]{10}$/g;
      const autoNamed = new UniqueConstraintDefinition("t", "col", {
        name: "uniq_rails_1e07660b77",
      });
      expect(autoNamed.exportNameOnSchemaDump()).toBe(false);
      expect(autoNamed.exportNameOnSchemaDump()).toBe(false);
      expect(autoNamed.exportNameOnSchemaDump()).toBe(false);
    });
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

describeIfPostgresqlAdapter("TableDefinition", () => {
  it("accumulates exclusion constraints", () => {
    const td = new TableDefinition(leased, "products");
    td.exclusionConstraint("price WITH =, range WITH &&", { name: "price_check", using: "gist" });

    expect(td.exclusionConstraints).toHaveLength(1);
    const ec = td.exclusionConstraints[0];
    expect(ec.tableName).toBe("products");
    expect(ec.name).toBe("price_check");
    expect(ec.using).toBe("gist");
  });

  it("accumulates unique constraints", () => {
    const td = new TableDefinition(leased, "orders");
    td.uniqueConstraint("position", { name: "unique_position", deferrable: "deferred" });

    expect(td.uniqueConstraints).toHaveLength(1);
    const uc = td.uniqueConstraints[0];
    expect(uc.tableName).toBe("orders");
    expect(uc.name).toBe("unique_position");
    expect(uc.deferrable).toBe("deferred");
  });

  it("defaults unlogged to false", () => {
    const td = new TableDefinition(leased, "t");
    expect(td.unlogged).toBe(false);
  });

  it("reads unlogged from PostgreSQLAdapter.createUnloggedTables", () => {
    PostgreSQLAdapter.createUnloggedTables = true;
    try {
      expect(new TableDefinition(leased, "t").unlogged).toBe(true);
    } finally {
      PostgreSQLAdapter.createUnloggedTables = false;
    }
  });

  it("newExclusionConstraintDefinition returns definition without pushing", () => {
    const td = new TableDefinition(leased, "products");
    const defn = td.newExclusionConstraintDefinition("price WITH =", { name: "pc" });
    expect(defn).toBeInstanceOf(ExclusionConstraintDefinition);
    expect(defn.tableName).toBe("products");
    expect(td.exclusionConstraints).toHaveLength(0);
  });

  it("newUniqueConstraintDefinition returns definition without pushing", () => {
    const td = new TableDefinition(leased, "orders");
    const defn = td.newUniqueConstraintDefinition("col", { name: "uc" });
    expect(defn).toBeInstanceOf(UniqueConstraintDefinition);
    expect(defn.tableName).toBe("orders");
    expect(td.uniqueConstraints).toHaveLength(0);
  });
});

describeIfPostgresqlAdapter("PostgreSQL::TableDefinition#enum", () => {
  const typeToSql = (type: string, options: object): string =>
    (
      leased as unknown as {
        typeToSql(type: string, options: object): string;
      }
    ).typeToSql(type, options);

  it("passes :enum through as the column type with enum_type forwarded", () => {
    const td = new TableDefinition(leased, "t");
    td.enum("current_mood", { enum_type: "mood" });
    const [col] = td.columns;
    expect(col.type).toBe("enum");
    expect((col.options as { enumType?: string }).enumType).toBe("mood");
    expect(typeToSql(col.type, col.options)).toBe("mood");
  });

  it("defines one column per name", () => {
    const td = new TableDefinition(leased, "t");
    td.enum("a", "b", { enum_type: "mood" });
    expect(td.columns.map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("raises when enum_type is missing", () => {
    const td = new TableDefinition(leased, "t");
    td.enum("current_mood");
    const [col] = td.columns;
    expect(() => typeToSql(col.type, col.options)).toThrow(
      new ArgumentError("enum_type is required for enums"),
    );
  });
});

describeIfPostgresqlAdapter("PostgreSQL::TableDefinition column methods", () => {
  const types = [
    ["bigserial", "bigserial"],
    ["serial", "serial"],
    ["bit", "bit"],
    ["bitVarying", "bit_varying"],
    ["uuid", "uuid"],
    ["jsonb", "jsonb"],
    ["daterange", "daterange"],
    ["int4range", "int4range"],
    ["int8range", "int8range"],
    ["numrange", "numrange"],
    ["timestamptz", "timestamptz"],
    ["tsrange", "tsrange"],
    ["tstzrange", "tstzrange"],
    ["oid", "oid"],
    ["cidr", "cidr"],
    ["citext", "citext"],
    ["hstore", "hstore"],
    ["inet", "inet"],
    ["interval", "interval"],
    ["ltree", "ltree"],
    ["macaddr", "macaddr"],
    ["money", "money"],
    ["point", "point"],
    ["line", "line"],
    ["lseg", "lseg"],
    ["box", "box"],
    ["path", "path"],
    ["polygon", "polygon"],
    ["circle", "circle"],
    ["tsvector", "tsvector"],
    ["xml", "xml"],
  ] as const;

  it("defines one column per name", () => {
    for (const [method] of types) {
      const td = new TableDefinition(leased, "t");
      (td as unknown as Record<string, (...args: unknown[]) => void>)[method]("a", "b", "c");
      expect(td.columns.map((c) => c.name)).toEqual(["a", "b", "c"]);
    }
  });

  it("applies the trailing options to every name", () => {
    for (const [method] of types) {
      const td = new TableDefinition(leased, "t");
      (td as unknown as Record<string, (...args: unknown[]) => void>)[method]("a", "b", {
        null: false,
      });
      expect(td.columns).toHaveLength(2);
      for (const col of td.columns) {
        expect(col.options.null).toBe(false);
      }
    }
  });

  it("raises when given no column name", () => {
    for (const [method, railsType] of types) {
      const td = new TableDefinition(leased, "t");
      expect(() =>
        (td as unknown as Record<string, (...args: unknown[]) => void>)[method](),
      ).toThrow(`Missing column name(s) for ${railsType}`);
      expect(() =>
        (td as unknown as Record<string, (...args: unknown[]) => void>)[method]({ null: false }),
      ).toThrow(`Missing column name(s) for ${railsType}`);
    }
  });

  it("creates an index for every name when index is passed", () => {
    for (const [method] of types) {
      const td = new TableDefinition(leased, "t");
      (td as unknown as Record<string, (...args: unknown[]) => void>)[method]("a", "b", {
        index: true,
      });
      expect(td.indexes.map(([columnName]) => columnName)).toEqual([["a"], ["b"]]);
      expect(td.columns.every((c) => !("index" in c.options))).toBe(true);
    }
  });

  it("raises on a duplicate column name", () => {
    for (const [method] of types) {
      const td = new TableDefinition(leased, "t");
      expect(() =>
        (td as unknown as Record<string, (...args: unknown[]) => void>)[method]("a", "a"),
      ).toThrow("you can't define an already defined column 'a' on 't'.");
    }
  });

  it("keeps type-specific SQL types when defining multiple columns", () => {
    const td = new TableDefinition(leased, "t");
    td.bit("a", "b", { limit: 8 });
    td.bitVarying("c", { limit: 4 });
    td.bigserial("d", "e");
    expect(td.columns.map((c) => c.sqlType)).toEqual([
      "BIT(8)",
      "BIT(8)",
      "BIT VARYING(4)",
      "BIGSERIAL",
      "BIGSERIAL",
    ]);
  });
});

describeIfPostgresqlAdapter("AlterTable", () => {
  it("validateConstraint pushes to constraintValidations", () => {
    const td = new TableDefinition(leased, "products");
    const at = new AlterTable(td);
    at.validateConstraint("price_check");
    expect(at.constraintValidations).toEqual(["price_check"]);
  });

  it("addExclusionConstraint pushes to exclusionConstraintAdds", () => {
    const td = new TableDefinition(leased, "products");
    const at = new AlterTable(td);
    at.addExclusionConstraint("price WITH =", { name: "pc", using: "gist" });
    expect(at.exclusionConstraintAdds).toHaveLength(1);
    expect(at.exclusionConstraintAdds[0].name).toBe("pc");
  });

  it("addUniqueConstraint pushes to uniqueConstraintAdds", () => {
    const td = new TableDefinition(leased, "orders");
    const at = new AlterTable(td);
    at.addUniqueConstraint("position", { name: "unique_position" });
    expect(at.uniqueConstraintAdds).toHaveLength(1);
    expect(at.uniqueConstraintAdds[0].name).toBe("unique_position");
  });
});

describeIfPostgresqlAdapter("TableDefinition#toSql", () => {
  const toSql = (td: TableDefinition): Promise<string> => {
    const adapter = (td as any).conn;
    return new PgSchemaCreation("typeToSql" in adapter ? adapter : undefined).accept(td);
  };

  it("emits UNLOGGED when createUnloggedTables is set", async () => {
    PostgreSQLAdapter.createUnloggedTables = true;
    try {
      const td = new TableDefinition(leased, "products");
      td.string("name");
      expect(await toSql(td)).toMatch(/^CREATE UNLOGGED TABLE/);
    } finally {
      PostgreSQLAdapter.createUnloggedTables = false;
    }
  });

  it("does not emit UNLOGGED by default", async () => {
    const td = new TableDefinition(leased, "products");
    td.string("name");
    expect(await toSql(td)).toMatch(/^CREATE TABLE/);
    expect(await toSql(td)).not.toContain("UNLOGGED");
  });

  it("drops the type for a virtual column with no type option (Rails no-fallback)", async () => {
    const td = new TableDefinition(leased, "articles");
    td.column("full_name", "virtual" as any, { as: "a || b", stored: true } as any);
    const col = td.columns.find((c) => c.name === "full_name")!;
    expect(col.type).toBeUndefined();
    const sql = await toSql(td);
    expect(sql).toContain('"full_name"  GENERATED ALWAYS AS (a || b) STORED');
    expect(sql).not.toContain("varchar");
  });

  it("emits exclusion constraint in CREATE TABLE", async () => {
    const td = new TableDefinition(leased, "meetings");
    td.exclusionConstraint("room WITH =, during WITH &&", { name: "no_overlap", using: "gist" });
    const sql = await toSql(td);
    expect(sql).toContain(
      'CONSTRAINT "no_overlap" EXCLUDE USING gist (room WITH =, during WITH &&)',
    );
  });

  it("emits unique constraint in CREATE TABLE", async () => {
    const td = new TableDefinition(leased, "orders");
    td.uniqueConstraint("position", { name: "unique_pos", deferrable: "deferred" });
    const sql = await toSql(td);
    expect(sql).toContain(
      'CONSTRAINT "unique_pos" UNIQUE ("position") DEFERRABLE INITIALLY DEFERRED',
    );
  });

  it("emits unique constraint with nulls not distinct", async () => {
    const td = new TableDefinition(leased, "orders");
    td.uniqueConstraint("position", { name: "unique_pos", nullsNotDistinct: true });
    const sql = await toSql(td);
    expect(sql).toContain("NULLS NOT DISTINCT");
  });

  it("emits exclusion constraint with a generated name when name is omitted", async () => {
    const td = new TableDefinition(leased, "meetings");
    td.exclusionConstraint("room WITH =", { using: "gist" });
    const sql = await toSql(td);
    expect(sql).toContain("EXCLUDE USING gist (room WITH =)");
    expect(sql).toMatch(/CONSTRAINT "excl_rails_[0-9a-f]{10}"/);
  });

  it("emits unique constraint with a generated name when name is omitted", async () => {
    const td = new TableDefinition(leased, "orders");
    td.uniqueConstraint("position");
    const sql = await toSql(td);
    expect(sql).toContain('UNIQUE ("position")');
    expect(sql).toMatch(/CONSTRAINT "uniq_rails_[0-9a-f]{10}"/);
  });

  it("handles constraint-only table with no columns (id: false)", async () => {
    const td = new TableDefinition(leased, "link_table");
    td.uniqueConstraint("ref", { name: "unique_ref" });
    const sql = await toSql(td);
    expect(sql).not.toContain("(,");
    expect(sql).toContain('UNIQUE ("ref")');
  });

  it("injects constraints before trailing table options clause", async () => {
    const td = new TableDefinition(leased, "logs", {
      options: "WITH (autovacuum_enabled = false)",
    });
    td.string("message");
    td.uniqueConstraint("message", { name: "unique_msg" });
    const sql = await toSql(td);
    const constraintPos = sql.indexOf('CONSTRAINT "unique_msg"');
    const withPos = sql.indexOf("WITH (");
    expect(constraintPos).toBeGreaterThan(0);
    expect(constraintPos).toBeLessThan(withPos);
  });

  it("skips constraint injection for CREATE TABLE ... AS queries", async () => {
    const td = new TableDefinition(leased, "archived_orders", {
      as: "SELECT (1) AS id, amount FROM orders WHERE archived = true",
    });
    td.uniqueConstraint("id", { name: "unique_id" });
    const sql = await toSql(td);
    expect(sql).not.toContain("CONSTRAINT");
    expect(sql).toContain("AS SELECT");
  });

  it("emits PG-specific long-tail column SQL types verbatim from pgColumn helpers (no-adapter fallback)", async () => {
    const td = new TableDefinition(leased, "widgets");
    td.cidr("net");
    td.inet("addr");
    td.hstore("props");
    td.macaddr("mac");
    td.ltree("path");
    td.tsvector("doc");
    td.xml("payload");
    td.bit("flags", { limit: 8 });
    td.bitVarying("flex", { limit: 16 });
    td.money("price");
    td.oid("oid_col");
    td.tsrange("during");
    const sql = await toSql(td);
    expect(sql).toContain('"net" cidr');
    expect(sql).toContain('"addr" inet');
    expect(sql).toContain('"props" hstore');
    expect(sql).toContain('"mac" macaddr');
    expect(sql).toContain('"path" ltree');
    expect(sql).toContain('"doc" tsvector');
    expect(sql).toContain('"payload" xml');
    expect(sql).toContain('"flags" BIT(8)');
    expect(sql).toContain('"flex" BIT VARYING(16)');
    expect(sql).toContain('"price" money');
    expect(sql).toContain('"oid_col" oid');
    expect(sql).toContain('"during" tsrange');
  });

  it("emits PG-specific long-tail column SQL types lowercase when adapter provides typeToSql", async () => {
    const stubAdapter = {
      quoteColumnName: (s: string) => `"${s}"`,
      quoteTableName: (s: string) => `"${s}"`,
      quoteDefaultExpression: (v: unknown) => ` DEFAULT ${String(v)}`,
      typeToSql: (type: string) => type,
      validColumnDefinitionOptions: () => ColumnDefinition.OPTION_NAMES,
      supportsCheckConstraints: async () => true,
      supportsIndexesInCreate: () => false,
      supportsPartialIndex: () => true,
      supportsIndexInclude: async () => true,
      supportsNullsNotDistinct: async () => true,
      supportsIndexSortOrder: async () => true,
      supportsExclusionConstraints: () => true,
      supportsUniqueConstraints: () => true,
      useForeignKeys: () => true,
    };
    const td = new TableDefinition(stubAdapter as any, "widgets");
    td.cidr("net");
    td.inet("addr");
    td.hstore("props");
    td.macaddr("mac");
    td.tsvector("doc");
    td.money("price");
    const sql = await toSql(td);
    expect(sql).toContain('"net" cidr');
    expect(sql).toContain('"addr" inet');
    expect(sql).toContain('"props" hstore');
    expect(sql).toContain('"mac" macaddr');
    expect(sql).toContain('"doc" tsvector');
    expect(sql).toContain('"price" money');
  });
});

describeIfPostgresqlAdapter("TableDefinition#toSql default quoting", () => {
  it("handles default values containing doubled single-quotes without mis-parsing", async () => {
    const td = new TableDefinition(leased, "messages");
    td.string("body", { default: "Bob's" });
    td.uniqueConstraint("body", { name: "unique_body" });
    const sql = await new PgSchemaCreation(leased as unknown as PgSchemaCreationHost).accept(td);
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

describeIfPostgresqlAdapter("TableDefinition#validColumnDefinitionOptions", () => {
  it("adds the PostgreSQL-specific option keys to the abstract set", () => {
    const td = new TableDefinition(leased, "articles");
    const opts = (td as any).validColumnDefinitionOptions() as string[];
    for (const key of ["array", "using", "castAs", "as", "type", "enumType", "stored"]) {
      expect(opts).toContain(key);
    }
    expect(opts).toContain("collation");
    expect(opts).toContain("ifNotExists");
  });
});
