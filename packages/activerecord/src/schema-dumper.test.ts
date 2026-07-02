import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { Base } from "./base.js";
import { MigrationContext } from "./migration.js";
import { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
import type { SchemaSource } from "./schema-dumper.js";
import { createSidecarTestAdapter, createTestAdapter, adapterType } from "./test-adapter.js";
import type { TestDatabaseAdapter } from "./test-adapter.js";
import { itIfSupports, adapterSupports } from "./test-helpers/supports.js";
import { setupFixtures } from "./test-helpers/fixtures.js";
import { dumpAllTableSchema, dumpTableSchema } from "./test-helpers/schema-dumping-helper.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";

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

// Faithful port of the Rails cases that dump the *standard loaded schema*
// (`standard_dump` / `dump_table_schema "companies"`). Rails loads `schema.rb`;
// we ride the canonical `TEST_SCHEMA` — the trails mirror of `schema.rb` —
// which `setupFixtures()` materializes on the shared worker DB and shields from
// the per-test reset, so `Base.adapter` already carries every canonical table.
// No per-test ad-hoc tables. Split into its own describe (no bespoke
// table-building cases) so nothing `force`-recreates a canonical table out from
// under the dump.
describe("SchemaDumperTest", () => {
  setupFixtures();

  function canonicalSource(): SchemaSource {
    return Base.adapter as unknown as SchemaSource;
  }
  function standardDump(ignoreTables: (string | RegExp)[] = []): Promise<string> {
    return dumpAllTableSchema(canonicalSource(), ignoreTables);
  }
  function dumpCanonicalTable(...tables: string[]): Promise<string> {
    return dumpTableSchema(canonicalSource(), ...tables);
  }
  // Whether a dumped canonical `companies` index surfaces its descending sort
  // order. Rails gates this on `supports_index_sort_order?` (PostgreSQL/SQLite
  // always; MySQL/MariaDB version-gated: MariaDB ≥ 10.8.1 / MySQL ≥ 8.0.1). We
  // mirror that by consulting the live adapter flag rather than blanket-excluding
  // the MySQL family — the CI MariaDB 11 lane supports it, so `companies` dumps
  // the descending `order:` exactly as Rails does there.
  function dumpsIndexSortOrder(): boolean {
    return (
      Base.adapter as unknown as { supportsIndexSortOrder(): boolean }
    ).supportsIndexSortOrder();
  }

  it("schema dump", async () => {
    const output = await standardDump();
    expect(output).toMatch(/createTable\("accounts"/);
    expect(output).toMatch(/createTable\("authors"/);
    expect(output).not.toMatch(/createTable\("schema_migrations"/);
    expect(output).not.toMatch(/createTable\("ar_internal_metadata"/);
  });

  it("schema dump uses force cascade on create table", async () => {
    const output = await dumpCanonicalTable("authors");
    expect(output).toMatch(/createTable\("authors",.*force:\s*"cascade"/);
  });

  it("schema dump excludes sqlite sequence", async () => {
    const output = await standardDump();
    expect(output).not.toMatch(/createTable\("sqlite_sequence"/);
  });

  it("schema dump includes camelcase table name", async () => {
    const output = await standardDump();
    expect(output).toMatch(/createTable\("CamelCase"/);
  });

  it("types no line up", async () => {
    const output = await standardDump();
    const columnLines = output.split("\n").filter((l) => /\bt\.\w+\(/.test(l));
    for (const line of columnLines) {
      expect(line).not.toMatch(/\bt\.\w+\s{2,}/);
    }
  });
  it("arguments no line up", async () => {
    const output = await standardDump();
    const columnLines = output.split("\n").filter((l) => /\bt\.\w+\(/.test(l));
    // no padding before option keys — each key is preceded by "{ " or ", ", never extra spaces
    for (const pattern of [/default: /, /limit: /, /null: /]) {
      for (const line of columnLines.filter((l) => pattern.test(l))) {
        const m = line.match(pattern)!;
        const before = line.slice(m.index! - 2, m.index);
        expect(before === "{ " || before === ", ").toBe(true);
      }
    }
  });

  it("no dump errors", async () => {
    const output = await standardDump();
    expect(output).not.toContain("# Could not dump table");
  });

  it("schema dump includes not null columns", async () => {
    // Rails: dump_all_table_schema([/^[^r]/]) — keep only tables starting with
    // `r`, then assert some column dumps `null: false`.
    const output = await standardDump([/^[^r]/]);
    expect(output).toContain("null: false");
  });

  it("schema dump with string ignored table", async () => {
    // Rails: dump_table_schema("authors") — every other data source is ignored.
    const output = await dumpCanonicalTable("authors");
    expect(output).not.toMatch(/createTable\("accounts"/);
    expect(output).toMatch(/createTable\("authors"/);
    expect(output).not.toMatch(/createTable\("schema_migrations"/);
    expect(output).not.toMatch(/createTable\("ar_internal_metadata"/);
  });

  it("schema dump does not emit id false for normal tables", async () => {
    const output = await dumpCanonicalTable("authors");
    expect(output).not.toContain("id: false");
    expect(output).not.toContain('t.integer("id"');
  });

  it("schema dump should honor nonstandard primary keys", async () => {
    // Rails: standard_dump — canonical `movies` has `primary_key: "movieid"`.
    const output = await standardDump();
    const match = output.match(/createTable\("movies"(.*)/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/primaryKey: "movieid"/);
  });

  it("schema dump should use false as default", async () => {
    // Rails: dump_table_schema "booleans" — canonical `has_fun` default false.
    const output = await dumpCanonicalTable("booleans");
    expect(output).toMatch(/t\.boolean\("has_fun",.*default: false/);
  });

  it("schema dump does not include limit for text field", async () => {
    // Rails: dump_table_schema "admin_users" — canonical `params` is text.
    const output = await dumpCanonicalTable("admin_users");
    expect(output).toMatch(/t\.text\("params"\)/);
    expect(output).not.toMatch(/text.*"params".*limit/);
  });

  it("schema dump does not include limit for binary field", async () => {
    const output = await dumpCanonicalTable("binaries");
    expect(output).toMatch(/t\.binary\("data"\)/);
    expect(output).not.toMatch(/binary.*"data".*limit/);
  });

  it("schema dump does not include limit for float field", async () => {
    const output = await dumpCanonicalTable("numeric_data");
    expect(output).toMatch(/t\.float\("temperature"\)/);
    expect(output).not.toMatch(/float.*"temperature".*limit/);
  });

  it("schema dump aliased types", async () => {
    // Rails: standard_dump — canonical `binaries.blob_data` (t.blob) dumps as
    // binary, `numeric_data.numeric_number` (t.numeric) dumps as decimal.
    const output = await standardDump();
    expect(output).toMatch(/t\.binary\("blob_data"\)/);
    // Rails sources the decimal precision default from native_database_types
    // (nil on SQLite), so precision-less `t.decimal`/`t.numeric` columns dump
    // bare — no `precision:` option.
    expect(output).toMatch(/t\.decimal\("numeric_number"\)/);
    expect(output).toMatch(/t\.decimal\("decimal_number"\)/);
  });

  it("schema dump keeps id column when id is false and id column added", async () => {
    // Rails: standard_dump — canonical `goofy_string_id` is `id: false` with a
    // non-PK `id` string column.
    const output = await standardDump();
    const match = output.match(/createTable\("goofy_string_id"(.*)\n(.*)\n/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/id: false/);
    expect(match![2]).toMatch(/t\.string\("id",.*null: false/);
  });

  // Helper: grep the lone dumped `addIndex` line for `companies` matching `re`,
  // mirroring Rails' `dump_table_schema("companies").split(/\n/).grep(...).first`.
  function companyIndexLine(output: string, re: RegExp): string {
    return (
      output.split(/\n/).find((l) => /addIndex\("companies"/.test(l) && re.test(l)) ?? ""
    ).trim();
  }

  it("schema dumps index columns in right order", async () => {
    const output = await dumpCanonicalTable("companies");
    const line = companyIndexLine(output, /company_index/);
    // Rails branches on current_adapter? + supports_index_sort_order?: MySQL
    // keeps the sub-part length map, other adapters drop it; the sort order is
    // present only where the backend surfaces it (schema_dumper_test.rb:170-183).
    // `index_parts` emits length before order.
    const base =
      'await ctx.addIndex("companies", ["firm_id", "type", "rating"], { name: "company_index"';
    const lengthPart = adapterType === "mysql" ? ", length: { type: 10 }" : "";
    const orderPart = dumpsIndexSortOrder() ? ', order: { rating: "desc" }' : "";
    expect(line).toBe(`${base}${lengthPart}${orderPart} });`);
  });

  it("schema dumps partial indices", async () => {
    const output = await dumpCanonicalTable("companies");
    const line = companyIndexLine(output, /company_partial_index/);
    // Rails branches on supports_partial_index?; unsupported backends (MySQL)
    // emit the plain index with no `where:`.
    const expected = adapterSupports("partial_index")
      ? 'await ctx.addIndex("companies", ["firm_id", "type"], { name: "company_partial_index", where: "(rating > 10)" });'
      : 'await ctx.addIndex("companies", ["firm_id", "type"], { name: "company_partial_index" });';
    expect(line).toBe(expected);
  });

  it("schema dumps nulls not distinct", async () => {
    const output = await dumpCanonicalTable("companies");
    const line = companyIndexLine(output, /company_nulls_not_distinct/);
    // Rails branches on supports_nulls_not_distinct? (PostgreSQL ≥ 15 only);
    // unsupported backends emit a plain index with no `nullsNotDistinct:`.
    const expected = adapterSupports("nulls_not_distinct")
      ? 'await ctx.addIndex("companies", "firm_id", { name: "company_nulls_not_distinct", nullsNotDistinct: true });'
      : 'await ctx.addIndex("companies", "firm_id", { name: "company_nulls_not_distinct" });';
    expect(line).toBe(expected);
  });

  it("schema dumps index sort order", async () => {
    const output = await dumpCanonicalTable("companies");
    const line = companyIndexLine(output, /_name_and_rating/);
    // Rails IndexDefinition#concise_options collapses a uniform order map to a
    // scalar (`order: :desc`); backends that don't surface sort order here emit a
    // plain index (schema_dumper_test.rb:203-211).
    const expected = dumpsIndexSortOrder()
      ? 'await ctx.addIndex("companies", ["name", "rating"], { name: "index_companies_on_name_and_rating", order: "desc" });'
      : 'await ctx.addIndex("companies", ["name", "rating"], { name: "index_companies_on_name_and_rating" });';
    expect(line).toBe(expected);
  });

  it("schema dumps index length", async () => {
    const output = await dumpCanonicalTable("companies");
    const line = companyIndexLine(output, /_name_and_description/);
    // Sub-part prefix lengths are MySQL-only; other adapters drop the option.
    const expected =
      adapterType === "mysql"
        ? 'await ctx.addIndex("companies", ["name", "description"], { name: "index_companies_on_name_and_description", length: 10 });'
        : 'await ctx.addIndex("companies", ["name", "description"], { name: "index_companies_on_name_and_description" });';
    expect(line).toBe(expected);
  });

  itIfSupports("expression_index", "schema dump expression indices", async () => {
    const output = await dumpCanonicalTable("companies");
    let line = companyIndexLine(output, /company_expression_index/);
    line = line.replace(/, \{ name: "company_expression_index" \}\);$/, "");
    if (adapterType === "postgres") {
      expect(line).toMatch(/CASE.+lower\(\(name\)::text\).+END\) DESC"/i);
    } else {
      expect(line).toMatch(/CASE.+lower\(name\).+END\) DESC"/i);
    }
  });

  it("schema dump includes decimal options", async () => {
    // Rails: dump_all_table_schema([/^[^n]/]) — keep only tables starting with
    // `n` (numeric_data), then assert the scaled decimal + default round-trips.
    const output = await standardDump([/^[^n]/]);
    expect(output).toMatch(/precision: 3,\s+scale: 2,\s+default: "2\.78"/);
  });

  it("schema dump keeps large precision integer columns as decimal", async () => {
    // Rails: standard_dump — canonical `numeric_data.atoms_in_universe` is a
    // precision-55, scale-0 decimal, dumped without a scale option.
    const output = await standardDump();
    expect(output).toMatch(/t\.decimal\("atoms_in_universe",\s*\{[^}]*precision:\s*55/);
  });

  it("schema dump includes limit constraint for integer columns", async () => {
    // Rails: dump_all_table_schema([/^(?!integer_limits)/]) with per-adapter
    // `limit` expectations for `integer_limits.c_int_1..8`.
    const output = await standardDump([/^(?!integer_limits)/]);
    expect(output).toMatch(/"c_int_without_limit"(?!.*limit)/);

    // c_int_1..4: PostgreSQL rounds limit 1..2 → 2 bytes and drops it for the
    // 4-byte 3..4; MySQL keeps 1..3 and drops the 4-byte 4; SQLite keeps 1..4.
    const lowExpectations: RegExp[] =
      adapterType === "postgres"
        ? [/c_int_1.*limit: 2/, /c_int_2.*limit: 2/, /"c_int_3"(?!.*limit)/, /"c_int_4"(?!.*limit)/]
        : adapterType === "mysql"
          ? [/c_int_1.*limit: 1/, /c_int_2.*limit: 2/, /c_int_3.*limit: 3/, /"c_int_4"(?!.*limit)/]
          : [/c_int_1.*limit: 1/, /c_int_2.*limit: 2/, /c_int_3.*limit: 3/, /c_int_4.*limit: 4/];
    // c_int_5..8: only SQLite keeps them as limited integers; PG/MySQL widen to
    // a bare bigint.
    const highExpectations: RegExp[] =
      adapterType === "sqlite"
        ? [/c_int_5.*limit: 5/, /c_int_6.*limit: 6/, /c_int_7.*limit: 7/, /c_int_8.*limit: 8/]
        : [
            /t\.bigint\("c_int_5"\)/,
            /t\.bigint\("c_int_6"\)/,
            /t\.bigint\("c_int_7"\)/,
            /t\.bigint\("c_int_8"\)/,
          ];
    for (const re of [...lowExpectations, ...highExpectations]) expect(output).toMatch(re);
  });
});

// Deferred-convergence cases: still build ad-hoc, non-canonical tables
// (adapter-specific `defaults`/`bigint_array`/`binary_fields`/`key_tests`/… not
// in `schema.rb`, decimal precision/integer limit that SQLite reflection can't
// recover, table-name prefix/suffix migrations, etc.). Kept on the plain
// per-test reset (no `setupFixtures()`) so their bespoke tables are dropped
// between tests. The `companies` index-dump cases have moved to the canonical
// block above (RFC 0048 IndexSpec extension); the rest await the missing
// adapter tables / reflection fixes — tracked as follow-up stories under RFC 0048.
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

  it("schema dump with regexp ignored table", async () => {
    await ctx.createTable("users", {}, (t) => t.string("name"));
    await ctx.createTable("temp_cache", {}, (t) => t.string("val"));
    SchemaDumper.ignoreTables = [/^temp_/];
    const output = SchemaDumper.dump(ctx);
    expect(output).toContain("users");
    expect(output).not.toContain("temp_cache");
  });

  // Deferred: Rails' canonical `string_key_objects` is `id: false` +
  // `t.string :id, null: false` + `t.index :id, unique: true`
  // (schema.rb:1162-1166). Converging onto that canonical shape needs a trails
  // MySQL/MariaDB fix first — reflection there promotes the unique NOT NULL `id`
  // index to the primary key, so the dump emits `id: "string"` instead of
  // `id: false`. Until that's fixed this stays on an ad-hoc table whose unique
  // column is `key` (not `id`), which keeps the explicit `id: false` in the dump
  // on every adapter. Tracked as an RFC 0048 follow-up story.
  it("schema dump keeps id false when id is false and unique not null column added", async () => {
    await ctx.createTable("string_key_objects", { id: false }, (t) => {
      t.string("key", { null: false });
    });
    await ctx.addIndex("string_key_objects", "key", { unique: true });
    const output = SchemaDumper.dump(ctx);
    expect(output).toMatch(/createTable\("string_key_objects",\s*\{[^}]*id:\s*false/);
  });

  itIfSupports("check_constraints", "schema dumps check constraints", async () => {
    const { SchemaStatements } =
      await import("./connection-adapters/abstract/schema-statements.js");
    const { adapter: testAdapter, ctx: testCtx } = freshSidecarCtx();
    await testCtx.createTable("products", { force: true }, (t) => {
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
      const output = await SchemaDumper.dump(bfAdapter);
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
      await testCtx.createTable("booleans", { force: true }, (t) => {
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
    const output = await SchemaDumper.dump(ktAdapter);
    expect(output).toContain(
      'addIndex("key_tests", "awesome", { name: "index_key_tests_on_awesome", type: "fulltext" })',
    );
    expect(output).toContain(
      'addIndex("key_tests", "pizza", { name: "index_key_tests_on_pizza" })',
    );
  });

  it.skipIf(adapterType !== "postgres")("schema dump includes bigint default", async () => {
    // Mirrors Rails: test_schema_dump_includes_bigint_default
    // (activerecord/test/cases/schema_dumper_test.rb:366)
    // assert_match %r{t\.bigint\s+"bigint_default",\s+default: 0}, output
    await ctx.createTable("defaults", {}, (t) => {
      t.bigint("bigint_default", { default: 0 });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toMatch(/t\.bigint\("bigint_default",\s*\{[^}]*default:\s*0[^}]*\}/);
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
    await testCtx.createTable("numeric_data", { force: true }, (t) => {
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

  itIfSupports(
    "foreign_keys",
    "foreign keys are dumped at the bottom to circumvent dependency issues",
    async () => {
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
    },
  );
  itIfSupports("foreign_keys", "do not dump foreign keys for ignored tables", async () => {
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
  itIfSupports("foreign_keys", "do not dump foreign keys when bypassed by config", async () => {
    // Source has no foreignKeys hook — equivalent to a connection where FK dumping is unavailable.
    const source = {
      tables: async () => ["authors", "books"],
      columns: async (_t: string) => [{ name: "id", type: "integer", primaryKey: true }],
      indexes: async () => [],
    };
    const output = await SchemaDumper.dump(source as any);
    expect(output).not.toContain("addForeignKey");
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

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via create table and t column",
    async () => {
      await ctx.createTable("posts", {}, (t) => {
        t.string("title");
        t.timestamps();
      });
      const output = SchemaDumper.dump(ctx);
      expect(output).toContain("datetime");
      expect(output).toContain("created_at");
      expect(output).toContain("updated_at");
    },
  );

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
  it.skipIf(adapterType !== "postgres")("timestamps schema dump before rails 7", (ctx) => {
    ctx.skip();
    // BLOCKED: needs Migration version compatibility (Migration[6.1]).
    // Tracked: rfcs/0030-ar-test-compare-residual-burndown/stories/c1-schema-dumper-residual-gaps.md
  });
  it.skipIf(adapterType !== "postgres")(
    "timestamps schema dump before rails 7 with timestamptz setting",
    (ctx) => {
      ctx.skip();
      // BLOCKED: needs Migration version compatibility + datetime_type-aware dump.
      // Tracked: rfcs/0030-ar-test-compare-residual-burndown/stories/c1-schema-dumper-residual-gaps.md
    },
  );
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

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column",
    async () => {
      await ctx.createTable("posts", {}, (t) => {
        t.string("title");
      });
      await ctx.addColumn("posts", "created_at", "datetime");
      const output = SchemaDumper.dump(ctx);
      expect(output).toContain("datetime");
      expect(output).toContain("created_at");
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column before rails 7",
    (ctx) => {
      ctx.skip();
      // BLOCKED: needs Migration version compatibility (Migration[6.1]).
      // Tracked: rfcs/0030-ar-test-compare-residual-burndown/stories/c1-schema-dumper-residual-gaps.md
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column before rails 7 with timestamptz setting",
    (ctx) => {
      ctx.skip();
      // BLOCKED: needs Migration version compatibility + datetime_type-aware dump.
      // Tracked: rfcs/0030-ar-test-compare-residual-burndown/stories/c1-schema-dumper-residual-gaps.md
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column with type as string",
    async () => {
      await ctx.createTable("posts", {}, (t) => {
        t.string("title");
      });
      await ctx.addColumn("posts", "posted_at", "datetime");
      const output = SchemaDumper.dump(ctx);
      expect(output).toContain("datetime");
      expect(output).toContain("posted_at");
    },
  );
});

describe("SchemaDumperDefaultsTest", () => {
  let ctx: MigrationContext;
  let adapter: TestDatabaseAdapter;
  beforeEach(async () => {
    const f = freshCtx();
    ctx = f.ctx;
    adapter = f.adapter;
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
  itIfSupports("text_column_with_default", "schema dump with text column", async () => {
    await ctx.createTable("dump_defaults", {}, (t) => {
      t.text("text_with_default", { default: "John" });
    });
    const output = SchemaDumper.dump(ctx);
    expect(output).toMatch(/text.*"text_with_default".*default: "John"/);
  });

  it.skipIf(adapterType !== "postgres")("schema dump with column infinity default", async () => {
    await ctx.createTable("infinity_defaults", {}, (t) => {
      t.float("float_with_inf_default", { default: Infinity });
      t.float("float_with_nan_default", { default: NaN });
      t.datetime("beginning_of_time", { default: "-infinity" });
      t.datetime("end_of_time", { default: "infinity" });
      t.date("date_with_neg_inf_default", { default: -Infinity });
      t.date("date_with_pos_inf_default", { default: Infinity });
    });
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const output = await TopLevelDumper.dumpTableSchema(adapter, "infinity_defaults");
    expect(output).toMatch(/t\.float\("float_with_inf_default",.*default: ::Float::INFINITY/);
    expect(output).toMatch(/t\.float\("float_with_nan_default",.*default: ::Float::NAN/);
    expect(output).toMatch(/t\.datetime\("beginning_of_time",.*default: -::Float::INFINITY/);
    expect(output).toMatch(/t\.datetime\("end_of_time",.*default: ::Float::INFINITY/);
    expect(output).toMatch(/t\.date\("date_with_neg_inf_default",.*default: -::Float::INFINITY/);
    expect(output).toMatch(/t\.date\("date_with_pos_inf_default",.*default: ::Float::INFINITY/);
  });
});

// The deferred bespoke cases in the second `SchemaDumperTest` describe build
// real ad-hoc tables via MigrationContext on the shared per-worker DB; drop
// every one they create, by name, so the leaked tables don't collide with
// sibling files under parallel forks. The canonical tables the first describe
// *rides* (accounts/authors/binaries/movies/…) are shielded by `setupFixtures`
// and are NOT dropped here. `companies`/`booleans`/`numeric_data`/`posts`/
// `products` appear only because deferred cases still `force`-recreate them on
// some adapters; the per-file schema repair restores the canonical shape after.
afterAll(async () => {
  const { ctx } = freshCtx();
  const o = { ifExists: true } as const;
  await ctx.dropTable("bigint_array", o);
  await ctx.dropTable("binary_fields", o);
  await ctx.dropTable("booleans", o);
  await ctx.dropTable("companies", o);
  await ctx.dropTable("defaults", o);
  await ctx.dropTable("dump_defaults", o);
  await ctx.dropTable("indexed", o);
  await ctx.dropTable("infinity_defaults", o);
  await ctx.dropTable("key_tests", o);
  await ctx.dropTable("limits", o);
  await ctx.dropTable("myapp_posts", o);
  await ctx.dropTable("myapp_users", o);
  await ctx.dropTable("myapp_users_v1", o);
  await ctx.dropTable("numeric_data", o);
  await ctx.dropTable("postgresql_oids", o);
  await ctx.dropTable("postgresql_times", o);
  await ctx.dropTable("posts", o);
  await ctx.dropTable("products", o);
  await ctx.dropTable("string_key_objects", o);
  await ctx.dropTable("temp_cache", o);
  await ctx.dropTable("test_schema_exclusion", o);
  await ctx.dropTable("test_schema_unique", o);
  await ctx.dropTable("test_uc_no_idx", o);
  await ctx.dropTable("timestamps", o);
  await ctx.dropTable("users", o);
});
