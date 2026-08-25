// Trails-only SchemaDumper cases with no 1:1 in Rails'
// schema_dumper_test.rb. These unit-test trails-invented exported helpers
// (formatColspec / indexParts), the adapter-introspection dump path
// (SchemaDumperAdapterTest), async header ordering, and DSL-helper
// round-trips. Kept out of the Rails-mirrored schema-dumper.test.ts so
// parity:test maps cleanly.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
import { Base } from "./base.js";
import { fixtures } from "./test-fixtures.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { ValueType } from "@blazetrails/activemodel";

const EMPTY_SOURCE = {
  tables: () => [],
  columns: () => [],
  indexes: () => [],
  adapter: { defaultIndexType: AbstractAdapter.prototype.defaultIndexType },
};

describe("SchemaDumper trails-only cases", () => {
  it("schema dump emits defaultFunction as arrow for non-PK columns", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const source = {
      tables: () => ["gen_defaults"],
      columns: () => [
        { name: "id", type: "integer", primaryKey: true },
        // A function default reflects as `default: null` + `defaultFunction`
        // (the literal default is null; the expression rides defaultFunction),
        // which schemaDefault routes through schemaExpression to the arrow form.
        {
          name: "token",
          type: "string",
          hasDefault: true,
          default: null,
          defaultFunction: "gen_random_uuid()",
        },
      ],
      indexes: () => [],
      lookupCastTypeFromColumn: () => new ValueType(),
    };
    const output = (TopLevelDumper.dump(source) as string[]).join("\n");
    expect(output).toContain(`() => "gen_random_uuid()"`);
  });

  it("schema dump round-trips PG range/network/bit-varying types via DSL helpers", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const source = {
      tables: () => ["dsl_types"],
      columns: () => [
        { name: "id", type: "integer", primaryKey: true },
        { name: "r1", type: "int4range" },
        { name: "r2", type: "int8range" },
        { name: "r3", type: "numrange" },
        { name: "r4", type: "daterange" },
        { name: "r5", type: "tsrange" },
        { name: "r6", type: "tstzrange" },
        { name: "n1", type: "inet" },
        { name: "n2", type: "cidr" },
        { name: "n3", type: "macaddr" },
        // camelCase dsl name re-fed as a SQL type — previously fell through to
        // the `enum` catch-all and was emitted via the generic
        // `t.column("bv", "bitvarying")` path; must now resolve back to the
        // bitVarying helper. This `bv` row is the one assertion that actually
        // pins this PR's behavioral change — the range/network types below are
        // SQL_TYPE_MAP keys and emit helpers before and after this change.
        { name: "bv", type: "bitVarying" },
      ],
      indexes: () => [],
      lookupCastTypeFromColumn: () => new ValueType(),
    };
    const output = (TopLevelDumper.dump(source) as string[]).join("\n");
    for (const helper of [
      "int4range",
      "int8range",
      "numrange",
      "daterange",
      "tsrange",
      "tstzrange",
      "inet",
      "cidr",
      "macaddr",
      "bitVarying",
    ]) {
      expect(output).toContain(`t.${helper}(`);
    }
    // The fix specifically: `bv` must NOT take the generic column fallback.
    expect(output).toContain('t.bitVarying("bv")');
    expect(output).not.toContain('t.column("bv"');
    expect(output).not.toContain("t.enum(");
    expect(output).not.toContain('"enum"');
  });

  it("schema dump round-trips timestamptz/uuid/interval/oid without misclassifying as enum", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const source = {
      tables: () => ["non_helper_types"],
      columns: () => [
        { name: "id", type: "integer", primaryKey: true },
        { name: "ts", type: "timestamptz" },
        { name: "guid", type: "uuid" },
        { name: "span", type: "interval" },
        { name: "obj_id", type: "oid" },
      ],
      indexes: () => [],
      lookupCastTypeFromColumn: () => new ValueType(),
    };
    const output = (TopLevelDumper.dump(source) as string[]).join("\n");
    // Regression guard against collapsing to the `enum` fallback. timestamptz/
    // interval/oid resolve to their TableDefinition helpers (`t.timestamptz`/
    // `t.interval`/`t.oid`); uuid has no helper and round-trips through the
    // generic `t.column(name, sqlType)` path, keeping its own type name.
    expect(output).toContain('t.timestamptz("ts"');
    expect(output).toContain('t.column("guid", "uuid"');
    // interval/oid resolve to their TableDefinition helpers (Rails emits
    // `t.interval`/`t.oid`, not `t.column`).
    expect(output).toContain('t.interval("span"');
    expect(output).toContain('t.oid("obj_id"');
    expect(output).not.toContain("t.enum(");
  });

  it("indexParts emits include for covering indexes", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const emptySource = { ...EMPTY_SOURCE };
    const dumper = new (TopLevelDumper as any)(emptySource);
    const parts = dumper.indexParts({ columns: ["a"], unique: false, include: ["b", "c"] });
    expect(parts.join(", ")).toContain(`include: ["b","c"]`);
  });

  it("indexParts emits NULLS FIRST/LAST order strings verbatim", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const emptySource = { ...EMPTY_SOURCE };
    const dumper = new (TopLevelDumper as any)(emptySource);
    const parts = dumper.indexParts({
      columns: ["created_at"],
      unique: false,
      orders: "desc NULLS LAST",
    });
    expect(parts.join(", ")).toContain(`order: "desc NULLS LAST"`);
  });

  it("indexParts collapses uniform multi-column orders to a scalar", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const emptySource = { ...EMPTY_SOURCE };
    const dumper = new (TopLevelDumper as any)(emptySource);
    const parts = dumper.indexParts({
      columns: ["name", "rating"],
      unique: false,
      orders: { name: "desc", rating: "desc" },
    });
    expect(parts.join(", ")).toContain(`order: "desc"`);
  });

  it("indexParts keeps mixed multi-column orders as a map", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const emptySource = { ...EMPTY_SOURCE };
    const dumper = new (TopLevelDumper as any)(emptySource);
    const parts = dumper.indexParts({
      columns: ["name", "rating"],
      unique: false,
      orders: { name: "desc", rating: "asc" },
    });
    expect(parts.join(", ")).toContain(`order: { name: "desc", rating: "asc" }`);
  });

  it("indexParts collapses uniform multi-column opclasses to a scalar", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const emptySource = { ...EMPTY_SOURCE };
    const dumper = new (TopLevelDumper as any)(emptySource);
    const parts = dumper.indexParts({
      columns: ["name", "description"],
      unique: false,
      opclasses: { name: "varchar_pattern_ops", description: "varchar_pattern_ops" },
    });
    expect(parts.join(", ")).toContain(`opclass: "varchar_pattern_ops"`);
  });

  it("indexParts routes using: through the connection's defaultIndexType predicate", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const { AbstractMysqlAdapter } =
      await import("./connection-adapters/abstract-mysql-adapter.js");
    const index = { columns: ["name"], unique: false, using: "btree" };

    const sqliteLike = new (TopLevelDumper as any)({ ...EMPTY_SOURCE });
    expect(sqliteLike.indexParts(index).join(", ")).toContain(`using: "btree"`);

    const mysqlLike = new (TopLevelDumper as any)({
      ...EMPTY_SOURCE,
      adapter: { defaultIndexType: AbstractMysqlAdapter.prototype.defaultIndexType },
    });
    expect(mysqlLike.indexParts(index).join(", ")).not.toContain("using:");
    expect(mysqlLike.indexParts({ ...index, using: "hash" }).join(", ")).toContain(`using: "hash"`);
  });

  it("fkIgnorePattern suppresses name for matching FK names, includes name for non-matching", async () => {
    const mkSource = (fkName: string) => ({
      tables: async () => ["books"],
      columns: async (_t: string) => [{ name: "id", type: "integer", primaryKey: true }],
      indexes: async () => [],
      foreignKeys: async () => [
        {
          fromTable: "books",
          toTable: "authors",
          column: "author_id",
          primaryKey: "id",
          name: fkName,
        },
      ],
    });
    // auto-generated Rails name → name: omitted (export_name_on_schema_dump? == false)
    const autoName = "fk_rails_abc123def4";
    const autoOutput = (await SchemaDumper.dump(mkSource(autoName) as any)).join("\n");
    expect(autoOutput).toContain("addForeignKey");
    expect(autoOutput).not.toContain(`"${autoName}"`);
    // custom name → name: included
    const customName = "fk_books_author_id";
    const customOutput = (await SchemaDumper.dump(mkSource(customName) as any)).join("\n");
    expect(customOutput).toContain(`name: "${customName}"`);
  });

  it("chkIgnorePattern suppresses name for matching check constraint names, includes name for non-matching", async () => {
    const mkSource = (chkName: string) => ({
      tables: async () => ["products"],
      columns: async (_t: string) => [{ name: "price", type: "decimal" }],
      indexes: async () => [],
      checkConstraints: async () => [{ expression: "price > 0", name: chkName }],
    });
    const autoName = "chk_rails_abc123def4";
    const autoOutput = (await SchemaDumper.dump(mkSource(autoName) as any)).join("\n");
    expect(autoOutput).toContain("t.checkConstraint");
    expect(autoOutput).not.toContain(`"${autoName}"`);
    const customChkName = "products_price_check";
    const customOutput = (await SchemaDumper.dump(mkSource(customChkName) as any)).join("\n");
    expect(customOutput).toContain(`name: "${customChkName}"`);
  });
});

