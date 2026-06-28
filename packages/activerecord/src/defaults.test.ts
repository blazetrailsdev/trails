/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/defaults_test.rb
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { SchemaDumper } from "./schema-dumper.js";
import type { SchemaSource } from "./schema-dumper.js";
import { NotNullViolation } from "./errors.js";
import { createTestAdapter, adapterType } from "./test-adapter.js";
import { MigrationContext } from "./migration.js";
import type { DatabaseAdapter } from "./adapter.js";
import {
  describeIfMysql,
  Mysql2Adapter,
  MYSQL_TEST_URL,
  supportsDefaultExpression,
} from "./adapters/abstract-mysql-adapter/test-helper.js";
import { describeIfPg } from "./adapters/postgresql/test-helper.js";
import { describeIfSqlite } from "./adapters/sqlite3/test-helper.js";
import { describeIfSupports, itIfSupports } from "./test-helpers/supports.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Entrant } from "./test-helpers/models/entrant.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

// Most suites below build their adapter-specific tables dynamically in
// `beforeEach` (mirroring Rails' `setup` `@connection.create_table ...`): these
// tables are not in `schema.rb` and have no canonical home, so they are created
// per-test through the migration DSL on a pool-leased adapter and dropped in
// `afterEach`. Building in `beforeEach` (not `beforeAll`) because the shared
// per-worker DB is reset by the global `beforeEach` in test-setup-ar.ts.

// Rails asserts string equality on binary-column defaults; a binary column
// deserializes to bytes in trails (BinaryType → Uint8Array), so decode the
// faithful analog of Ruby's binary string before comparing.
function decodeBinaryDefault(value: unknown): string {
  if (typeof value === "string") return value;
  return new TextDecoder().decode(value as Uint8Array);
}

describe("DefaultTest", () => {
  // Rails: `require "models/entrant"` + `fixtures` not needed — the test only
  // reads `Entrant.columns_hash`. Wire the canonical `entrants` table so the
  // shared model resolves regardless of any bespoke `entrants` a sibling left.
  useHandlerFixtures(["entrants"], { schema: canonicalSchema });

  it("nil defaults for not null columns", async () => {
    await Entrant.loadSchema();
    const columns = Entrant.columnsHash();
    for (const name of ["id", "name", "course_id"]) {
      const column = columns[name];
      expect(column.null).toBe(false);
      expect(column.default).toBeFalsy();
    }
  });
});

// Rails gates `test_multiline_default_text` to
// `current_adapter?(:PostgreSQLAdapter) || current_adapter?(:SQLite3Adapter)`.
// The `multiline_default` column comes from the adapter-specific `defaults`
// table (postgresql_specific_schema.rb / sqlite_specific_schema.rb).
describe.skipIf(adapterType === "mysql")("DefaultTest", () => {
  it("multiline default text", async () => {
    const adapter = createTestAdapter();
    const ctx = new MigrationContext(adapter);
    await ctx.createTable("defaults", { force: true }, (t: any) => {
      t.text("multiline_default", { default: "--- []\n\n" });
    });
    try {
      class Default extends Base {
        static override tableName = "defaults";
      }
      Default.adapter = adapter;
      await Default.loadSchema();
      // Rails: assert("--- []\n\n" == record.multiline_default ||
      //               "--- []\\012\\012" == record.multiline_default)
      // Older PostgreSQL versions reflect the default with escaped newlines.
      const multiline = (new Default() as any).multiline_default;
      expect(["--- []\n\n", "--- []\\012\\012"]).toContain(multiline);
    } finally {
      await ctx.dropTable("defaults", { ifExists: true });
    }
  });
});

