import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { Base } from "./base.js";
import { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
import type { SchemaSource } from "./schema-dumper.js";
import { adapterType } from "./test-adapter.js";
import type { TestDatabaseAdapter } from "./test-adapter.js";
import { itIfSupports, adapterSupports } from "./support/supports.js";
import { fixtures } from "./test-fixtures.js";
import {
  dumpAllTableSchema,
  dumpTableSchema,
  FULL_DUMP_TIMEOUT_MS,
} from "./support/schema-dumping-helper.js";
import { withPostgresqlDatetimeType } from "./support/with-postgresql-datetime-type.js";
import { Column } from "./connection-adapters/column.js";
import { SqlTypeMetadata } from "./connection-adapters/sql-type-metadata.js";
import { ValueType } from "@blazetrails/activemodel";

function schemaColumn(name: string, type: string): Column {
  return new Column(name, null, new SqlTypeMetadata({ sqlType: type, type }));
}

const PRIMARY_KEY_ADAPTER = {
  primaryKey: async () => "id",
  lookupCastTypeFromColumn: () => new ValueType(),
};

describe("SchemaDumperTest", () => {
  fixtures({}, { useTransactionalTests: false });

  function canonicalSource(): SchemaSource {
    return Base.adapter as unknown as SchemaSource;
  }
  function standardDump(ignoreTables: (string | RegExp)[] = []): Promise<string> {
    return dumpAllTableSchema(ignoreTables, canonicalSource());
  }
  function dumpCanonicalTable(...tables: string[]): Promise<string> {
    return dumpTableSchema(canonicalSource(), ...tables);
  }
  async function dumpsIndexSortOrder(): Promise<boolean> {
    return (
      Base.adapter as unknown as { supportsIndexSortOrder(): Promise<boolean> }
    ).supportsIndexSortOrder();
  }

  it("schema dump", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
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

  it("schema dump excludes sqlite sequence", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump();
    expect(output).not.toMatch(/createTable\("sqlite_sequence"/);
  });

  it("schema dump includes camelcase table name", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump();
    expect(output).toMatch(/createTable\("CamelCase"/);
  });

  it("types no line up", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump();
    const columnLines = output.split("\n").filter((l) => /\bt\.\w+\(/.test(l));
    for (const line of columnLines) {
      expect(line).not.toMatch(/\bt\.\w+\s{2,}/);
    }
  });
  it("arguments no line up", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump();
    const columnLines = output.split("\n").filter((l) => /\bt\.\w+\(/.test(l));
    for (const pattern of [/default: /, /limit: /, /null: /]) {
      for (const line of columnLines.filter((l) => pattern.test(l))) {
        const m = line.match(pattern)!;
        const before = line.slice(m.index! - 2, m.index);
        expect(before === "{ " || before === ", ").toBe(true);
      }
    }
  });

  it("no dump errors", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump();
    expect(output).not.toContain("# Could not dump table");
  });

  it("schema dump includes not null columns", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump([/^[^r]/]);
    expect(output).toContain("null: false");
  });

  it("schema dump with string ignored table", async () => {
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

  it(
    "schema dump should honor nonstandard primary keys",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await standardDump();
      const match = output.match(/createTable\("movies"(.*)/);
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(/primaryKey: "movieid"/);
    },
  );

  it("schema dump should use false as default", async () => {
    const output = await dumpCanonicalTable("booleans");
    expect(output).toMatch(/t\.boolean\("has_fun",.*default: false/);
  });

  it("schema dump does not include limit for text field", async () => {
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

  it("schema dump aliased types", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump();
    expect(output).toMatch(/t\.binary\("blob_data"\)/);
    const decimalTail = adapterType === "mysql" ? ", { precision: 10 })" : ")";
    expect(output).toContain(`t.decimal("numeric_number"${decimalTail}`);
    expect(output).toContain(`t.decimal("decimal_number"${decimalTail}`);
  });

  it(
    "schema dump keeps id column when id is false and id column added",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await standardDump();
      const match = output.match(/createTable\("goofy_string_id"(.*)\n(.*)\n/);
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(/id: false/);
      expect(match![2]).toMatch(/t\.string\("id",.*null: false/);
    },
  );

  function companyIndexLine(output: string, re: RegExp): string {
    return (output.split(/\n/).find((l) => /t\.index\(/.test(l) && re.test(l)) ?? "").trim();
  }

  it("schema dumps index columns in right order", async () => {
    const output = await dumpCanonicalTable("companies");
    const line = companyIndexLine(output, /company_index/);
    const base = 't.index(["firm_id", "type", "rating"], { name: "company_index"';
    const lengthPart = adapterType === "mysql" ? ", length: { type: 10 }" : "";
    const orderPart = (await dumpsIndexSortOrder()) ? ', order: { rating: "desc" }' : "";
    expect(line).toBe(`${base}${lengthPart}${orderPart} });`);
  });

  it("schema dumps partial indices", async () => {
    const output = await dumpCanonicalTable("companies");
    const line = companyIndexLine(output, /company_partial_index/);
    const expected = adapterSupports("partial_index")
      ? 't.index(["firm_id", "type"], { name: "company_partial_index", where: "(rating > 10)" });'
      : 't.index(["firm_id", "type"], { name: "company_partial_index" });';
    expect(line).toBe(expected);
  });

  it("schema dumps nulls not distinct", async () => {
    const output = await dumpCanonicalTable("companies");
    const line = companyIndexLine(output, /company_nulls_not_distinct/);
    const expected = adapterSupports("nulls_not_distinct")
      ? 't.index(["firm_id"], { name: "company_nulls_not_distinct", nullsNotDistinct: true });'
      : 't.index(["firm_id"], { name: "company_nulls_not_distinct" });';
    expect(line).toBe(expected);
  });

  it("schema dumps index sort order", async () => {
    const output = await dumpCanonicalTable("companies");
    const line = companyIndexLine(output, /_name_and_rating/);
    const expected = (await dumpsIndexSortOrder())
      ? 't.index(["name", "rating"], { name: "index_companies_on_name_and_rating", order: "desc" });'
      : 't.index(["name", "rating"], { name: "index_companies_on_name_and_rating" });';
    expect(line).toBe(expected);
  });

  it("schema dumps index length", async () => {
    const output = await dumpCanonicalTable("companies");
    const line = companyIndexLine(output, /_name_and_description/);
    const expected =
      adapterType === "mysql"
        ? 't.index(["name", "description"], { name: "index_companies_on_name_and_description", length: 10 });'
        : 't.index(["name", "description"], { name: "index_companies_on_name_and_description" });';
    expect(line).toBe(expected);
  });

  itIfSupports("expression_index", "schema dump expression indices", async () => {
    const output = await dumpCanonicalTable("companies");
    let line = companyIndexLine(output, /company_expression_index/);
    line = line.replace(/, \{ name: "company_expression_index" \}\);$/, "");
    if (adapterType === "postgres") {
      expect(line).toMatch(/CASE.+lower\(\(name\)::text\).+END\) DESC"/i);
    } else if (adapterType === "mysql") {
      expect(line).toMatch(/CASE.+lower\(`name`\).+END\) DESC"/i);
    } else {
      expect(line).toMatch(/CASE.+lower\(name\).+END\) DESC"/i);
    }
  });

  itIfSupports.skipIf(adapterType !== "mysql")(
    "expression_index",
    "schema dump expression indices escaping",
    async () => {
      const output = await dumpCanonicalTable("companies");
      let line = companyIndexLine(output, /full_name_index/);
      line = line.replace(/, \{ name: "full_name_index" \}\);$/, "");
      expect(line).toMatch(/concat_ws\(`firm_name`,`name`,_utf8mb4' '\)\)"$/i);
    },
  );

  it("schema dump includes decimal options", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump([/^[^n]/]);
    expect(output).toMatch(/precision: 3,\s+scale: 2,\s+default: "2\.78"/);
  });

  it(
    "schema dump keeps large precision integer columns as decimal",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await standardDump();
      expect(output).toMatch(/t\.decimal\("atoms_in_universe",\s*\{[^}]*precision:\s*55/);
    },
  );

  it(
    "schema dump includes limit constraint for integer columns",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await standardDump([/^(?!integer_limits)/]);
      expect(output).toMatch(/"c_int_without_limit"(?!.*limit)/);

      const lowExpectations: RegExp[] =
        adapterType === "postgres"
          ? [
              /c_int_1.*limit: 2/,
              /c_int_2.*limit: 2/,
              /"c_int_3"(?!.*limit)/,
              /"c_int_4"(?!.*limit)/,
            ]
          : adapterType === "mysql"
            ? [
                /c_int_1.*limit: 1/,
                /c_int_2.*limit: 2/,
                /c_int_3.*limit: 3/,
                /"c_int_4"(?!.*limit)/,
              ]
            : [/c_int_1.*limit: 1/, /c_int_2.*limit: 2/, /c_int_3.*limit: 3/, /c_int_4.*limit: 4/];
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
    },
  );

  itIfSupports("check_constraints", "schema dumps check constraints", async () => {
    const constraintDefinition = (await dumpCanonicalTable("products"))
      .split(/\n/)
      .filter((line) => /t\.checkConstraint.*products_price_check/.test(line))[0]
      .trim();

    if (adapterType === "mysql") {
      expect(constraintDefinition).toMatch(
        /^t\.checkConstraint\("`price` > `discounted_price`", \{ name: "products_price_check" \}\);$/,
      );
    } else {
      expect(constraintDefinition).toMatch(
        /^t\.checkConstraint\("price > discounted_price", \{ name: "products_price_check" \}\);$/,
      );
    }
  });
});

describe("SchemaDumperTest", () => {
  afterEach(() => {
    SchemaDumper.ignoreTables = [];
    SchemaDumper.fkIgnorePattern = /^fk_rails_[0-9a-f]{10}$/;
  });

  it("dump schema information with empty versions", async () => {
    const schemaMigration = Base.connectionPool().schemaMigration;
    await schemaMigration.createTable();
    await schemaMigration.deleteAllVersions();
    const schemaInfo = (await Base.connection.dumpSchemaInformation!()) ?? "";
    expect(schemaInfo).not.toMatch(/INSERT INTO/);
  });

  it("dump schema information outputs lexically reverse ordered versions regardless of database order", async () => {
    const schemaMigration = Base.connectionPool().schemaMigration;
    await schemaMigration.createTable();
    await schemaMigration.deleteAllVersions();
    const versions = ["20100101010101", "20100201010101", "20100301010101"];
    for (const v of [...versions].sort(() => Math.random() - 0.5)) {
      await schemaMigration.createVersion(v);
    }

    try {
      const schemaInfo = await Base.connection.dumpSchemaInformation!();
      const expected = [
        `INSERT INTO ${Base.connection.quoteTableName("schema_migrations")} (version) VALUES`,
        "('20100301010101'),",
        "('20100201010101'),",
        "('20100101010101');",
      ].join("\n");
      expect(schemaInfo).toEqual(expected);
    } finally {
      await schemaMigration.deleteAllVersions();
    }
  });

  it("schema dump include migration version", async () => {
    const { SchemaDumper: TopLevelDumper } = await import("./schema-dumper.js");
    const { SchemaMigration } = await import("./schema-migration.js");
    const adapter = Base.connection;
    const sm = new SchemaMigration(adapter.pool);
    await sm.createTable();
    await sm.createVersion("20240601120000");
    const output = (await TopLevelDumper.dump(adapter)).join("\n");
    expect(output).toMatch(/export const defineParams = \{ version: 2024_06_01_120000 \};/);
    expect(output).toContain("defineSchema");
  }, 60000);

  it("schema dump with regexp ignored table", async () => {
    const source = {
      tables: async () => ["users", "temp_cache"],
      columns: async () => [schemaColumn("name", "string")],
      indexes: async () => [],
    };
    SchemaDumper.ignoreTables = [/^temp_/];
    const output = (await SchemaDumper.dump(source as any)).join("\n");
    expect(output).toContain("users");
    expect(output).not.toContain("temp_cache");
  });

  it("schema dump keeps id false when id is false and unique not null column added", async () => {
    await Base.connection.createTable(
      "dump_string_key_objects",
      { id: false, force: true },
      (t) => {
        t.string("key", { null: false });
      },
    );
    await Base.connection.addIndex("dump_string_key_objects", "key", { unique: true });
    const output = await SchemaDumper.dumpTableSchema(Base.connection, "dump_string_key_objects");
    expect(output).toMatch(/createTable\("dump_string_key_objects",\s*\{[^}]*id:\s*false/);
  });

  itIfSupports("exclusion_constraints", "schema dumps exclusion constraints", async () => {
    const testAdapter = Base.connection;
    await testAdapter.createTable("test_schema_exclusion", { id: false }, (t) => {
      t.date("start_date");
      t.date("end_date");
    });
    await (testAdapter as any).addExclusionConstraint(
      "test_schema_exclusion",
      "daterange(start_date, end_date) WITH &&",
      { using: "gist", name: "test_schema_exclusion_date_overlap" },
    );
    const output = await SchemaDumper.dumpTableSchema(testAdapter, "test_schema_exclusion");
    expect(output).toContain(
      't.exclusionConstraint("daterange(start_date, end_date) WITH &&", { using: "gist", name: "test_schema_exclusion_date_overlap" });',
    );
  });
  itIfSupports("unique_constraints", "schema dumps unique constraints", async () => {
    const testAdapter = Base.connection;
    await testAdapter.createTable("test_schema_unique", {}, (t) => {
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
    const output = await SchemaDumper.dumpTableSchema(testAdapter, "test_schema_unique");
    expect(output).toContain(
      't.uniqueConstraint(["position_1"], { name: "test_schema_unique_position_1" });',
    );
    expect(output).toContain(
      't.uniqueConstraint(["position_2"], { nullsNotDistinct: true, name: "test_schema_unique_position_2_nnd" });',
    );
  });
  itIfSupports(
    "unique_constraints",
    "schema does not dump unique constraints as indexes",
    async () => {
      const testAdapter = Base.connection;
      await testAdapter.createTable("test_uc_no_idx", {}, (t) => {
        t.integer("position");
      });
      await (testAdapter as any).addUniqueConstraint("test_uc_no_idx", ["position"], {
        name: "test_uc_no_idx_position",
      });
      const output = await SchemaDumper.dumpTableSchema(testAdapter, "test_uc_no_idx");
      expect(output).toContain("t.uniqueConstraint");
      expect(output).not.toMatch(/t\.index\(.*test_uc_no_idx_position/);
    },
  );
  it.skipIf(adapterType !== "mysql")(
    "schema dump includes length for mysql binary fields",
    async () => {
      const output = await SchemaDumper.dumpTableSchema(Base.connection, "binary_fields");
      expect(output).toMatch(/t\.binary\("var_binary", \{ limit: 255 \}\)/);
      expect(output).toMatch(/t\.binary\("var_binary_large", \{ limit: 4095 \}\)/);
    },
  );
  it.skipIf(adapterType !== "mysql")(
    "schema dump includes length for mysql blob and text fields",
    async () => {
      const output = await SchemaDumper.dumpTableSchema(Base.connection, "binary_fields");
      expect(output).toMatch(/t\.binary\("tiny_blob", \{ size: "tiny" \}\)/);
      expect(output).toMatch(/t\.binary\("normal_blob"\)/);
      expect(output).toMatch(/t\.binary\("medium_blob", \{ size: "medium" \}\)/);
      expect(output).toMatch(/t\.binary\("long_blob", \{ size: "long" \}\)/);
      expect(output).toMatch(/t\.text\("tiny_text", \{ size: "tiny" \}\)/);
      expect(output).toMatch(/t\.text\("normal_text"\)/);
      expect(output).toMatch(/t\.text\("medium_text", \{ size: "medium" \}\)/);
      expect(output).toMatch(/t\.text\("long_text", \{ size: "long" \}\)/);
      expect(output).toMatch(/t\.binary\("tiny_blob_2", \{ size: "tiny" \}\)/);
      expect(output).toMatch(/t\.binary\("medium_blob_2", \{ size: "medium" \}\)/);
      expect(output).toMatch(/t\.binary\("long_blob_2", \{ size: "long" \}\)/);
      expect(output).toMatch(/t\.text\("tiny_text_2", \{ size: "tiny" \}\)/);
      expect(output).toMatch(/t\.text\("medium_text_2", \{ size: "medium" \}\)/);
      expect(output).toMatch(/t\.text\("long_text_2", \{ size: "long" \}\)/);
    },
  );
  it.skipIf(adapterType !== "mysql")(
    "schema does not include limit for emulated mysql boolean fields",
    async () => {
      const output = await SchemaDumper.dumpTableSchema(Base.connection, "booleans");
      expect(output).not.toMatch(/t\.boolean\("has_fun",.+limit: 1/);
    },
  );
  it.skipIf(adapterType !== "mysql")("schema dumps index type", async () => {
    const output = await SchemaDumper.dumpTableSchema(Base.connection, "key_tests");
    expect(output).toContain(
      't.index(["awesome"], { name: "index_key_tests_on_awesome", type: "fulltext" })',
    );
    expect(output).toContain('t.index(["pizza"], { name: "index_key_tests_on_pizza" })');
  });

  it.skipIf(adapterType !== "postgres")("schema dump includes bigint default", async () => {
    const output = await SchemaDumper.dumpTableSchema(Base.connection, "defaults");
    expect(output).toMatch(/t\.bigint\("bigint_default",\s*\{[^}]*default:\s*0[^}]*\}/);
  });

  it.skipIf(adapterType !== "postgres")("schema dump includes limit on array type", async () => {
    const output = await SchemaDumper.dumpTableSchema(Base.connection, "bigint_array");
    expect(output).toMatch(/t\.bigint\("big_int_data_points", \{ array: true \}\)/);
  });
  it.skipIf(adapterType !== "postgres")(
    "schema dump allows array of decimal defaults",
    async () => {
      const output = await SchemaDumper.dumpTableSchema(Base.connection, "bigint_array");
      expect(output).toMatch(
        /t\.decimal\("decimal_array_default",\s*\{[^}]*default:\s*\["1\.23", "3\.45"\][^}]*array:\s*true/,
      );
    },
  );
  it.skipIf(adapterType !== "postgres")("schema dump interval type", async () => {
    const output = await SchemaDumper.dumpTableSchema(Base.connection, "postgresql_times");
    expect(output).toMatch(/t\.interval\("time_interval"\)/);
    expect(output).toMatch(/t\.interval\("scaled_time_interval", \{ precision: 6 \}\)/);
  });
  it.skipIf(adapterType !== "postgres")("schema dump oid type", async () => {
    const output = await SchemaDumper.dumpTableSchema(Base.connection, "postgresql_oids");
    expect(output).toMatch(/t\.oid\("obj_id"\)/);
  });
  it.skipIf(adapterType !== "postgres")("schema dump includes extensions", async () => {
    const adapter = Base.connection;
    const original = (adapter as any).extensions;
    await adapter.createTable("schema_dump_probe", { force: true }, (t) => {
      t.integer("x");
    });
    try {
      (adapter as any).extensions = async () => ["hstore"];
      let output = await SchemaDumper.dumpTableSchema(adapter, "schema_dump_probe");
      expect(output).toContain("These are extensions that must be enabled");
      expect(output).toMatch(/enableExtension\("hstore"\)/);

      (adapter as any).extensions = async () => [];
      output = await SchemaDumper.dumpTableSchema(adapter, "schema_dump_probe");
      expect(output).not.toContain("These are extensions that must be enabled");
      expect(output).not.toContain("enableExtension");
    } finally {
      (adapter as any).extensions = original;
    }
  });
  it.skipIf(adapterType !== "postgres")(
    "schema dump includes extensions in alphabetic order",
    async () => {
      const adapter = Base.connection;
      const original = (adapter as any).extensions;
      await adapter.createTable("schema_dump_probe", { force: true }, (t) => {
        t.integer("x");
      });
      try {
        (adapter as any).extensions = async () => ["uuid-ossp", "xml2", "hstore"];
        const output = await SchemaDumper.dumpTableSchema(adapter, "schema_dump_probe");
        const enabled = [...output.matchAll(/enableExtension\("(.+?)"\)/g)].map((m) => m[1]);
        expect(enabled).toEqual(["hstore", "uuid-ossp", "xml2"]);
      } finally {
        (adapter as any).extensions = original;
      }
    },
  );
  it.skipIf(adapterType !== "postgres")("schema dump include limit for float4 field", async () => {
    const output = await SchemaDumper.dumpTableSchema(Base.connection, "numeric_data");
    expect(output).toMatch(/t\.float\("temperature_with_limit", \{ limit: 24 \}\)/);
  });
  it.skipIf(adapterType !== "postgres")(
    "schema dump keeps enum intact if it contains comma",
    async () => {
      const adapter = Base.connection;
      await (adapter as any).createEnum("enum_with_comma", ["value1", "value,2", "value3"]);
      await adapter.createTable("schema_dump_probe", { force: true }, (t) => {
        t.integer("x");
      });
      try {
        const output = await SchemaDumper.dumpTableSchema(adapter, "schema_dump_probe");
        expect(output).toContain('createEnum("enum_with_comma", ["value1","value,2","value3"])');
      } finally {
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
            ? [schemaColumn("id", "integer")]
            : [schemaColumn("id", "integer"), schemaColumn("author_id", "integer")],
        indexes: async () => [],
        adapter: PRIMARY_KEY_ADAPTER,
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
      const output = (await SchemaDumper.dump(source as any)).join("\n");
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
      columns: async (_t: string) => [schemaColumn("id", "integer")],
      indexes: async () => [],
      adapter: PRIMARY_KEY_ADAPTER,
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
    const output = (await SchemaDumper.dump(source as any)).join("\n");
    expect(output).not.toContain("addForeignKey");
    expect(output).not.toContain('"books"');
  });
  itIfSupports("foreign_keys", "do not dump foreign keys when bypassed by config", async () => {
    const source = {
      tables: async () => ["authors", "books"],
      columns: async (_t: string) => [schemaColumn("id", "integer")],
      indexes: async () => [],
      adapter: PRIMARY_KEY_ADAPTER,
    };
    const output = (await SchemaDumper.dump(source as any)).join("\n");
    expect(output).not.toContain("addForeignKey");
  });

  it("schema dump with table name prefix and suffix", async () => {
    const source = {
      tables: async () => ["myapp_users_v1"],
      columns: async (_t: string) => [schemaColumn("id", "integer")],
      indexes: async () => [],
      adapter: PRIMARY_KEY_ADAPTER,
    };
    const output = (
      await SchemaDumper.dump(source as any, [], {
        tableNamePrefix: "myapp_",
        tableNameSuffix: "_v1",
      })
    ).join("\n");
    expect(output).toContain('"users"');
    expect(output).not.toContain("myapp_users_v1");
  });

  it("schema dump with table name prefix and suffix regexp escape", async () => {
    const source = {
      tables: async () => ["app.prefix_users"],
      columns: async (_t: string) => [schemaColumn("id", "integer")],
      indexes: async () => [],
      adapter: PRIMARY_KEY_ADAPTER,
    };
    const output = (
      await SchemaDumper.dump(source as any, [], { tableNamePrefix: "app.prefix_" })
    ).join("\n");
    expect(output).toContain('"users"');
    expect(output).not.toContain("app.prefix_users");
  });
  it("schema dump with table name prefix and ignoring tables", async () => {
    const source = {
      tables: async () => ["myapp_users", "myapp_posts"],
      columns: async (_t: string) => [schemaColumn("id", "integer")],
      indexes: async () => [],
      adapter: PRIMARY_KEY_ADAPTER,
    };
    SchemaDumper.ignoreTables = ["posts"];
    const output = (await SchemaDumper.dump(source as any, [], { tableNamePrefix: "myapp_" })).join(
      "\n",
    );
    expect(output).toContain('"users"');
    expect(output).not.toContain('"posts"');
    expect(output).not.toContain("myapp_");
  });

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via create table and t column",
    async () => {
      await Base.connection.createTable("timestamps", { force: true }, (t) => {
        t.string("title");
        t.timestamps();
      });
      const output = await SchemaDumper.dumpTableSchema(Base.connection, "timestamps");
      expect(output).toContain("datetime");
      expect(output).toContain("created_at");
      expect(output).toContain("updated_at");
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump with timestamptz datetime format",
    async () => {
      await withPostgresqlDatetimeType("timestamptz", async () => {
        await Base.connection.createTable("timestamps", { force: true }, (t) => {
          t.datetime("this_should_remain_datetime");
          (t as any).timestamptz("this_is_an_alias_of_datetime");
          t.column("without_time_zone", "timestamp");
          t.column("with_time_zone", "timestamptz");
        });
        const output = await SchemaDumper.dumpTableSchema(Base.connection, "timestamps");
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
  });
  it.skipIf(adapterType !== "postgres")(
    "timestamps schema dump before rails 7 with timestamptz setting",
    (ctx) => {
      ctx.skip();
      // BLOCKED: needs Migration version compatibility + datetime_type-aware dump.
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump when changing datetime type for an existing app",
    async () => {
      await Base.connection.createTable("timestamps", { force: true }, (t) => {
        t.datetime("default_format");
        t.column("without_time_zone", "timestamp");
        t.column("with_time_zone", "timestamptz");
      });

      let output = await SchemaDumper.dumpTableSchema(Base.connection, "timestamps");
      expect(output).toContain('t.datetime("default_format"');
      expect(output).toContain('t.datetime("without_time_zone"');
      expect(output).toContain('t.timestamptz("with_time_zone"');

      await withPostgresqlDatetimeType("timestamptz", async () => {
        output = await SchemaDumper.dumpTableSchema(Base.connection, "timestamps");
        expect(output).toContain('t.timestamp("default_format"');
        expect(output).toContain('t.timestamp("without_time_zone"');
        expect(output).toContain('t.datetime("with_time_zone"');
      });
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via create table and t timestamptz",
    async () => {
      await Base.connection.createTable("timestamps", { force: true }, (t) => {
        t.datetime("default_format");
        t.datetime("without_time_zone");
        t.timestamp("also_without_time_zone");
        (t as any).timestamptz("with_time_zone");
      });
      const output = await SchemaDumper.dumpTableSchema(Base.connection, "timestamps");
      expect(output).toContain('t.datetime("default_format"');
      expect(output).toContain('t.datetime("without_time_zone"');
      expect(output).toContain('t.datetime("also_without_time_zone"');
      expect(output).toContain('t.timestamptz("with_time_zone"');
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column",
    async () => {
      await Base.connection.createTable("timestamps", { force: true }, (t) => {
        t.string("title");
      });
      await Base.connection.addColumn("timestamps", "created_at", "datetime");
      const output = await SchemaDumper.dumpTableSchema(Base.connection, "timestamps");
      expect(output).toContain("datetime");
      expect(output).toContain("created_at");
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column before rails 7",
    (ctx) => {
      ctx.skip();
      // BLOCKED: needs Migration version compatibility (Migration[6.1]).
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column before rails 7 with timestamptz setting",
    (ctx) => {
      ctx.skip();
      // BLOCKED: needs Migration version compatibility + datetime_type-aware dump.
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column with type as string",
    async () => {
      await Base.connection.createTable("timestamps", { force: true }, (t) => {
        t.string("title");
      });
      await Base.connection.addColumn("timestamps", "posted_at", "datetime");
      const output = await SchemaDumper.dumpTableSchema(Base.connection, "timestamps");
      expect(output).toContain("datetime");
      expect(output).toContain("posted_at");
    },
  );
});

describe("SchemaDumperDefaultsTest", () => {
  let adapter: TestDatabaseAdapter;
  beforeEach(() => {
    adapter = Base.connection;
  });

  it("schema dump defaults with universally supported types", async () => {
    await adapter.createTable("dump_defaults", { force: true }, (t) => {
      t.string("string_with_default", { default: "Hello!" });
      t.date("date_with_default", { default: "2014-06-05" });
      t.datetime("datetime_with_default", { default: "2014-06-05 07:17:04" });
      t.decimal("decimal_with_default", { precision: 3, scale: 2, default: 2.78 });
    });
    const output = await SchemaDumper.dumpTableSchema(Base.connection, "dump_defaults");
    expect(output).toMatch(/string.*"string_with_default".*default: "Hello!"/);
    expect(output).toMatch(/date.*"date_with_default".*default: "2014-06-05"/);
    expect(output).toMatch(/datetime.*"datetime_with_default".*default:/);
    expect(output).toMatch(/decimal.*"decimal_with_default".*precision: 3.*scale: 2/);
  });

  itIfSupports("text_column_with_default", "schema dump with text column", async () => {
    await adapter.createTable("dump_defaults", { force: true }, (t) => {
      t.text("text_with_default", { default: "John" });
    });
    const output = await SchemaDumper.dumpTableSchema(Base.connection, "dump_defaults");
    expect(output).toMatch(/text.*"text_with_default".*default: "John"/);
  });

  it.skipIf(adapterType !== "postgres")("schema dump with column infinity default", async () => {
    await adapter.createTable("infinity_defaults", {}, (t) => {
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

afterAll(async () => {
  const o = { ifExists: true } as const;
  await Base.connection.dropTable("dump_check_constraints", o);
  await Base.connection.dropTable("dump_defaults", o);
  await Base.connection.dropTable("dump_string_key_objects", o);
  await Base.connection.dropTable("infinity_defaults", o);
  await Base.connection.dropTable("schema_dump_probe", o);
  await Base.connection.dropTable("test_schema_exclusion", o);
  await Base.connection.dropTable("test_schema_unique", o);
  await Base.connection.dropTable("test_uc_no_idx", o);
  await Base.connection.dropTable("timestamps", o);
});
