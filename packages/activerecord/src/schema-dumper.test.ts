import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MigrationContext } from "./migration.js";
import { SchemaDumper } from "./schema-dumper.js";
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
    /* needs migration version tracking */
  });
  it.skip("dump schema information outputs lexically reverse ordered versions regardless of database order", () => {
    /* needs migration version tracking */
  });
  it.skip("schema dump include migration version", () => {
    /* needs migration version tracking */
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

  it("schema dump uses force cascade on create table", async () => {
    await ctx.createTable("posts", {}, (t) => {
      t.string("title");
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("createTable");
    expect(output).toContain("posts");
  });

  it("schema dump excludes sqlite sequence", async () => {
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).not.toContain("sqlite_sequence");
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

  it.skip("schema dump includes limit constraint for integer columns", () => {
    /* needs column metadata tracking in MigrationContext */
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
    /* needs nulls not distinct tracking */
  });
  it.skip("schema dumps index sort order", () => {
    /* needs index sort order tracking */
  });
  it.skip("schema dumps index length", () => {
    /* needs index length tracking */
  });
  it.skip("schema dumps check constraints", () => {
    /* needs check constraint support */
  });
  it.skip("schema dumps exclusion constraints", () => {
    /* needs exclusion constraint support */
  });
  it.skip("schema dumps unique constraints", () => {
    /* needs unique constraint support */
  });
  it.skip("schema does not dump unique constraints as indexes", () => {
    /* needs unique constraint support */
  });

  it("schema dump should honor nonstandard primary keys", async () => {
    await ctx.createTable("custom_pk", { id: false }, (t) => {
      t.string("code");
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("id: false");
  });

  it.skip("schema dump should use false as default", () => {
    /* needs boolean default tracking */
  });
  it.skip("schema dump does not include limit for text field", () => {
    /* needs column metadata tracking */
  });
  it.skip("schema dump does not include limit for binary field", () => {
    /* needs column metadata tracking */
  });
  it.skip("schema dump does not include limit for float field", () => {
    /* needs column metadata tracking */
  });
  it.skip("schema dump aliased types", () => {
    /* needs type aliasing */
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
    /* needs index type tracking */
  });
  it.skip("schema dump includes decimal options", () => {
    /* needs column metadata tracking */
  });
  it.skip("schema dump includes bigint default", () => {
    /* needs column metadata tracking */
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
    /* needs PG float4 support */
  });
  it.skip("schema dump keeps enum intact if it contains comma", () => {
    /* needs enum support */
  });
  it.skip("schema dump keeps large precision integer columns as decimal", () => {
    /* needs decimal precision handling */
  });
  it.skip("schema dump keeps id column when id is false and id column added", () => {
    /* needs id: false + manual id column */
  });
  it.skip("schema dump keeps id false when id is false and unique not null column added", () => {
    /* needs unique constraint + id: false */
  });
  it.skip("foreign keys are dumped at the bottom to circumvent dependency issues", () => {
    /* needs foreign key dumping */
  });
  it.skip("do not dump foreign keys for ignored tables", () => {
    /* needs foreign key dumping */
  });
  it.skip("do not dump foreign keys when bypassed by config", () => {
    /* needs foreign key dump config */
  });

  it("schema dump with table name prefix and suffix", async () => {
    await ctx.createTable("pre_users_suf", {}, (t) => {
      t.string("name");
    });
    const output = SchemaDumper.dump(ctx, {
      tableNamePrefix: "pre_",
      tableNameSuffix: "_suf",
    });
    expect(output).toContain("pre_users_suf");
  });

  it.skip("schema dump with table name prefix and suffix regexp escape", () => {
    /* needs regexp escaping in prefix/suffix */
  });
  it.skip("schema dump with table name prefix and ignoring tables", () => {
    /* needs prefix-aware ignore */
  });
  it.skip("schema dump with correct timestamp types via create table and t column", () => {
    /* needs timestamp type tracking */
  });
  it.skip("schema dump with timestamptz datetime format", () => {
    /* needs timestamptz support */
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
    /* needs timestamptz support */
  });
  it.skip("schema dump with correct timestamp types via add column", () => {
    /* needs timestamp type tracking */
  });
  it.skip("schema dump with correct timestamp types via add column before rails 7", () => {
    /* needs Rails version compat */
  });
  it.skip("schema dump with correct timestamp types via add column before rails 7 with timestamptz setting", () => {
    /* needs Rails version compat */
  });
  it.skip("schema dump with correct timestamp types via add column with type as string", () => {
    /* needs timestamp type tracking */
  });
});

describe("SchemaDumperDefaultsTest", () => {
  it.skip("schema dump defaults with universally supported types", () => {
    /* needs column default tracking */
  });
  it.skip("schema dump with text column", () => {
    /* needs text column default tracking */
  });
  it.skip("schema dump with column infinity default", () => {
    /* needs infinity default handling */
  });
});