describe("DefaultNumbersTest", () => {
  let adapter: DatabaseAdapter;
  let DefaultNumber: typeof Base;

  beforeEach(async () => {
    adapter = createTestAdapter();
    const ctx = new MigrationContext(adapter);
    await ctx.createTable("default_numbers", { force: true }, (t: any) => {
      t.integer("positive_integer", { default: 7 });
      t.integer("negative_integer", { default: -5 });
      t.decimal("decimal_number", { default: "2.78", precision: 5, scale: 2 });
    });
    class DN extends Base {
      static override tableName = "default_numbers";
    }
    DN.adapter = adapter;
    await DN.loadSchema();
    DefaultNumber = DN;
  });

  afterEach(async () => {
    await new MigrationContext(adapter).dropTable("default_numbers", { ifExists: true });
  });

  it("default positive integer", () => {
    const record = new DefaultNumber();
    expect((record as any).positive_integer).toBe(7);
    expect(record.readAttributeBeforeTypeCast("positive_integer")).toBe("7");
  });

  it("default negative integer", () => {
    const record = new DefaultNumber();
    expect((record as any).negative_integer).toBe(-5);
    expect(record.readAttributeBeforeTypeCast("negative_integer")).toBe("-5");
  });

  it("default decimal number", () => {
    const record = new DefaultNumber();
    expect((record as any).decimal_number).toEqual(new BigDecimal("2.78"));
    expect(record.readAttributeBeforeTypeCast("decimal_number")).toBe("2.78");
  });
});

describe("DefaultStringsTest", () => {
  let adapter: DatabaseAdapter;
  let DefaultString: typeof Base;

  beforeEach(async () => {
    adapter = createTestAdapter();
    const ctx = new MigrationContext(adapter);
    await ctx.createTable("default_strings", { force: true }, (t: any) => {
      t.string("string_col", { default: "Smith" });
      t.string("string_col_with_quotes", { default: "O'Connor" });
    });
    class DS extends Base {
      static override tableName = "default_strings";
    }
    DS.adapter = adapter;
    await DS.loadSchema();
    DefaultString = DS;
  });

  afterEach(async () => {
    await new MigrationContext(adapter).dropTable("default_strings", { ifExists: true });
  });

  it("default strings", () => {
    expect((new DefaultString() as any).string_col).toBe("Smith");
  });

  it("default strings containing single quotes", () => {
    expect((new DefaultString() as any).string_col_with_quotes).toBe("O'Connor");
  });
});

// Rails gates the whole class to `current_adapter?(:SQLite3Adapter, :PostgreSQLAdapter)`.
// (`test_default_binary_string` is nested under a further `Mysql2Adapter` guard
// that can never be true inside the sqlite/pg gate, so it never runs — omitted.)
describe.skipIf(adapterType === "mysql")("DefaultBinaryTest", () => {
  let adapter: DatabaseAdapter;
  let DefaultBinary: typeof Base;

  beforeEach(async () => {
    adapter = createTestAdapter();
    const ctx = new MigrationContext(adapter);
    await ctx.createTable("default_binaries", { force: true }, (t: any) => {
      t.binary("varbinary_col", { null: false, limit: 64, default: "varbinary_default" });
      t.binary("varbinary_col_hex_looking", { null: false, limit: 64, default: "0xDEADBEEF" });
    });
    class DB extends Base {
      static override tableName = "default_binaries";
    }
    DB.adapter = adapter;
    await DB.loadSchema();
    DefaultBinary = DB;
  });

  afterEach(async () => {
    await new MigrationContext(adapter).dropTable("default_binaries", { ifExists: true });
  });

  // Rails asserts string equality; a binary column deserializes to bytes in
  // trails (BinaryType → Uint8Array), so decode the faithful analog of Ruby's
  // binary string before comparing.
  it("default varbinary string", () => {
    expect(decodeBinaryDefault((new DefaultBinary() as any).varbinary_col)).toBe(
      "varbinary_default",
    );
  });

  // Rails nests `test_default_binary_string` under a further
  // `current_adapter?(:Mysql2Adapter, :TrilogyAdapter) && !mariadb?` guard
  // *inside* the sqlite/pg gate — a combination that can never hold — and
  // `binary_col` is declared in no schema, so the test is dead on every adapter.
  // Ported verbatim under the same MySQL guard for name parity; it never runs.
  it.skipIf(adapterType !== "mysql")("default binary string", () => {
    // Rails: assert_equal "binary_default", DefaultBinary.new.binary_col
    expect(decodeBinaryDefault((new DefaultBinary() as any).binary_col)).toBe("binary_default");
  });

  it("default varbinary string that looks like hex", () => {
    expect(decodeBinaryDefault((new DefaultBinary() as any).varbinary_col_hex_looking)).toBe(
      "0xDEADBEEF",
    );
  });
});