describe("SchemaDumperAdapterTest", () => {
  // Ride the primary schema-loaded pool (`Base.connection`) instead of the
  // sidecar test pool.
  fixtures({}, { useTransactionalTests: false });

  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = Base.connection;
  });

  it("dumps schema from adapter introspection", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    await adapter.createTable("horses", {}, (t) => {
      t.string("title", { null: false });
      t.text("body");
    });
    const result = await TopLevelDumper.dumpTableSchema(adapter, "horses");
    expect(result).toContain("horses");
    expect(result).toContain('"title"');
    expect(result).toContain('"body"');
  });

  it("dumps schema with indexes from adapter", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    await adapter.createTable("testings", {}, (t) => {
      t.integer("post_id");
    });
    await adapter.addIndex("testings", "post_id", { name: "index_testings_on_post_id" });
    const result = await TopLevelDumper.dumpTableSchema(adapter, "testings");
    expect(result).toContain("addIndex");
    expect(result).toContain("index_testings_on_post_id");
  });

  it("adapter-backed dump emits precision: null for datetime column without precision", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    await adapter.createTable("octopi", {}, (t) => {
      t.datetime("happened_at", { precision: null });
    });
    const result = await TopLevelDumper.dumpTableSchema(adapter, "octopi");
    expect(result).toMatch(/t\.datetime\("happened_at"[^}]*precision\s*:\s*null/);
  });

  it("adapter-backed dump preserves explicit string limit through AdapterSchemaSource", async () => {
    // Guards the U2 type/sqlType split: emitTable resolves the limit from the
    // dsl/raw type carried by AdapterSchemaSource. A live introspected column's
    // limit must survive the round-trip on the adapter path (not just the
    // in-memory schema-statements path).
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    await adapter.createTable("barcodes", {}, (t) => {
      t.string("code", { limit: 10 });
    });
    const result = await TopLevelDumper.dumpTableSchema(adapter, "barcodes");
    expect(result).toMatch(/t\.string\("code"[^}]*limit\s*:\s*10/);
  });

  it("skips internal tables when dumping from adapter", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const { SchemaMigration } = await import("./schema-migration.js");
    const { InternalMetadata } = await import("./internal-metadata.js");
    await new SchemaMigration(adapter.pool).createTable();
    await new InternalMetadata(adapter.pool).createTable();
    await adapter.createTable("reminders", {}, (t) => {
      t.string("name");
    });
    const result = (await TopLevelDumper.dump(adapter)).join("\n");
    expect(result).toContain("reminders");
    expect(result).not.toContain("schema_migrations");
    expect(result).not.toContain("ar_internal_metadata");
  }, 60000);

  it("emitTable forwards comment from fetchTableOptions into createTable options", async () => {
    // Subclasses the ConnectionAdapters dumper directly — that's where emitTable
    // (the single column_spec dispatch) lives; the bare base delegates to it.
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const source = {
      tables: () => ["users"],
      columns: () => [{ name: "id", type: "integer", primaryKey: true }],
      indexes: () => [],
      lookupCastTypeFromColumn: () => new ValueType(),
    };
    class CommentDumper extends TopLevelDumper {
      protected override fetchTableOptions(_tableName: string): Record<string, unknown> {
        return { comment: "user accounts" };
      }
    }
    const dumper = CommentDumper.create(source as any);
    const lines: string[] = [];
    await (dumper as any).table("users", lines);
    expect(lines.join("\n")).toContain(`comment: "user accounts"`);
  });

  it("emitTable emits charset and collation from adapterTableOpts before force", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const source = {
      tables: () => ["t"],
      columns: () => [{ name: "id", type: "integer", primaryKey: true }],
      indexes: () => [],
      lookupCastTypeFromColumn: () => new ValueType(),
    };
    class MysqlDumper extends TopLevelDumper {
      protected override fetchTableOptions(_t: string): Record<string, unknown> {
        return { charset: "utf8mb4", collation: "utf8mb4_bin" };
      }
    }
    const dumper = MysqlDumper.create(source as any);
    const lines: string[] = [];
    await (dumper as any).table("t", lines);
    const header = lines[0];
    expect(header).toContain(`charset: "utf8mb4"`);
    expect(header).toContain(`collation: "utf8mb4_bin"`);
    expect(header.indexOf("charset")).toBeLessThan(header.indexOf("force"));
  });

  it("emitTable emits primaryKey array for composite primary keys", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const source = {
      tables: () => ["t"],
      columns: () => [
        { name: "id", type: "integer", primaryKey: true },
        { name: "account_id", type: "integer", primaryKey: true },
      ],
      indexes: () => [],
      lookupCastTypeFromColumn: () => new ValueType(),
    };
    const dumper = TopLevelDumper.create(source as any);
    const lines: string[] = [];
    await (dumper as any).table("t", lines);
    expect(lines[0]).toContain(`primaryKey: ["id","account_id"]`);
    // Rails' Array case emits only `primary_key: [...]` (schema_dumper.rb:182);
    // `id: false` would skip set_primary_key's guard on round-trip.
    expect(lines[0]).not.toContain(`id: false`);
  });

  // Drop the real tables these adapter-backed tests create on the shared
  // per-worker DB so they don't collide with sibling files under parallel forks.
  // Nothing drops them between tests, so drop them per test (not just in
  // afterAll) to keep the shared-DB exposure window one test wide.
  afterEach(async () => {
    const o = { ifExists: true } as const;
    await Base.connection.dropTable("barcodes", o);
    await Base.connection.dropTable("horses", o);
    await Base.connection.dropTable("octopi", o);
    await Base.connection.dropTable("reminders", o);
    await Base.connection.dropTable("testings", o);
  });
});

