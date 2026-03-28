import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MigrationContext } from "./migration.js";
import { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

function freshCtx(): { adapter: DatabaseAdapter; ctx: MigrationContext } {
  const adapter = createTestAdapter();
  const ctx = new MigrationContext(adapter);
  return { adapter, ctx };
}

describe("SchemaDumperTest", () => {
  let ctx: MigrationContext;
  beforeEach(async () => {
    const f = freshCtx();
    ctx = f.ctx;
  });
  afterEach(() => {
    SchemaDumper.ignoreTables = [];
  });

  it.skip("dump schema information with empty versions", () => {
    /* needs migration version tracking in schema_migrations table */
  });
  it.skip("dump schema information outputs lexically reverse ordered versions regardless of database order", () => {
    /* needs migration version tracking in schema_migrations table */
  });
  it.skip("schema dump include migration version", () => {
    /* needs migration version tracking in schema_migrations table */
  });

  it("schema dump", async () => {
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
      t.integer("age");
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("createTable");
    expect(output).toContain("users");
  });

  it.skip("schema dump uses force cascade on create table", () => {
    /* needs force: :cascade option emitted in SchemaDumper output */
  });

  it.skip("schema dump excludes sqlite sequence", () => {
    /* needs adapter-backed introspection to exercise sqlite_sequence filtering */
  });

  it("schema dump includes camelcase table name", async () => {
    await ctx.createTable("CamelTable", {}, (t) => {
      t.string("name");
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("CamelTable");
  });

  it.skip("types no line up", () => {
    /* needs column type alignment formatting */
  });
  it.skip("arguments no line up", () => {
    /* needs argument alignment formatting */
  });

  it("no dump errors", async () => {
    await ctx.createTable("safe", {}, (t) => {
      t.string("name");
    });
    expect(() => SchemaDumper.dump(ctx)).not.toThrow();
  });

  it("schema dump includes not null columns", async () => {
    await ctx.createTable("strict", {}, (t) => {
      t.string("name", { null: false });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("strict");
    expect(output).toContain("null: false");
  });

  it("schema dump includes limit constraint for integer columns", async () => {
    await ctx.createTable("limits", {}, (t) => {
      t.integer("small_int", { limit: 2 });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("limit: 2");
  });

  it("schema dump with string ignored table", async () => {
    await ctx.createTable("users", {}, (t) => t.string("name"));
    await ctx.createTable("ignored_table", {}, (t) => t.string("val"));
    SchemaDumper.ignoreTables = ["ignored_table"];
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("users");
    expect(output).not.toContain("ignored_table");
  });

  it("schema dump with regexp ignored table", async () => {
    await ctx.createTable("users", {}, (t) => t.string("name"));
    await ctx.createTable("temp_cache", {}, (t) => t.string("val"));
    SchemaDumper.ignoreTables = [/^temp_/];
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("users");
    expect(output).not.toContain("temp_cache");
  });

  it("schema dumps index columns in right order", async () => {
    await ctx.createTable("indexed", {}, (t) => {
      t.string("a");
      t.string("b");
    });
    await ctx.addIndex("indexed", ["b", "a"], { name: "idx_ba" });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("idx_ba");
  });

  it.skip("schema dumps partial indices", () => {
    /* needs partial index WHERE clause tracking */
  });
  it.skip("schema dumps nulls not distinct", () => {
    /* needs nulls not distinct tracking (PG 15+) */
  });
  it.skip("schema dumps index sort order", () => {
    /* needs index sort order tracking */
  });
  it.skip("schema dumps index length", () => {
    /* needs index length tracking (MySQL) */
  });
  it.skip("schema dumps check constraints", () => {
    /* needs check constraint support */
  });
  it.skip("schema dumps exclusion constraints", () => {
    /* needs exclusion constraint support (PG) */
  });
  it.skip("schema dumps unique constraints", () => {
    /* needs unique constraint support (PG) */
  });
  it.skip("schema does not dump unique constraints as indexes", () => {
    /* needs unique constraint support (PG) */
  });

  it("schema dump does not emit id false for normal tables", async () => {
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).not.toContain("id: false");
    expect(output).not.toContain('t.integer("id"');
  });

  it("schema dump should honor nonstandard primary keys", async () => {
    await ctx.createTable("custom_pk", { id: false }, (t) => {
      t.string("code");
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("id: false");
  });

  it("schema dump should use false as default", async () => {
    await ctx.createTable("booleans", {}, (t) => {
      t.boolean("has_fun", { default: false });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toMatch(/boolean.*"has_fun".*default: false/);
  });

  it("schema dump does not include limit for text field", async () => {
    await ctx.createTable("posts", {}, (t) => {
      t.text("params");
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain('t.text("params")');
    expect(output).not.toMatch(/text.*"params".*limit/);
  });

  it("schema dump does not include limit for binary field", async () => {
    await ctx.createTable("binaries", {}, (t) => {
      t.binary("data");
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain('t.binary("data")');
    expect(output).not.toMatch(/binary.*"data".*limit/);
  });

  it("schema dump does not include limit for float field", async () => {
    await ctx.createTable("numeric_data", {}, (t) => {
      t.float("temperature");
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain('t.float("temperature")');
    expect(output).not.toMatch(/float.*"temperature".*limit/);
  });

  it.skip("schema dump aliased types", () => {
    /* needs type aliasing support */
  });
  it.skip("schema dump expression indices", () => {
    /* needs expression index tracking */
  });
  it.skip("schema dump expression indices escaping", () => {
    /* needs expression index tracking */
  });
  it.skip("schema dump includes length for mysql binary fields", () => {
    /* needs MySQL-specific handling */
  });
  it.skip("schema dump includes length for mysql blob and text fields", () => {
    /* needs MySQL-specific handling */
  });
  it.skip("schema does not include limit for emulated mysql boolean fields", () => {
    /* needs MySQL-specific handling */
  });
  it.skip("schema dumps index type", () => {
    /* needs index type tracking (btree/hash/gin/gist) */
  });

  it("schema dump includes decimal options", async () => {
    await ctx.createTable("numeric_data", {}, (t) => {
      t.decimal("bank_balance", { precision: 10, scale: 2 });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("precision: 10");
    expect(output).toContain("scale: 2");
  });

  it.skip("schema dump includes bigint default", () => {
    /* needs bigint column type in TableDefinition */
  });

  it.skip("schema dump includes limit on array type", () => {
    /* needs PG array support */
  });
  it.skip("schema dump allows array of decimal defaults", () => {
    /* needs PG array support */
  });
  it.skip("schema dump interval type", () => {
    /* needs PG interval type */
  });
  it.skip("schema dump oid type", () => {
    /* needs PG oid type */
  });
  it.skip("schema dump includes extensions", () => {
    /* needs PG extension dumping */
  });
  it.skip("schema dump includes extensions in alphabetic order", () => {
    /* needs PG extension dumping */
  });
  it.skip("schema dump include limit for float4 field", () => {
    /* needs PG float4 specific handling */
  });
  it.skip("schema dump keeps enum intact if it contains comma", () => {
    /* needs PG enum support */
  });
  it.skip("schema dump keeps large precision integer columns as decimal", () => {
    /* needs decimal precision handling */
  });

  it("schema dump keeps id column when id is false and id column added", async () => {
    await ctx.createTable("goofy_string_id", { id: false }, (t) => {
      t.string("id", { null: false });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("id: false");
    expect(output).toMatch(/string.*"id".*null: false/);
  });

  it.skip("schema dump keeps id false when id is false and unique not null column added", () => {
    /* needs unique constraint + id: false */
  });

  it.skip("foreign keys are dumped at the bottom to circumvent dependency issues", () => {
    /* needs foreign key dumping in SchemaDumper */
  });
  it.skip("do not dump foreign keys for ignored tables", () => {
    /* needs foreign key dumping in SchemaDumper */
  });
  it.skip("do not dump foreign keys when bypassed by config", () => {
    /* needs foreign key dump config */
  });

  it.skip("schema dump with table name prefix and suffix", () => {
    /* needs prefix/suffix stripping in SchemaDumper */
  });

  it.skip("schema dump with table name prefix and suffix regexp escape", () => {
    /* needs prefix/suffix stripping in SchemaDumper */
  });
  it.skip("schema dump with table name prefix and ignoring tables", () => {
    /* needs prefix/suffix stripping in SchemaDumper */
  });

  it("schema dump with correct timestamp types via create table and t column", async () => {
    await ctx.createTable("posts", {}, (t) => {
      t.string("title");
      t.timestamps();
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("datetime");
    expect(output).toContain("created_at");
    expect(output).toContain("updated_at");
  });

  it.skip("schema dump with timestamptz datetime format", () => {
    /* needs PG timestamptz support */
  });
  it.skip("timestamps schema dump before rails 7", () => {
    /* needs Rails version compat */
  });
  it.skip("timestamps schema dump before rails 7 with timestamptz setting", () => {
    /* needs Rails version compat */
  });
  it.skip("schema dump when changing datetime type for an existing app", () => {
    /* needs datetime type migration */
  });
  it.skip("schema dump with correct timestamp types via create table and t timestamptz", () => {
    /* needs PG timestamptz support */
  });

  it("schema dump with correct timestamp types via add column", async () => {
    await ctx.createTable("posts", {}, (t) => {
      t.string("title");
    });
    await ctx.addColumn("posts", "created_at", "datetime");
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("datetime");
    expect(output).toContain("created_at");
  });

  it.skip("schema dump with correct timestamp types via add column before rails 7", () => {
    /* needs Rails version compat */
  });
  it.skip("schema dump with correct timestamp types via add column before rails 7 with timestamptz setting", () => {
    /* needs Rails version compat */
  });

  it("schema dump with correct timestamp types via add column with type as string", async () => {
    await ctx.createTable("posts", {}, (t) => {
      t.string("title");
    });
    await ctx.addColumn("posts", "posted_at", "datetime");
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("datetime");
    expect(output).toContain("posted_at");
  });
});

describe("SchemaDumperDefaultsTest", () => {
  let ctx: MigrationContext;
  beforeEach(async () => {
    const f = freshCtx();
    ctx = f.ctx;
  });

  it("schema dump defaults with universally supported types", async () => {
    await ctx.createTable("dump_defaults", {}, (t) => {
      t.string("string_with_default", { default: "Hello!" });
      t.date("date_with_default", { default: "2014-06-05" });
      t.datetime("datetime_with_default", { default: "2014-06-05 07:17:04" });
      t.decimal("decimal_with_default", { precision: 3, scale: 2, default: 2.78 });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toMatch(/string.*"string_with_default".*default: "Hello!"/);
    expect(output).toMatch(/date.*"date_with_default".*default: "2014-06-05"/);
    expect(output).toMatch(/datetime.*"datetime_with_default".*default:/);
    expect(output).toMatch(/decimal.*"decimal_with_default".*precision: 3.*scale: 2/);
  });

  it("schema dump with text column", async () => {
    await ctx.createTable("dump_defaults", {}, (t) => {
      t.text("text_with_default", { default: "John" });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toMatch(/text.*"text_with_default".*default: "John"/);
  });

  it.skip("schema dump with column infinity default", () => {
    /* needs Infinity default handling */
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
    await ctx.createTable("articles", {}, (t) => {
      t.string("title", { null: false });
      t.text("body");
    });
    const result = await TopLevelDumper.dump(adapter);
    expect(result).toContain("articles");
    expect(result).toContain('"title"');
    expect(result).toContain('"body"');
  });

  it("dumps schema with indexes from adapter", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    await ctx.createTable("comments", {}, (t) => {
      t.integer("post_id");
    });
    await ctx.addIndex("comments", "post_id", { name: "index_comments_on_post_id" });
    const result = await TopLevelDumper.dump(adapter);
    expect(result).toContain("addIndex");
    expect(result).toContain("index_comments_on_post_id");
  });

  it("skips internal tables when dumping from adapter", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const { SchemaMigration } = await import("./schema-migration.js");
    const { InternalMetadata } = await import("./internal-metadata.js");
    await new SchemaMigration(adapter).createTable();
    await new InternalMetadata(adapter).createTable();
    await ctx.createTable("products", {}, (t) => {
      t.string("name");
    });
    const result = await TopLevelDumper.dump(adapter);
    expect(result).toContain("products");
    expect(result).not.toContain("schema_migrations");
    expect(result).not.toContain("ar_internal_metadata");
  });

  it("dumpWithVersion defaults to 0 when no versions recorded", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const { SchemaMigration } = await import("./schema-migration.js");
    const sm = new SchemaMigration(adapter);
    await sm.createTable();
    await sm.deleteAllVersions();
    const dumper = new TopLevelDumper(adapter);
    const result = await dumper.dumpWithVersion();
    expect(result).toContain("Schema version: 0");
  });

  it("dumpWithVersion includes latest migration version", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const { SchemaMigration } = await import("./schema-migration.js");
    const sm = new SchemaMigration(adapter);
    await sm.createTable();
    await sm.recordVersion("20240101000000");
    await sm.recordVersion("20240201000000");
    const dumper = new TopLevelDumper(adapter);
    const result = await dumper.dumpWithVersion();
    expect(result).toContain("Schema version: 20240201000000");
  });
});