describeIfSupports("text_column_with_default", "DefaultTextTest", () => {
  let adapter: DatabaseAdapter;
  let DefaultText: typeof Base;

  beforeEach(async () => {
    adapter = createTestAdapter();
    const ctx = new MigrationContext(adapter);
    await ctx.createTable("default_texts", { force: true }, (t: any) => {
      t.text("text_col", { default: "Smith" });
      t.text("text_col_with_quotes", { default: "O'Connor" });
    });
    class DT extends Base {
      static override tableName = "default_texts";
    }
    DT.adapter = adapter;
    await DT.loadSchema();
    DefaultText = DT;
  });

  afterEach(async () => {
    await new MigrationContext(adapter).dropTable("default_texts", { ifExists: true });
  });

  it("default texts", () => {
    expect((new DefaultText() as any).text_col).toBe("Smith");
  });

  it("default texts containing single quotes", () => {
    expect((new DefaultText() as any).text_col_with_quotes).toBe("O'Connor");
  });
});

// Mirrors `PostgresqlDefaultExpressionTest` (defaults_test.rb), gated to the
// PostgreSQLAdapter. The `defaults` table comes from postgresql_specific_schema.rb
// — built here with the migration DSL (expression defaults round-trip through the
// catalog and reflect via column.defaultFunction) and dumped via dump_table_schema.
describeIfPg("PostgresqlDefaultExpressionTest", () => {
  let adapter: DatabaseAdapter;
  let ctx: MigrationContext;

  beforeEach(async () => {
    adapter = createTestAdapter();
    ctx = new MigrationContext(adapter);
    await ctx.createTable("defaults", { force: true }, (t: any) => {
      t.integer("random_number", { default: () => "random() * 100" });
      t.string("ruby_on_rails", { default: () => "concat('Ruby ', 'on ', 'Rails')" });
      t.date("modified_date", { default: () => "CURRENT_DATE" });
      t.date("modified_date_function", { default: () => "now()" });
      t.date("fixed_date", { default: "2004-01-01" });
      t.datetime("modified_time", { default: () => "CURRENT_TIMESTAMP" });
      t.datetime("modified_time_without_precision", {
        precision: null,
        default: () => "CURRENT_TIMESTAMP",
      });
      t.datetime("modified_time_with_precision_0", {
        precision: 0,
        default: () => "CURRENT_TIMESTAMP",
      });
      t.datetime("modified_time_function", { default: () => "now()" });
      t.datetime("fixed_time", { default: "2004-01-01 00:00:00.000000-00" });
      t.column("char1", "char(1)", { default: "Y" });
      t.string("char2", { limit: 50, default: "a varchar field" });
      t.text("char3", { default: "a text field" });
    });
  });

  afterEach(async () => {
    await ctx.dropTable("defaults", { ifExists: true });
  });

  it("schema dump includes default expression", async () => {
    const output = await SchemaDumper.dumpTableSchema(
      adapter as unknown as SchemaSource,
      "defaults",
    );
    expect(output).toMatch(/t\.date\("modified_date", \{ default: \(\) => "CURRENT_DATE" \}\)/);
    expect(output).toMatch(
      /t\.datetime\("modified_time", \{ default: \(\) => "CURRENT_TIMESTAMP" \}\)/,
    );
    expect(output).toMatch(
      /t\.datetime\("modified_time_without_precision", \{ precision: null, default: \(\) => "CURRENT_TIMESTAMP" \}\)/,
    );
    expect(output).toMatch(
      /t\.datetime\("modified_time_with_precision_0", \{ precision: 0, default: \(\) => "CURRENT_TIMESTAMP" \}\)/,
    );
    expect(output).toMatch(/t\.date\("modified_date_function", \{ default: \(\) => "now\(\)" \}\)/);
    expect(output).toMatch(
      /t\.datetime\("modified_time_function", \{ default: \(\) => "now\(\)" \}\)/,
    );
  });
});

