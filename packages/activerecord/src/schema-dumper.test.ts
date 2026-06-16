import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MigrationContext } from "./migration.js";
import { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
import { cleanDefault, cleanRawPgExpression } from "./schema-dumper.js";
import { createSidecarTestAdapter, createTestAdapter, adapterType } from "./test-adapter.js";
import type { TestDatabaseAdapter } from "./test-adapter.js";
import { itIfSupports } from "./test-helpers/supports.js";
import type { DatabaseAdapter } from "./adapter.js";

function freshCtx(): { adapter: TestDatabaseAdapter; ctx: MigrationContext } {
  const adapter = createTestAdapter();
  const ctx = new MigrationContext(adapter);
  return { adapter, ctx };
}

function freshSidecarCtx(): { adapter: DatabaseAdapter; ctx: MigrationContext } {
  const { adapter } = createSidecarTestAdapter();
  const ctx = new MigrationContext(adapter);
  return { adapter, ctx };
}

// Mirrors: ActiveRecord::TestCase#with_postgresql_datetime_type. Temporarily
// flips PostgreSQLAdapter.datetimeType so :datetime resolves to :timestamptz.
async function withPostgresqlDatetimeType(type: string, fn: () => Promise<void>): Promise<void> {
  const { PostgreSQLAdapter } = await import("./connection-adapters/postgresql-adapter.js");
  const was = PostgreSQLAdapter.datetimeType;
  PostgreSQLAdapter.datetimeType = type;
  try {
    await fn();
  } finally {
    PostgreSQLAdapter.datetimeType = was;
  }
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

  it.skipIf(adapterType !== "sqlite")("schema dump excludes sqlite sequence", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const adapter = createTestAdapter();
    const testCtx = new MigrationContext(adapter);
    await testCtx.createTable("auto_inc", {}, (t) => {
      t.string("name");
    });
    const output = await TopLevelDumper.dump(adapter);
    expect(output).not.toMatch(/createTable\("sqlite_sequence"/);
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
  it("schema dumps index length", async () => {
    const { adapter: lenAdapter, ctx: lenCtx } = freshCtx();
    await lenCtx.createTable("companies", {}, (t) => {
      t.string("name");
      t.string("description");
    });
    await lenCtx.addIndex("companies", ["name", "description"], {
      name: "index_companies_on_name_and_description",
      length: 10,
    });
    const output = (await SchemaDumper.dump(lenAdapter)) as string;
    const line = output.split(/\n/).find((l) => /index_companies_on_name_and_description/.test(l));
    // Sub-part prefix lengths are MySQL-only; other adapters drop the option.
    expect(line?.includes("length: 10")).toBe(adapterType === "mysql");
  });
  it.skipIf(adapterType !== "postgres")("schema dumps check constraints", async () => {
    const { SchemaStatements } =
      await import("./connection-adapters/abstract/schema-statements.js");
    const { adapter: testAdapter, ctx: testCtx } = freshSidecarCtx();
    await testCtx.createTable("products", {}, (t) => {
      t.decimal("price");
      t.decimal("discounted_price");
    });
    const ss = new SchemaStatements(testAdapter as any);
    await ss.addCheckConstraint("products", "price > discounted_price", {
      name: "products_price_check",
    });
    const output = await SchemaDumper.dump(testAdapter);
    expect(output).toContain("products_price_check");
    expect(output).toContain("t.checkConstraint");
  });
  itIfSupports("exclusion_constraints", "schema dumps exclusion constraints", async () => {
    const { SchemaDumper: PgSchemaDumper } =
      await import("./connection-adapters/postgresql/schema-dumper.js");
    const { adapter: testAdapter, ctx: testCtx } = freshSidecarCtx();
    await testCtx.createTable("test_schema_exclusion", { id: false }, (t) => {
      t.date("start_date");
      t.date("end_date");
    });
    await (testAdapter as any).addExclusionConstraint(
      "test_schema_exclusion",
      "daterange(start_date, end_date) WITH &&",
      { using: "gist", name: "test_schema_exclusion_date_overlap" },
    );
    const output = await PgSchemaDumper.dump(testAdapter);
    expect(output).toContain("addExclusionConstraint");
    expect(output).toContain("test_schema_exclusion_date_overlap");
    expect(output).toContain("daterange(start_date, end_date) WITH &&");
  });
  itIfSupports("unique_constraints", "schema dumps unique constraints", async () => {
    const { SchemaDumper: PgSchemaDumper } =
      await import("./connection-adapters/postgresql/schema-dumper.js");
    const { adapter: testAdapter, ctx: testCtx } = freshSidecarCtx();
    await testCtx.createTable("test_schema_unique", {}, (t) => {
      t.integer("position_1");
      t.integer("position_2");
    });
    await (testAdapter as any).addUniqueConstraint("test_schema_unique", ["position_1"], {
      name: "test_schema_unique_position_1",
    });
    await (testAdapter as any).addUniqueConstraint("test_schema_unique", ["position_2"], {
      nullsNotDistinct: true,
      name: "test_schema_unique_position_2_nnd",
    });
    const output = await PgSchemaDumper.dump(testAdapter);
    expect(output).toContain("addUniqueConstraint");
    expect(output).toContain("test_schema_unique_position_1");
    expect(output).toContain("test_schema_unique_position_2_nnd");
    expect(output).toContain("nullsNotDistinct: true");
  });
  itIfSupports(
    "unique_constraints",
    "schema does not dump unique constraints as indexes",
    async () => {
      const { SchemaDumper: PgSchemaDumper } =
        await import("./connection-adapters/postgresql/schema-dumper.js");
      const { adapter: testAdapter, ctx: testCtx } = freshSidecarCtx();
      await testCtx.createTable("test_uc_no_idx", {}, (t) => {
        t.integer("position");
      });
      await (testAdapter as any).addUniqueConstraint("test_uc_no_idx", ["position"], {
        name: "test_uc_no_idx_position",
      });
      const output = await PgSchemaDumper.dump(testAdapter);
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

  it("schema dump aliased types", async () => {
    await ctx.createTable("aliased_types", {}, (t) => {
      t.blob("blob_data");
      t.numeric("numeric_number");
    });
    try {
      const output = SchemaDumper.dump(ctx);
      expect(output).toMatch(/t\.binary\("blob_data"\)/);
      expect(output).toMatch(/t\.decimal\("numeric_number"/);
    } finally {
      // Drop the bespoke table so it doesn't linger on the shared worker DB
      // and perturb other files' schema-signature caching / scheduling.
      await ctx.dropTable("aliased_types");
    }
  });
  itIfSupports("expression_index", "schema dump expression indices", async () => {
    await ctx.createTable("users", {}, (t) => {
      t.string("email");
    });
    await ctx.addIndex("users", "lower(email)", { name: "idx_users_lower_email" });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain('"lower(email)"');
    expect(output).toContain("idx_users_lower_email");
  });
  // NOT converted to itIfSupports: Rails gates this by current_adapter?(:Mysql2,
  // :Trilogy) (schema_dumper_test.rb:313, real-MySQL-only, asserts concat_ws
  // backtick output), not by supports_expression_index?. Our body is a PG/SQLite
  // port (`lower(a || b)`), so it's a pre-existing divergence — left as-is.
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
  it.skipIf(adapterType !== "mysql")(
    "schema dump includes length for mysql binary fields",
    async () => {
      const { adapter, ctx: testCtx } = freshSidecarCtx();
      await testCtx.createTable("binary_fields", {}, (t) => {
        t.binary("var_binary", { limit: 255 });
        t.binary("var_binary_large", { limit: 4095 });
      });
      const output = await SchemaDumper.dump(adapter);
      expect(output).toMatch(/t\.binary\("var_binary", \{ limit: 255 \}\)/);
      expect(output).toMatch(/t\.binary\("var_binary_large", \{ limit: 4095 \}\)/);
    },
  );
  it.skipIf(adapterType !== "mysql")(
    "schema dump includes length for mysql blob and text fields",
    async () => {
      const { adapter: bfAdapter, ctx: bfCtx } = freshCtx();
      await bfCtx.createTable("binary_fields", {}, (t) => {
        t.binary("tiny_blob", { size: "tiny" });
        t.binary("normal_blob");
        t.binary("medium_blob", { size: "medium" });
        t.binary("long_blob", { size: "long" });
        t.text("tiny_text", { size: "tiny" });
        t.text("normal_text");
        t.text("medium_text", { size: "medium" });
        t.text("long_text", { size: "long" });
      });
      const output = (await SchemaDumper.dump(bfAdapter)) as string;
      expect(output).toMatch(/t\.binary\("tiny_blob", \{ size: "tiny" \}\)/);
      expect(output).toMatch(/t\.binary\("normal_blob"\)/);
      expect(output).toMatch(/t\.binary\("medium_blob", \{ size: "medium" \}\)/);
      expect(output).toMatch(/t\.binary\("long_blob", \{ size: "long" \}\)/);
      expect(output).toMatch(/t\.text\("tiny_text", \{ size: "tiny" \}\)/);
      expect(output).toMatch(/t\.text\("normal_text"\)/);
      expect(output).toMatch(/t\.text\("medium_text", \{ size: "medium" \}\)/);
      expect(output).toMatch(/t\.text\("long_text", \{ size: "long" \}\)/);
    },
  );
  it.skipIf(adapterType !== "mysql")(
    "schema does not include limit for emulated mysql boolean fields",
    async () => {
      const { adapter, ctx: testCtx } = freshSidecarCtx();
      await testCtx.createTable("booleans", {}, (t) => {
        t.boolean("has_fun", { default: false });
      });
      const output = await SchemaDumper.dump(adapter);
      expect(output).not.toMatch(/t\.boolean\("has_fun",.+limit: 1/);
    },
  );
  it.skipIf(adapterType !== "mysql")("schema dumps index type", async () => {
    const { adapter: ktAdapter, ctx: ktCtx } = freshCtx();
    await ktCtx.createTable("key_tests", {}, (t) => {
      t.string("awesome");
      t.string("pizza");
    });
    await ktCtx.addIndex("key_tests", "awesome", {
      type: "fulltext",
      name: "index_key_tests_on_awesome",
    });
    await ktCtx.addIndex("key_tests", "pizza", {
      using: "btree",
      name: "index_key_tests_on_pizza",
    });
    const output = (await SchemaDumper.dump(ktAdapter)) as string;
    expect(output).toContain(
      'addIndex("key_tests", "awesome", { name: "index_key_tests_on_awesome", type: "fulltext" })',
    );
    expect(output).toContain(
      'addIndex("key_tests", "pizza", { name: "index_key_tests_on_pizza" })',
    );
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

  it.skipIf(adapterType !== "postgres")("schema dump includes limit on array type", async () => {
    const { adapter, ctx: testCtx } = freshSidecarCtx();
    await testCtx.createTable("bigint_array", {}, (t) => {
      (t as any).integer("big_int_data_points", { limit: 8, array: true });
    });
    const output = await SchemaDumper.dump(adapter);
    expect(output).toMatch(/t\.bigint\("big_int_data_points", \{ array: true \}\)/);
  });
  it.skipIf(adapterType !== "postgres")(
    "schema dump allows array of decimal defaults",
    async () => {
      const { SchemaDumper: PgSchemaDumper } =
        await import("./connection-adapters/postgresql/schema-dumper.js");
      const { adapter: testAdapter, ctx: testCtx } = freshSidecarCtx();
      await testCtx.createTable("bigint_array", {}, (t) => {
        t.integer("big_int_data_points", { limit: 8, array: true });
        t.decimal("decimal_array_default", { array: true, default: [1.23, 3.45] });
      });
      const output = await PgSchemaDumper.dump(testAdapter);
      expect(output).toMatch(
        /t\.decimal\("decimal_array_default",\s*\{[^}]*default:\s*\["1\.23", "3\.45"\][^}]*array:\s*true/,
      );
    },
  );
  it.skipIf(adapterType !== "postgres")("schema dump interval type", async () => {
    const { adapter, ctx: testCtx } = freshSidecarCtx();
    await testCtx.createTable("postgresql_times", {}, (t) => {
      (t as any).interval("time_interval");
      (t as any).interval("scaled_time_interval", { precision: 6 });
    });
    const output = await SchemaDumper.dump(adapter);
    expect(output).toMatch(/t\.interval\("time_interval"\)/);
    expect(output).toMatch(/t\.interval\("scaled_time_interval", \{ precision: 6 \}\)/);
  });
  it.skipIf(adapterType !== "postgres")("schema dump oid type", async () => {
    const { adapter, ctx: testCtx } = freshSidecarCtx();
    await testCtx.createTable("postgresql_oids", {}, (t) => {
      (t as any).oid("obj_id");
    });
    const output = await SchemaDumper.dump(adapter);
    expect(output).toMatch(/t\.oid\("obj_id"\)/);
  });
  it.skipIf(adapterType !== "postgres")("schema dump includes extensions", async () => {
    const { SchemaDumper: PgSchemaDumper } =
      await import("./connection-adapters/postgresql/schema-dumper.js");
    const { adapter } = freshSidecarCtx();
    const original = (adapter as any).extensions;
    try {
      (adapter as any).extensions = async () => ["hstore"];
      let output = await PgSchemaDumper.dump(adapter);
      expect(output).toContain("These are extensions that must be enabled");
      expect(output).toMatch(/enableExtension\("hstore"\)/);

      (adapter as any).extensions = async () => [];
      output = await PgSchemaDumper.dump(adapter);
      expect(output).not.toContain("These are extensions that must be enabled");
      expect(output).not.toContain("enableExtension");
    } finally {
      (adapter as any).extensions = original;
    }
  });
  it.skipIf(adapterType !== "postgres")(
    "schema dump includes extensions in alphabetic order",
    async () => {
      const { SchemaDumper: PgSchemaDumper } =
        await import("./connection-adapters/postgresql/schema-dumper.js");
      const { adapter } = freshSidecarCtx();
      const original = (adapter as any).extensions;
      try {
        (adapter as any).extensions = async () => ["uuid-ossp", "xml2", "hstore"];
        const output = await PgSchemaDumper.dump(adapter);
        const enabled = [...output.matchAll(/enableExtension\("(.+?)"\)/g)].map((m) => m[1]);
        expect(enabled).toEqual(["hstore", "uuid-ossp", "xml2"]);
      } finally {
        (adapter as any).extensions = original;
      }
    },
  );
  it.skipIf(adapterType !== "postgres")("schema dump include limit for float4 field", async () => {
    const { adapter, ctx: testCtx } = freshSidecarCtx();
    await testCtx.createTable("numeric_data", {}, (t) => {
      t.float("temperature_with_limit", { limit: 24 });
    });
    const output = await SchemaDumper.dump(adapter);
    expect(output).toMatch(/t\.float\("temperature_with_limit", \{ limit: 24 \}\)/);
  });
  it.skipIf(adapterType !== "postgres")(
    "schema dump keeps enum intact if it contains comma",
    async () => {
      const { adapter } = freshSidecarCtx();
      await (adapter as any).createEnum("enum_with_comma", ["value1", "value,2", "value3"]);
      try {
        const output = await SchemaDumper.dump(adapter);
        expect(output).toContain('createEnum("enum_with_comma", ["value1","value,2","value3"])');
      } finally {
        // drop-all-tables (per-test reset) does not drop enum types — clean up
        // explicitly so the type does not leak onto the shared worker DB.
        await (adapter as any).dropEnum("enum_with_comma", { ifExists: true });
      }
    },
  );
  it("schema dump keeps large precision integer columns as decimal", async () => {
    await ctx.createTable("numeric_data", {}, (t) => {
      t.decimal("atoms_in_universe", { precision: 55 });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toMatch(/t\.decimal\("atoms_in_universe",\s*\{[^}]*precision:\s*55/);
  });

  it("schema dump keeps id column when id is false and id column added", async () => {
    await ctx.createTable("goofy_string_id", { id: false }, (t) => {
      t.string("id", { null: false });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("id: false");
    expect(output).toMatch(/string.*"id".*null: false/);
  });

  it("schema dump keeps id false when id is false and unique not null column added", async () => {
    await ctx.createTable("string_key_objects", { id: false }, (t) => {
      t.string("key", { null: false });
    });
    await ctx.addIndex("string_key_objects", "key", { unique: true });
    const output = SchemaDumper.dump(ctx);
    expect(output).toMatch(/createTable\("string_key_objects",\s*\{[^}]*id:\s*false/);
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

  it.skipIf(adapterType !== "postgres")(
    "schema dump with timestamptz datetime format",
    async () => {
      await withPostgresqlDatetimeType("timestamptz", async () => {
        await ctx.createTable("timestamps", {}, (t) => {
          t.datetime("this_should_remain_datetime");
          (t as any).timestamptz("this_is_an_alias_of_datetime");
          t.column("without_time_zone", "timestamp");
          t.column("with_time_zone", "timestamptz");
        });
        const output = SchemaDumper.dump(ctx) as string;
        expect(output).toContain('t.datetime("this_should_remain_datetime"');
        expect(output).toContain('t.datetime("this_is_an_alias_of_datetime"');
        expect(output).toContain('t.timestamp("without_time_zone"');
        expect(output).toContain('t.datetime("with_time_zone"');
      });
    },
  );
  it.skip("timestamps schema dump before rails 7", () => {
    // BLOCKED: needs Migration version compatibility (Migration[6.1]).
    // Tracked: rfcs/0030-ar-test-compare-residual-burndown/stories/c1-schema-dumper-residual-gaps.md
  });
  it.skip("timestamps schema dump before rails 7 with timestamptz setting", () => {
    // BLOCKED: needs Migration version compatibility + datetime_type-aware dump.
    // Tracked: rfcs/0030-ar-test-compare-residual-burndown/stories/c1-schema-dumper-residual-gaps.md
  });
  it.skipIf(adapterType !== "postgres")(
    "schema dump when changing datetime type for an existing app",
    async () => {
      await ctx.createTable("timestamps", {}, (t) => {
        t.datetime("default_format");
        t.column("without_time_zone", "timestamp");
        t.column("with_time_zone", "timestamptz");
      });

      let output = SchemaDumper.dump(ctx) as string;
      expect(output).toContain('t.datetime("default_format"');
      expect(output).toContain('t.datetime("without_time_zone"');
      expect(output).toContain('t.timestamptz("with_time_zone"');

      await withPostgresqlDatetimeType("timestamptz", async () => {
        output = SchemaDumper.dump(ctx) as string;
        expect(output).toContain('t.timestamp("default_format"');
        expect(output).toContain('t.timestamp("without_time_zone"');
        expect(output).toContain('t.datetime("with_time_zone"');
      });
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via create table and t timestamptz",
    async () => {
      await ctx.createTable("timestamps", {}, (t) => {
        t.datetime("default_format");
        t.datetime("without_time_zone");
        t.timestamp("also_without_time_zone");
        (t as any).timestamptz("with_time_zone");
      });
      const output = SchemaDumper.dump(ctx) as string;
      expect(output).toContain('t.datetime("default_format"');
      expect(output).toContain('t.datetime("without_time_zone"');
      expect(output).toContain('t.datetime("also_without_time_zone"');
      expect(output).toContain('t.timestamptz("with_time_zone"');
    },
  );

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
    // BLOCKED: needs Migration version compatibility (Migration[6.1]).
    // Tracked: rfcs/0030-ar-test-compare-residual-burndown/stories/c1-schema-dumper-residual-gaps.md
  });
  it.skip("schema dump with correct timestamp types via add column before rails 7 with timestamptz setting", () => {
    // BLOCKED: needs Migration version compatibility + datetime_type-aware dump.
    // Tracked: rfcs/0030-ar-test-compare-residual-burndown/stories/c1-schema-dumper-residual-gaps.md
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

  // MySQL 8 strict mode forbids TEXT column defaults; MariaDB allowed them.
  it.skipIf(adapterType === "mysql")("schema dump with text column", async () => {
    await ctx.createTable("dump_defaults", {}, (t) => {
      t.text("text_with_default", { default: "John" });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toMatch(/text.*"text_with_default".*default: "John"/);
  });

  it.skip("schema dump with column infinity default", () => {
    // BLOCKED: PG default-introspection path — float defaults arrive as the bare
    // string "Infinity"/"NaN" (no ::cast), and datetime/date defaults are already
    // rendered as the Ruby literal `::Float::INFINITY` via the OID type's
    // typeCastForSchema, so the fix is not in cleanDefault. Tracked by
    // c1-schema-dumper-pg-infinity-default (RFC 0030).
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

  it("adapter-backed dump preserves explicit string limit through AdapterSchemaSource", async () => {
    // Guards the U2 type/sqlType split: emitTable resolves the limit from the
    // dsl/raw type carried by AdapterSchemaSource. A live introspected column's
    // limit must survive the round-trip on the adapter path (not just the
    // in-memory MigrationContext path).
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    await ctx.createTable("codes", {}, (t) => {
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
