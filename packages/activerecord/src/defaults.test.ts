import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
import type { SchemaSource } from "./schema-dumper.js";
import { NotNullViolation } from "./errors.js";
import { adapterType } from "./test-adapter.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Mysql2Adapter } from "./connection-adapters/mysql2-adapter.js";
import { describeIfMysqlAdapter } from "./support/describe-if-mysql-adapter.js";
import { isMariaDb, MYSQL_TEST_URL } from "./support/mysql-server-version.js";
import { describeIfPostgresqlAdapter } from "./support/describe-if-postgresql-adapter.js";
import { describeIfSqlite } from "./support/describe-if-sqlite.js";
import { describeIfSupports, itIfSupports } from "./support/supports.js";
import { fixtures } from "./test-fixtures.js";
import { Entrant } from "./test-helpers/models/entrant.js";

fixtures({}, { useTransactionalTests: false });

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

function decodeBinaryDefault(value: unknown): string {
  if (typeof value === "string") return value;
  return new TextDecoder().decode(value as Uint8Array);
}

describe("DefaultTest", () => {
  fixtures(["entrants"]);

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

describe.skipIf(adapterType === "mysql")("DefaultTest", () => {
  it("multiline default text", async () => {
    const adapter = Base.connection;
    class Default extends Base {
      static override tableName = "defaults";
    }
    Default.adapter = adapter;
    await Default.loadSchema();
    const multiline = (new Default() as any).multiline_default;
    expect(["--- []\n\n", "--- []\\012\\012"]).toContain(multiline);
  });
});

describe("DefaultNumbersTest", () => {
  let adapter: DatabaseAdapter;
  let DefaultNumber: typeof Base;

  beforeEach(async () => {
    adapter = Base.connection;
    await adapter.createTable("default_numbers", { force: true }, (t: any) => {
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
    await adapter.dropTable("default_numbers", { ifExists: true });
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
    adapter = Base.connection;
    await adapter.createTable("default_strings", { force: true }, (t: any) => {
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
    await adapter.dropTable("default_strings", { ifExists: true });
  });

  it("default strings", () => {
    expect((new DefaultString() as any).string_col).toBe("Smith");
  });

  it("default strings containing single quotes", () => {
    expect((new DefaultString() as any).string_col_with_quotes).toBe("O'Connor");
  });
});

describe.skipIf(adapterType === "mysql")("DefaultBinaryTest", () => {
  let adapter: DatabaseAdapter;
  let DefaultBinary: typeof Base;

  beforeEach(async () => {
    adapter = Base.connection;
    await adapter.createTable("default_binaries", { force: true }, (t: any) => {
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
    await adapter.dropTable("default_binaries", { ifExists: true });
  });

  it("default varbinary string", () => {
    expect(decodeBinaryDefault((new DefaultBinary() as any).varbinary_col)).toBe(
      "varbinary_default",
    );
  });

  it.skipIf(adapterType !== "mysql" || isMariaDb)("default binary string", () => {
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
    adapter = Base.connection;
    await adapter.createTable("default_texts", { force: true }, (t: any) => {
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
    await adapter.dropTable("default_texts", { ifExists: true });
  });

  it("default texts", () => {
    expect((new DefaultText() as any).text_col).toBe("Smith");
  });

  it("default texts containing single quotes", () => {
    expect((new DefaultText() as any).text_col_with_quotes).toBe("O'Connor");
  });
});

describeIfPostgresqlAdapter("PostgresqlDefaultExpressionTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = Base.connection;
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

describeIfMysqlAdapter("MysqlDefaultExpressionTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = Base.connection;
  });

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

describeIfMysqlAdapter("DefaultsTestWithoutTransactionalFixtures", () => {
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

describeIfSqlite("Sqlite3DefaultExpressionTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = Base.connection;
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