// Mirrors `MysqlDefaultExpressionTest` (defaults_test.rb), gated to the
// Mysql2Adapter. The three tables come from mysql2_specific_schema.rb — built
// here with the migration DSL (the expression defaults round-trip through
// quoteDefaultExpression) and dumped via SchemaDumpingHelper#dump_table_schema.
describeIfMysql("MysqlDefaultExpressionTest", () => {
  let adapter: DatabaseAdapter;
  let ctx: MigrationContext;

  beforeEach(async () => {
    adapter = createTestAdapter();
    ctx = new MigrationContext(adapter);
    await ctx.createTable("datetime_defaults", { force: true }, (t: any) => {
      t.datetime("modified_datetime", { precision: null, default: () => "CURRENT_TIMESTAMP" });
      t.datetime("precise_datetime", { default: () => "CURRENT_TIMESTAMP(6)" });
      t.datetime("updated_datetime", {
        default: () => "CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)",
      });
    });
    await ctx.createTable("timestamp_defaults", { force: true }, (t: any) => {
      t.timestamp("nullable_timestamp");
      t.timestamp("modified_timestamp", { precision: null, default: () => "CURRENT_TIMESTAMP" });
      t.timestamp("precise_timestamp", { precision: 6, default: () => "CURRENT_TIMESTAMP(6)" });
      t.timestamp("updated_timestamp", {
        precision: 6,
        default: () => "CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)",
      });
    });
    await ctx.createTable("defaults", { force: true }, (t: any) => {
      t.date("fixed_date", { default: "2004-01-01" });
      t.datetime("fixed_time", { default: "2004-01-01 00:00:00" });
      t.column("char1", "char(1)", { default: "Y" });
      t.string("char2", { limit: 50, default: "a varchar field" });
      if (supportsDefaultExpression) {
        t.binary("uuid", { limit: 36, default: () => "(uuid())" });
        t.string("char2_concatenated", { default: () => "(concat(`char2`, '-'))" });
      }
    });
  });

  afterEach(async () => {
    await ctx.dropTable("defaults", "timestamp_defaults", "datetime_defaults", { ifExists: true });
  });

  // The `uuid()`/`concat()` function defaults reflect on both MySQL 8 (via the
  // DEFAULT_GENERATED extra) and MariaDB (via bare-expression detection in
  // columns(); see mysql/schema-statements.ts), so the dumper emits
  // `default: () => "..."` on both lanes.
  itIfSupports("default_expression", "schema dump includes default expression", async () => {
    const output = await SchemaDumper.dumpTableSchema(
      adapter as unknown as SchemaSource,
      "defaults",
    );
    expect(output).toMatch(
      /t\.binary\("uuid", \{ limit: 36, default: \(\) => "\(?uuid\(\)\)?" \}\)/i,
    );
  });

  itIfSupports(
    "default_expression",
    "schema dump includes default expression with single quotes reflected correctly",
    async () => {
      const output = await SchemaDumper.dumpTableSchema(
        adapter as unknown as SchemaSource,
        "defaults",
      );
      expect(output).toMatch(
        /t\.string\("char2_concatenated", \{ default: \(\) => "\(?concat\(`char2`,\s*(_utf8mb4)?'-'\)\)?" \}\)/i,
      );
    },
  );

  it("schema dump datetime includes default expression", async () => {
    const output = await SchemaDumper.dumpTableSchema(
      adapter as unknown as SchemaSource,
      "datetime_defaults",
    );
    expect(output).toMatch(
      /t\.datetime\("modified_datetime", \{ precision: null, default: \(\) => "CURRENT_TIMESTAMP(\(\))?" \}\)/i,
    );
  });

  it("schema dump datetime includes precise default expression", async () => {
    const output = await SchemaDumper.dumpTableSchema(
      adapter as unknown as SchemaSource,
      "datetime_defaults",
    );
    expect(output).toMatch(
      /t\.datetime\("precise_datetime",.*default: \(\) => "CURRENT_TIMESTAMP\(6\)" \}\)/i,
    );
  });

  it("schema dump datetime includes precise default expression with on update", async () => {
    const output = await SchemaDumper.dumpTableSchema(
      adapter as unknown as SchemaSource,
      "datetime_defaults",
    );
    expect(output).toMatch(
      /t\.datetime\("updated_datetime",.*default: \(\) => "CURRENT_TIMESTAMP\(6\) ON UPDATE CURRENT_TIMESTAMP\(6\)" \}\)/i,
    );
  });

  it("schema dump timestamp includes default expression", async () => {
    const output = await SchemaDumper.dumpTableSchema(
      adapter as unknown as SchemaSource,
      "timestamp_defaults",
    );
    expect(output).toMatch(
      /t\.timestamp\("modified_timestamp",.*default: \(\) => "CURRENT_TIMESTAMP(\(\))?" \}\)/i,
    );
  });

  it("schema dump timestamp includes precise default expression", async () => {
    const output = await SchemaDumper.dumpTableSchema(
      adapter as unknown as SchemaSource,
      "timestamp_defaults",
    );
    expect(output).toMatch(
      /t\.timestamp\("precise_timestamp",.*default: \(\) => "CURRENT_TIMESTAMP\(6\)" \}\)/i,
    );
  });

  it("schema dump timestamp includes precise default expression with on update", async () => {
    const output = await SchemaDumper.dumpTableSchema(
      adapter as unknown as SchemaSource,
      "timestamp_defaults",
    );
    expect(output).toMatch(
      /t\.timestamp\("updated_timestamp",.*default: \(\) => "CURRENT_TIMESTAMP\(6\) ON UPDATE CURRENT_TIMESTAMP\(6\)" \}\)/i,
    );
  });

  it("schema dump timestamp without default expression", async () => {
    const output = await SchemaDumper.dumpTableSchema(
      adapter as unknown as SchemaSource,
      "timestamp_defaults",
    );
    expect(output).toMatch(/t\.timestamp\("nullable_timestamp"\);/);
  });
});

