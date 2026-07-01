// Trails-only SchemaDumper cases with no 1:1 in Rails'
// schema_dumper_test.rb. These unit-test trails-invented exported helpers
// (cleanDefault / cleanRawPgExpression / formatColspecRaw / indexParts), the
// adapter-introspection dump path (SchemaDumperAdapterTest), async header
// ordering, and DSL-helper round-trips. Kept out of the Rails-mirrored
// schema-dumper.test.ts so test:compare maps cleanly.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { MigrationContext } from "./migration.js";
import { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
import { cleanDefault, cleanRawPgExpression } from "./schema-dumper.js";
import { createTestAdapter } from "./test-adapter.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";

describe("SchemaDumper trails-only cases", () => {
  it("schema dump emits defaultFunction as arrow for non-PK columns", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const source = {
      tables: () => ["gen_defaults"],
      columns: () => [
        { name: "id", type: "integer", primaryKey: true },
        { name: "token", type: "string", defaultFunction: "gen_random_uuid()" },
      ],
      indexes: () => [],
    };
    const output = TopLevelDumper.dump(source) as string;
    expect(output).toContain(`() => "gen_random_uuid()"`);
  });

  it("schema dump round-trips PG range/network/bit-varying types via DSL helpers", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
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
    };
    const output = TopLevelDumper.dump(source) as string;
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
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
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
    };
    const output = TopLevelDumper.dump(source) as string;
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
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const emptySource = { tables: () => [], columns: () => [], indexes: () => [] };
    const dumper = new (TopLevelDumper as any)(emptySource);
    const parts = dumper.indexParts({ columns: ["a"], unique: false, include: ["b", "c"] });
    expect(parts.join(", ")).toContain(`include: ["b","c"]`);
  });

  it("indexParts emits NULLS FIRST/LAST order strings verbatim", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const emptySource = { tables: () => [], columns: () => [], indexes: () => [] };
    const dumper = new (TopLevelDumper as any)(emptySource);
    const parts = dumper.indexParts({
      columns: ["created_at"],
      unique: false,
      orders: "desc NULLS LAST",
    });
    expect(parts.join(", ")).toContain(`order: "desc NULLS LAST"`);
  });

  it("indexParts collapses uniform multi-column orders to a scalar", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const emptySource = { tables: () => [], columns: () => [], indexes: () => [] };
    const dumper = new (TopLevelDumper as any)(emptySource);
    const parts = dumper.indexParts({
      columns: ["name", "rating"],
      unique: false,
      orders: { name: "desc", rating: "desc" },
    });
    expect(parts.join(", ")).toContain(`order: "desc"`);
  });

  it("indexParts keeps mixed multi-column orders as a map", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const emptySource = { tables: () => [], columns: () => [], indexes: () => [] };
    const dumper = new (TopLevelDumper as any)(emptySource);
    const parts = dumper.indexParts({
      columns: ["name", "rating"],
      unique: false,
      orders: { name: "desc", rating: "asc" },
    });
    expect(parts.join(", ")).toContain(`order: { name: "desc", rating: "asc" }`);
  });

  it("indexParts collapses uniform multi-column opclasses to a scalar", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const emptySource = { tables: () => [], columns: () => [], indexes: () => [] };
    const dumper = new (TopLevelDumper as any)(emptySource);
    const parts = dumper.indexParts({
      columns: ["name", "description"],
      unique: false,
      opclasses: { name: "varchar_pattern_ops", description: "varchar_pattern_ops" },
    });
    expect(parts.join(", ")).toContain(`opclass: "varchar_pattern_ops"`);
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
    const autoOutput = await SchemaDumper.dump(mkSource(autoName) as any);
    expect(autoOutput).toContain("addForeignKey");
    expect(autoOutput).not.toContain(`"${autoName}"`);
    // custom name → name: included
    const customName = "fk_books_author_id";
    const customOutput = await SchemaDumper.dump(mkSource(customName) as any);
    expect(customOutput).toContain(`name: "${customName}"`);
  });
});

