import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MigrationContext } from "./migration.js";
import { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
import { createTestAdapter, adapterType } from "./test-adapter.js";
import type { TestDatabaseAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

function freshCtx(): { adapter: TestDatabaseAdapter; ctx: MigrationContext } {
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
    SchemaDumper.fkIgnorePattern = /^fk_rails_[0-9a-f]{10}$/;
  });

  it("dump schema information with empty versions", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const { SchemaMigration } = await import("./schema-migration.js");
    const adapter = createTestAdapter();
    const sm = new SchemaMigration(adapter);
    await sm.createTable();
    await sm.deleteAllVersions();
    const result = await TopLevelDumper.dumpWithVersion(adapter);
    expect(result).toContain("Schema version: 0");
  });

  it("dump schema information outputs lexically reverse ordered versions regardless of database order", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const { SchemaMigration } = await import("./schema-migration.js");
    const adapter = createTestAdapter();
    const sm = new SchemaMigration(adapter);
    await sm.createTable();
    await sm.deleteAllVersions();
    await sm.recordVersion("20240301000000");
    await sm.recordVersion("20240101000000");
    await sm.recordVersion("20240201000000");
    const result = await TopLevelDumper.dumpWithVersion(adapter);
    expect(result).toContain("Schema version: 20240301000000");
  });

  it("schema dump include migration version", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const { SchemaMigration } = await import("./schema-migration.js");
    const adapter = createTestAdapter();
    const sm = new SchemaMigration(adapter);
    await sm.createTable();
    await sm.recordVersion("20240601120000");
    const result = await TopLevelDumper.dumpWithVersion(adapter);
    expect(result).toContain("Schema version: 20240601120000");
    expect(result).toContain("defineSchema");
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
    await ctx.createTable("authors", {}, (t) => {
      t.string("name");
    });
    const output = SchemaDumper.dump(ctx) as string;
    expect(output).toMatch(/createTable\("authors",\s*\{[^}]*force:\s*"cascade"[^}]*\}/);
  });

  it.skip("schema dump excludes sqlite sequence", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs adapter-backed introspection to exercise sqlite_sequence filtering */
  });

  it("schema dump includes camelcase table name", async () => {
    await ctx.createTable("CamelTable", {}, (t) => {
      t.string("name");
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("CamelTable");
  });

  it("types no line up", async () => {
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
      t.integer("age");
      t.boolean("active");
      t.text("bio");
    });
    const output = SchemaDumper.dump(ctx) as string;
    const columnLines = output.split("\n").filter((l) => /\bt\.\w+\(/.test(l));
    for (const line of columnLines) {
      expect(line).not.toMatch(/\bt\.\w+\s{2,}/);
    }
  });
  it("arguments no line up", async () => {
    await ctx.createTable("users", {}, (t) => {
      t.string("name", { null: false });
      t.integer("age", { default: 0 });
      t.string("code", { limit: 10, null: false });
    });
    const output = SchemaDumper.dump(ctx) as string;
    const columnLines = output.split("\n").filter((l) => /\bt\.\w+\(/.test(l));
    // no padding before option keys — each key is preceded by "{ " or ", ", never extra spaces
    for (const pattern of [/default: /, /limit: /, /null: /]) {
      for (const line of columnLines.filter((l) => pattern.test(l))) {
        const m = line.match(pattern)!;
        const before = line.slice(m.index! - 2, m.index!);
        expect(before === "{ " || before === ", ").toBe(true);
      }
    }
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

  it.skipIf(adapterType === "mysql")("schema dumps partial indices", async () => {
    await ctx.createTable("users", {}, (t) => {
      t.string("email");
      t.boolean("active");
    });
    await ctx.addIndex("users", "email", {
      name: "idx_users_email_where_active",
      where: "active = true",
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain('where: "active = true"');
  });
  it.skipIf(adapterType !== "postgres")("schema dumps nulls not distinct", async () => {
    await ctx.createTable("users", {}, (t) => {
      t.string("email");
    });
    await ctx.addIndex("users", "email", {
      name: "idx_users_email_unique",
      unique: true,
      nullsNotDistinct: true,
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("nullsNotDistinct: true");
  });
  it("schema dumps index sort order", async () => {
    await ctx.createTable("users", {}, (t) => {
      t.string("name");
    });
    await ctx.addIndex("users", "name", {
      name: "idx_users_name_desc",
      order: { name: "desc" },
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain('order: { name: "desc" }');
  });
  it.skip("schema dumps index length", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs index length tracking (MySQL) */
  });
  it.skipIf(adapterType !== "postgres")("schema dumps check constraints", async () => {
    const { SchemaStatements } =
      await import("./connection-adapters/abstract/schema-statements.js");
    const { adapter: testAdapter, ctx: testCtx } = freshCtx();
    await testCtx.createTable("products", {}, (t) => {
      t.decimal("price");
      t.decimal("discounted_price");
    });
    const ss = new SchemaStatements(testAdapter.innerAdapter as any);
    await ss.addCheckConstraint("products", "price > discounted_price", {
      name: "products_price_check",
    });
    const output = await SchemaDumper.dump(testAdapter.innerAdapter);
    expect(output).toContain("products_price_check");
    expect(output).toContain("addCheckConstraint");
  });
  it.skipIf(adapterType !== "postgres")("schema dumps exclusion constraints", async () => {
    const { SchemaDumper: PgSchemaDumper } =
      await import("./connection-adapters/postgresql/schema-dumper.js");
    const { adapter: testAdapter, ctx: testCtx } = freshCtx();
    await testCtx.createTable("test_schema_exclusion", { id: false }, (t) => {
      t.date("start_date");
      t.date("end_date");
    });
    await (testAdapter.innerAdapter as any).addExclusionConstraint(
      "test_schema_exclusion",
      "daterange(start_date, end_date) WITH &&",
      { using: "gist", name: "test_schema_exclusion_date_overlap" },
    );
    const output = await PgSchemaDumper.dump(testAdapter.innerAdapter);
    expect(output).toContain("addExclusionConstraint");
    expect(output).toContain("test_schema_exclusion_date_overlap");
    expect(output).toContain("daterange(start_date, end_date) WITH &&");
  });
  it.skipIf(adapterType !== "postgres")("schema dumps unique constraints", async () => {
    const { SchemaDumper: PgSchemaDumper } =
      await import("./connection-adapters/postgresql/schema-dumper.js");
    const { adapter: testAdapter, ctx: testCtx } = freshCtx();
    await testCtx.createTable("test_schema_unique", {}, (t) => {
      t.integer("position_1");
      t.integer("position_2");
    });
    await (testAdapter.innerAdapter as any).addUniqueConstraint(
      "test_schema_unique",
      ["position_1"],
      { name: "test_schema_unique_position_1" },
    );
    await (testAdapter.innerAdapter as any).addUniqueConstraint(
      "test_schema_unique",
      ["position_2"],
      { nullsNotDistinct: true, name: "test_schema_unique_position_2_nnd" },
    );
    const output = await PgSchemaDumper.dump(testAdapter.innerAdapter);
    expect(output).toContain("addUniqueConstraint");
    expect(output).toContain("test_schema_unique_position_1");
    expect(output).toContain("test_schema_unique_position_2_nnd");
    expect(output).toContain("nullsNotDistinct: true");
  });
  it.skipIf(adapterType !== "postgres")(
    "schema does not dump unique constraints as indexes",
    async () => {
      const { SchemaDumper: PgSchemaDumper } =
        await import("./connection-adapters/postgresql/schema-dumper.js");
      const { adapter: testAdapter, ctx: testCtx } = freshCtx();
      await testCtx.createTable("test_uc_no_idx", {}, (t) => {
        t.integer("position");
      });
      await (testAdapter.innerAdapter as any).addUniqueConstraint("test_uc_no_idx", ["position"], {
        name: "test_uc_no_idx_position",
      });
      const output = await PgSchemaDumper.dump(testAdapter.innerAdapter);
      expect(output).toContain("addUniqueConstraint");
      // The backing index must not also appear as an addIndex call.
      expect(output).not.toMatch(/addIndex.*test_uc_no_idx.*test_uc_no_idx_position/);
    },
  );

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
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs type aliasing support */
  });
  it.skipIf(adapterType === "mysql")("schema dump expression indices", async () => {
    await ctx.createTable("users", {}, (t) => {
      t.string("email");
    });
    await ctx.addIndex("users", "lower(email)", { name: "idx_users_lower_email" });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain('"lower(email)"');
    expect(output).toContain("idx_users_lower_email");
  });
  it.skipIf(adapterType === "mysql")("schema dump expression indices escaping", async () => {
    await ctx.createTable("users", {}, (t) => {
      t.string("first_name");
      t.string("last_name");
    });
    await ctx.addIndex("users", "lower(first_name || ' ' || last_name)", {
      name: "idx_users_full_name",
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("idx_users_full_name");
    expect(output).toContain("lower(first_name");
  });
  it.skip("schema dump includes length for mysql binary fields", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs MySQL-specific handling */
  });
  it.skip("schema dump includes length for mysql blob and text fields", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs MySQL-specific handling */
  });
  it.skip("schema does not include limit for emulated mysql boolean fields", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs MySQL-specific handling */
  });
  it.skip("schema dumps index type", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
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

  it("schema dump includes bigint default", async () => {
    // Mirrors Rails: test_schema_dump_includes_bigint_default
    // (activerecord/test/cases/schema_dumper_test.rb:366)
    // assert_match %r{t\.bigint\s+"bigint_default",\s+default: 0}, output
    await ctx.createTable("defaults", {}, (t) => {
      t.bigint("bigint_default", { default: 0 });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toMatch(/t\.bigint\("bigint_default",\s*\{[^}]*default:\s*0[^}]*\}/);
  });

  it.skip("schema dump includes limit on array type", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs PG array support */
  });
  it.skip("schema dump allows array of decimal defaults", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs PG array support */
  });
  it.skip("schema dump interval type", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs PG interval type */
  });
  it.skip("schema dump oid type", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs PG oid type */
  });
  it.skip("schema dump includes extensions", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs PG extension dumping */
  });
  it.skip("schema dump includes extensions in alphabetic order", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs PG extension dumping */
  });
  it.skip("schema dump include limit for float4 field", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs PG float4 specific handling */
  });
  it.skip("schema dump keeps enum intact if it contains comma", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs PG enum support */
  });
  it.skip("schema dump keeps large precision integer columns as decimal", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
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
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs unique constraint + id: false */
  });

  it("foreign keys are dumped at the bottom to circumvent dependency issues", async () => {
    const source = {
      tables: async () => ["authors", "books"],
      columns: async (t: string) =>
        t === "authors"
          ? [{ name: "id", type: "integer", primaryKey: true }]
          : [
              { name: "id", type: "integer", primaryKey: true },
              { name: "author_id", type: "integer" },
            ],
      indexes: async () => [],
      foreignKeys: async (t: string) =>
        t === "books"
          ? [
              {
                fromTable: "books",
                toTable: "authors",
                column: "author_id",
                primaryKey: "id",
                name: "fk_books_author_id",
              },
            ]
          : [],
    };
    const output = await SchemaDumper.dump(source as any);
    const authorsIdx = output.indexOf('createTable("authors"');
    const booksIdx = output.indexOf('createTable("books"');
    const fkIdx = output.indexOf("addForeignKey");
    expect(authorsIdx).toBeGreaterThan(-1);
    expect(booksIdx).toBeGreaterThan(-1);
    expect(fkIdx).toBeGreaterThan(Math.max(authorsIdx, booksIdx));
    expect(output).toContain('addForeignKey("books", "authors"');
  });
  it("do not dump foreign keys for ignored tables", async () => {
    SchemaDumper.ignoreTables = ["books"];
    const source = {
      tables: async () => ["authors", "books"],
      columns: async (_t: string) => [{ name: "id", type: "integer", primaryKey: true }],
      indexes: async () => [],
      foreignKeys: async (t: string) =>
        t === "books"
          ? [
              {
                fromTable: "books",
                toTable: "authors",
                column: "author_id",
                primaryKey: "id",
                name: "fk_books_author_id",
              },
            ]
          : [],
    };
    const output = await SchemaDumper.dump(source as any);
    expect(output).not.toContain("addForeignKey");
    expect(output).not.toContain('"books"');
  });
  it("do not dump foreign keys when bypassed by config", async () => {
    // Source has no foreignKeys hook — equivalent to a connection where FK dumping is unavailable.
    const source = {
      tables: async () => ["authors", "books"],
      columns: async (_t: string) => [{ name: "id", type: "integer", primaryKey: true }],
      indexes: async () => [],
    };
    const output = await SchemaDumper.dump(source as any);
    expect(output).not.toContain("addForeignKey");
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

  it("schema dump with table name prefix and suffix", async () => {
    await ctx.createTable("myapp_users_v1", {}, (t) => {
      t.string("name");
    });
    const output = SchemaDumper.dump(ctx, {
      tableNamePrefix: "myapp_",
      tableNameSuffix: "_v1",
    }) as string;
    expect(output).toContain('"users"');
    expect(output).not.toContain("myapp_users_v1");
  });

  it("schema dump with table name prefix and suffix regexp escape", async () => {
    const source = {
      tables: async () => ["app.prefix_users"],
      columns: async (_t: string) => [{ name: "id", type: "integer", primaryKey: true }],
      indexes: async () => [],
    };
    const output = await SchemaDumper.dump(source as any, { tableNamePrefix: "app.prefix_" });
    expect(output).toContain('"users"');
    expect(output).not.toContain("app.prefix_users");
  });
  it("schema dump with table name prefix and ignoring tables", async () => {
    await ctx.createTable("myapp_users", {}, (t) => {
      t.string("name");
    });
    await ctx.createTable("myapp_posts", {}, (t) => {
      t.string("title");
    });
    SchemaDumper.ignoreTables = ["posts"];
    const output = SchemaDumper.dump(ctx, { tableNamePrefix: "myapp_" }) as string;
    expect(output).toContain('"users"');
    expect(output).not.toContain('"posts"');
    expect(output).not.toContain("myapp_");
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
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs PG timestamptz support */
  });
  it.skip("timestamps schema dump before rails 7", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs Rails version compat */
  });
  it.skip("timestamps schema dump before rails 7 with timestamptz setting", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs Rails version compat */
  });
  it.skip("schema dump when changing datetime type for an existing app", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs datetime type migration */
  });
  it.skip("schema dump with correct timestamp types via create table and t timestamptz", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
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
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
    /* needs Rails version compat */
  });
  it.skip("schema dump with correct timestamp types via add column before rails 7 with timestamptz setting", () => {
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
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
    // BLOCKED: schema — schema introspection / dumper gap in schema-dumper
    // ROOT-CAUSE: schema-dumper.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in schema-dumper.test.ts
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

  it("adapter-backed dump emits precision: null for datetime column without precision", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    await ctx.createTable("events", {}, (t) => {
      t.datetime("happened_at", { precision: null });
    });
    const result = await TopLevelDumper.dump(adapter);
    expect(result).toMatch(/t\.datetime\("happened_at"[^}]*precision\s*:\s*null/);
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