// Mirrors `DefaultsTestWithoutTransactionalFixtures` (defaults_test.rb), gated
// to the Mysql2Adapter. Rails toggles strict mode via
// `establish_connection(..., strict:)`; our Mysql2Adapter accepts the same
// `strict` config key, so `using_strict` becomes a fresh adapter per block.
describeIfMysql("DefaultsTestWithoutTransactionalFixtures", () => {
  // Mirrors `with_mysql_not_null_table`: build the NOT NULL table on a
  // strict/non-strict connection, yield the model, then drop it.
  async function withMysqlNotNullTable(
    strict: boolean,
    fn: (klass: typeof Base) => Promise<void>,
  ): Promise<void> {
    const adapter = new Mysql2Adapter({ uri: MYSQL_TEST_URL, strict });
    try {
      await adapter.createTable("test_mysql_not_null_defaults", { force: true }, (t: any) => {
        t.integer("non_null_integer", { null: false });
        t.string("non_null_string", { null: false });
        t.text("non_null_text", { null: false });
        t.blob("non_null_blob", { null: false });
      });
      class TestMysqlNotNullDefault extends Base {
        static override tableName = "test_mysql_not_null_defaults";
        // Rails' AR test suite runs with the framework default
        // `partial_inserts = true` (dirty.rb:50), which the trails harness flips
        // to false via `load_defaults 7.0` (test-setup-ar.ts). Restore the Rails
        // test-env value here so `new` (no attrs) omits the NOT NULL columns from
        // the INSERT — letting the DB apply implicit 0/"" defaults in non-strict
        // mode — exactly as Rails exercises this test.
        static override partialInserts = true;
      }
      TestMysqlNotNullDefault.adapter = adapter;
      await TestMysqlNotNullDefault.loadSchema();
      await fn(TestMysqlNotNullDefault);
    } finally {
      await adapter.dropTable("test_mysql_not_null_defaults", { ifExists: true });
      await adapter.close();
    }
  }

  it("mysql not null defaults non strict", async () => {
    await withMysqlNotNullTable(false, async (klass) => {
      const record = new klass({});
      expect((record as any).non_null_integer).toBeNull();
      expect((record as any).non_null_string).toBeNull();
      expect((record as any).non_null_text).toBeNull();
      expect((record as any).non_null_blob).toBeNull();

      await (record as any).saveBang();
      await (record as any).reload();

      expect((record as any).non_null_integer).toBe(0);
      expect((record as any).non_null_string).toBe("");
      expect((record as any).non_null_text).toBe("");
      // Rails: `assert_equal "", record.non_null_blob`. A binary column
      // deserializes to bytes in trails (BinaryType → Uint8Array), so the
      // faithful analog of Ruby's empty binary string is the exact empty byte
      // array — and its decoded text is `""`.
      expect(new Uint8Array((record as any).non_null_blob)).toEqual(new Uint8Array(0));
      expect(decodeBinaryDefault((record as any).non_null_blob)).toBe("");
    });
  });

  it("mysql not null defaults strict", async () => {
    await withMysqlNotNullTable(true, async (klass) => {
      const record = new klass({});
      expect((record as any).non_null_integer).toBeNull();
      expect((record as any).non_null_string).toBeNull();
      expect((record as any).non_null_text).toBeNull();
      expect((record as any).non_null_blob).toBeNull();

      await expect((klass as any).create()).rejects.toThrow(NotNullViolation);
    });
  });
});