describe("SchemaDumperAdapterTest", () => {
  let adapter: DatabaseAdapter;
  let ctx: MigrationContext;

  beforeEach(() => {
    adapter = createTestAdapter();
    ctx = new MigrationContext(adapter);
  });

  it("dumps schema from adapter introspection", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    await ctx.createTable("horses", {}, (t) => {
      t.string("title", { null: false });
      t.text("body");
    });
    const result = await TopLevelDumper.dump(adapter);
    expect(result).toContain("horses");
    expect(result).toContain('"title"');
    expect(result).toContain('"body"');
  });

  it("dumps schema with indexes from adapter", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    await ctx.createTable("testings", {}, (t) => {
      t.integer("post_id");
    });
    await ctx.addIndex("testings", "post_id", { name: "index_testings_on_post_id" });
    const result = await TopLevelDumper.dump(adapter);
    expect(result).toContain("addIndex");
    expect(result).toContain("index_testings_on_post_id");
  });

  it("adapter-backed dump emits precision: null for datetime column without precision", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    await ctx.createTable("octopi", {}, (t) => {
      t.datetime("happened_at", { precision: null });
    });
    const result = await TopLevelDumper.dump(adapter);
    expect(result).toMatch(/t\.datetime\("happened_at"[^}]*precision\s*:\s*null/);
  });

  it("adapter-backed dump preserves explicit string limit through AdapterSchemaSource", async () => {
    // Guards the U2 type/sqlType split: emitTable resolves the limit from the
    // dsl/raw type carried by AdapterSchemaSource. A live introspected column's
    // limit must survive the round-trip on the adapter path (not just the
    // in-memory MigrationContext path).
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    await ctx.createTable("barcodes", {}, (t) => {
      t.string("code", { limit: 10 });
    });
    const result = await TopLevelDumper.dump(adapter);
    expect(result).toMatch(/t\.string\("code"[^}]*limit\s*:\s*10/);
  });

  it("skips internal tables when dumping from adapter", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const { SchemaMigration } = await import("./schema-migration.js");
    const { InternalMetadata } = await import("./internal-metadata.js");
    await new SchemaMigration(adapter).createTable();
    await new InternalMetadata(adapter).createTable();
    await ctx.createTable("reminders", {}, (t) => {
      t.string("name");
    });
    const result = await TopLevelDumper.dump(adapter);
    expect(result).toContain("reminders");
    expect(result).not.toContain("schema_migrations");
    expect(result).not.toContain("ar_internal_metadata");
  });

  it("dumpWithVersion defaults to 0 when no versions recorded", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const { SchemaMigration } = await import("./schema-migration.js");
    const sm = new SchemaMigration(adapter);
    await sm.createTable();
    await sm.deleteAllVersions();
    const result = await TopLevelDumper.dumpWithVersion(adapter);
    expect(result).toContain("Schema version: 0");
  });

  it("dumpWithVersion includes latest migration version", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const { SchemaMigration } = await import("./schema-migration.js");
    const sm = new SchemaMigration(adapter);
    await sm.createTable();
    await sm.recordVersion("20240101000000");
    await sm.recordVersion("20240201000000");
    const result = await TopLevelDumper.dumpWithVersion(adapter);
    expect(result).toContain("Schema version: 20240201000000");
  });

  it("emitTable forwards comment from fetchTableOptions into createTable options", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const source = {
      tables: () => ["users"],
      columns: () => [{ name: "id", type: "integer", primaryKey: true }],
      indexes: () => [],
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
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const source = {
      tables: () => ["t"],
      columns: () => [{ name: "id", type: "integer", primaryKey: true }],
      indexes: () => [],
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
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const source = {
      tables: () => ["t"],
      columns: () => [
        { name: "id", type: "integer", primaryKey: true },
        { name: "account_id", type: "integer", primaryKey: true },
      ],
      indexes: () => [],
    };
    const dumper = TopLevelDumper.create(source as any);
    const lines: string[] = [];
    await (dumper as any).table("t", lines);
    expect(lines[0]).toContain(`primaryKey: ["id","account_id"]`);
    expect(lines[0]).toContain(`id: false`);
  });

  // Drop the real tables these adapter-backed tests create on the shared
  // per-worker DB so they don't collide with sibling files under parallel forks.
  afterAll(async () => {
    const cleanupCtx = new MigrationContext(createTestAdapter());
    const o = { ifExists: true } as const;
    await cleanupCtx.dropTable("barcodes", o);
    await cleanupCtx.dropTable("horses", o);
    await cleanupCtx.dropTable("octopi", o);
    await cleanupCtx.dropTable("reminders", o);
    await cleanupCtx.dropTable("testings", o);
  });
});