describe("SchemaDumper async header ordering", () => {
  it("schemas → extensions → types appear in that order when all three are async", async () => {
    const { SchemaDumper: TopLevelDumper } =
      await import("./connection-adapters/abstract/schema-dumper.js");
    const log: string[] = [];
    class OrderedDumper extends TopLevelDumper {
      protected override async schemas(lines: string[]): Promise<void> {
        await Promise.resolve();
        lines.push("SCHEMAS");
        log.push("schemas");
      }
      protected override async extensions(lines: string[]): Promise<void> {
        await Promise.resolve();
        lines.push("EXTENSIONS");
        log.push("extensions");
      }
      protected override async types(lines: string[]): Promise<void> {
        await Promise.resolve();
        lines.push("TYPES");
        log.push("types");
      }
    }
    const source = { tables: () => [], columns: () => [], indexes: () => [] };
    const dumper = new (OrderedDumper as any)(source);
    const result = (await (dumper.dump() as Promise<string[]>)).join("\n");
    expect(log).toEqual(["schemas", "extensions", "types"]);
    const schemasIdx = result.indexOf("SCHEMAS");
    const extensionsIdx = result.indexOf("EXTENSIONS");
    const typesIdx = result.indexOf("TYPES");
    expect(schemasIdx).toBeLessThan(extensionsIdx);
    expect(extensionsIdx).toBeLessThan(typesIdx);
  });
});

describe("formatColspec", () => {
  const dumper = SchemaDumper.create({
    tables: () => [],
    columns: () => [],
    indexes: () => [],
    lookupCastTypeFromColumn: () => new ValueType(),
  });

  it("emits values verbatim (Rails format_colspec), not re-quoted", () => {
    expect(
      dumper.formatColspec({
        null: "false",
        limit: "255",
        precision: "null",
        default: '() => "now()"',
        comment: '"a note"',
      }),
    ).toBe('null: false, limit: 255, precision: null, default: () => "now()", comment: "a note"');
  });

  it("recurses into nested objects (primary-key `id: { type:, … }` spec)", () => {
    expect(
      dumper.formatColspec({ id: { type: '"uuid"', default: "null" }, force: '"cascade"' }),
    ).toBe('id: { type: "uuid", default: null }, force: "cascade"');
  });
});