// Mirrors `Sqlite3DefaultExpressionTest` (defaults_test.rb), gated to the
// SQLite3Adapter. The `defaults` table comes from sqlite_specific_schema.rb —
// built here with the migration DSL; expression defaults reflect via
// column.defaultFunction (newColumnFromField/_extractDefaultFunction).
describeIfSqlite("Sqlite3DefaultExpressionTest", () => {
  let adapter: DatabaseAdapter;
  let ctx: MigrationContext;

  beforeEach(async () => {
    adapter = createTestAdapter();
    ctx = new MigrationContext(adapter);
    await ctx.createTable("defaults", { force: true }, (t: any) => {
      t.integer("random_number", { default: () => "ABS(RANDOM())" });
      t.string("ruby_on_rails", { default: () => "('Ruby ' || 'on ' || 'Rails')" });
      t.date("modified_date", { default: () => "CURRENT_DATE" });
      t.date("modified_date_function", { default: () => "DATE('now')" });
      t.date("fixed_date", { default: "2004-01-01" });
      t.datetime("modified_time", { default: () => "CURRENT_TIMESTAMP" });
      t.datetime("modified_time_without_precision", {
        precision: null,
        default: () => "CURRENT_TIMESTAMP",
      });
      t.datetime("modified_time_with_precision_0", {
        precision: 0,
        default: () => "CURRENT_TIMESTAMP",
      });
      t.datetime("modified_time_function", { default: () => "DATETIME('now')" });
      t.datetime("fixed_time", { default: "2004-01-01 00:00:00.000000-00" });
      t.column("char1", "char(1)", { default: "Y" });
      t.string("char2", { limit: 50, default: "a varchar field" });
      t.text("char3", { default: "a text field" });
    });
  });

  afterEach(async () => {
    await ctx.dropTable("defaults", { ifExists: true });
  });

  it("schema dump includes default expression", async () => {
    const output = await SchemaDumper.dumpTableSchema(
      adapter as unknown as SchemaSource,
      "defaults",
    );
    expect(output).toMatch(/t\.date\("modified_date", \{ default: \(\) => "CURRENT_DATE" \}\)/);
    expect(output).toMatch(
      /t\.datetime\("modified_time", \{ default: \(\) => "CURRENT_TIMESTAMP" \}\)/,
    );
    expect(output).toMatch(
      /t\.datetime\("modified_time_without_precision", \{ precision: null, default: \(\) => "CURRENT_TIMESTAMP" \}\)/,
    );
    expect(output).toMatch(
      /t\.datetime\("modified_time_with_precision_0", \{ precision: 0, default: \(\) => "CURRENT_TIMESTAMP" \}\)/,
    );
    expect(output).toMatch(
      /t\.integer\("random_number", \{ default: \(\) => "ABS\(RANDOM\(\)\)" \}\)/,
    );
  });
});