describe("SchemaDumper async header ordering", () => {
  it("schemas → extensions → types appear in that order when all three are async", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
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
    const result = await (dumper.dump() as Promise<string>);
    expect(log).toEqual(["schemas", "extensions", "types"]);
    const schemasIdx = result.indexOf("SCHEMAS");
    const extensionsIdx = result.indexOf("EXTENSIONS");
    const typesIdx = result.indexOf("TYPES");
    expect(schemasIdx).toBeLessThan(extensionsIdx);
    expect(extensionsIdx).toBeLessThan(typesIdx);
  });
});

describe("cleanRawPgExpression", () => {
  it("strips string type casts", () => {
    expect(cleanRawPgExpression("'happy'::mood")).toBe("happy");
    expect(cleanRawPgExpression("'192.168.1.1'::inet")).toBe("192.168.1.1");
    expect(cleanRawPgExpression("'(12.2,13.3)'::point")).toBe("(12.2,13.3)");
  });

  it("unescapes doubled single-quotes", () => {
    expect(cleanRawPgExpression("'it''s'::text")).toBe("it's");
  });

  it("strips numeric type casts", () => {
    expect(cleanRawPgExpression("150.55::numeric")).toBe(150.55);
    expect(cleanRawPgExpression("(150.55)::numeric")).toBe(150.55);
  });

  it("preserves expression defaults like nextval", () => {
    const val = "nextval('seq_id_seq'::regclass)";
    expect(cleanRawPgExpression(val)).toBe(val);
  });

  it("returns unrecognised strings unchanged", () => {
    expect(cleanRawPgExpression("hello")).toBe("hello");
  });
});

describe("cleanDefault", () => {
  it("delegates raw PG cast expressions to cleanRawPgExpression", () => {
    expect(cleanDefault("'happy'::mood")).toBe("happy");
    expect(cleanDefault("'(12.2,13.3)'::point")).toBe("(12.2,13.3)");
  });

  it("coerces scalar booleans", () => {
    expect(cleanDefault("true")).toBe(true);
    expect(cleanDefault("false")).toBe(false);
  });

  it("coerces plain numeric strings", () => {
    expect(cleanDefault("42")).toBe(42);
    expect(cleanDefault("3.14")).toBe(3.14);
  });

  it("preserves bit-string patterns with leading zeros", () => {
    expect(cleanDefault("00000011")).toBe("00000011");
    expect(cleanDefault("0011")).toBe("0011");
  });

  it("returns null/undefined unchanged", () => {
    expect(cleanDefault(null)).toBeNull();
    expect(cleanDefault(undefined)).toBeUndefined();
  });
});

describe("formatColspecRaw", () => {
  const dumper = SchemaDumper.create({
    tables: () => [],
    columns: () => [],
    indexes: () => [],
  });

  it("emits values verbatim (Rails format_colspec), not re-quoted", () => {
    expect(
      dumper.formatColspecRaw({
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
      dumper.formatColspecRaw({ id: { type: '"uuid"', default: "null" }, force: '"cascade"' }),
    ).toBe('id: { type: "uuid", default: null }, force: "cascade"');
  });
});
