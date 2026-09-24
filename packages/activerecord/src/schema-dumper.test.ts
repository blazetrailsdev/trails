import { StringIO } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { Base } from "./base.js";
import { SchemaDumper } from "./connection-adapters/abstract/schema-dumper.js";
import type { SchemaSource } from "./schema-dumper.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adapterType, ambientPoolConfiguration } from "./test-adapter.js";
import { inMemoryDb } from "./support/adapter-helper.js";
import type { TestDatabaseAdapter } from "./test-adapter.js";
import { itIfSupports, adapterSupports } from "./support/supports.js";
import { fixtures } from "./test-fixtures.js";
import { Current, Migration } from "./migration.js";
import type { TableDefinition as PostgreSQLTableDefinition } from "./connection-adapters/postgresql/schema-definitions.js";
import { ARUnit2Model } from "./test-helpers/models/arunit2-model.js";
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

function assertNoLineUp(lines: string[], pattern: RegExp): void {
  if (lines.length === 0) return expect(true).toBeTruthy();
  const matches = lines.map((line) => line.match(pattern)).filter((match) => match != null);
  if (matches.length === 0) return expect(true).toBeTruthy();
  const lineMatches = lines
    .map((line) => [line, line.match(pattern)] as const)
    .filter(([, match]) => match != null);
  expect(
    lineMatches.every(([line, match]) => {
      const start = match!.index!;
      const before = line.slice(start - 2, start);
      return before === ", " || before === "{ ";
    }),
  ).toBeTruthy();
}

function columnDefinitionLines(output: string): string[][] {
  return [...output.matchAll(/^( *)createTable.*?\n([\s\S]*?)^\1\}\);$/gm)].map((m) =>
    m[2].split(/\n/),
  );
}

class CreateCatMigration extends Current {
  override async up(): Promise<void> {
    await this.createTable("cat_owners", {}, () => {});

    await this.createTable("cats", {}, (t) => {
      t.column("name", "string");
      t.references("owner");
      t.index(["name"]);
      t.foreignKey("cat_owners", { column: "owner_id" });
    });
  }
  override async down(): Promise<void> {
    // eslint-disable-next-line blazetrails/require-table-teardown -- CreateCatMigration#down drops the two in order, the child first
    await this.dropTable("cats");
    await this.dropTable("cat_owners");
  }
}

const PRIMARY_KEY_ADAPTER = {
  primaryKey: async () => "id",
  lookupCastTypeFromColumn: () => new ValueType(),
};

describe("SchemaDumperTest", () => {
  fixtures({}, { useTransactionalTests: false });

  async function canonicalSource(): Promise<SchemaSource> {
    return (await Base.leaseConnection()) as unknown as SchemaSource;
  }
  async function standardDump(ignoreTables: (string | RegExp)[] = []): Promise<string> {
    return dumpAllTableSchema(ignoreTables, await canonicalSource());
  }
  async function dumpCanonicalTable(...tables: string[]): Promise<string> {
    return dumpTableSchema(await canonicalSource(), ...tables);
  }
  async function dumpsIndexSortOrder(): Promise<boolean> {
    return (
      (await Base.leaseConnection()) as unknown as { supportsIndexSortOrder(): Promise<boolean> }
    ).supportsIndexSortOrder();
  }

  it("schema dump", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump();
    expect(output).toMatch(/createTable\("accounts"/);
    expect(output).toMatch(/createTable\("authors"/);
    expect(output).not.toMatch(/(?<=, ) \(t\) => \{/);
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
    for (const columnSet of columnDefinitionLines(await standardDump())) {
      if (columnSet.length === 0) continue;

      expect(columnSet.every((column) => !/\bt\.\w+\s{2,}/.test(column))).toBeTruthy();
    }
  });
  it("arguments no line up", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    for (const columnSet of columnDefinitionLines(await standardDump())) {
      assertNoLineUp(columnSet, /default: /);
      assertNoLineUp(columnSet, /limit: /);
      assertNoLineUp(columnSet, /null: /);
    }
  });

  it("no dump errors", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump();
    expect(output).not.toMatch(/# Could not dump table/);
  });

  it("schema dump includes not null columns", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump([/^[^r]/]);
    expect(output).toMatch(/null: false/);
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
    expect(output).toMatch(/t\.text\("params"\);$/m);
  });

  it("schema dump does not include limit for binary field", async () => {
    const output = await dumpCanonicalTable("binaries");
    expect(output).toMatch(/t\.binary\("data"\);$/m);
  });

  it("schema dump does not include limit for float field", async () => {
    const output = await dumpCanonicalTable("numeric_data");
    expect(output).toMatch(/t\.float\("temperature"\);$/m);
  });

  it("schema dump aliased types", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await standardDump();
    expect(output).toMatch(/t\.binary\("blob_data"\);$/m);
    expect(output).toMatch(/t\.decimal\("numeric_number"/);
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
    const indexDefinition = companyIndexLine(output, /company_index/);
    let expectedDefinition: string;
    if (adapterType === "mysql") {
      if (await dumpsIndexSortOrder()) {
        expectedDefinition =
          't.index(["firm_id", "type", "rating"], { name: "company_index", length: { type: 10 }, order: { rating: "desc" } });';
        expect(indexDefinition).toBe(expectedDefinition);
      } else {
        expectedDefinition =
          't.index(["firm_id", "type", "rating"], { name: "company_index", length: { type: 10 } });';
        expect(indexDefinition).toBe(expectedDefinition);
      }
    } else if (await dumpsIndexSortOrder()) {
      expectedDefinition =
        't.index(["firm_id", "type", "rating"], { name: "company_index", order: { rating: "desc" } });';
      expect(indexDefinition).toBe(expectedDefinition);
    } else {
      expectedDefinition = 't.index(["firm_id", "type", "rating"], { name: "company_index" });';
      expect(indexDefinition).toBe(expectedDefinition);
    }
  });

  it("schema dumps partial indices", async () => {
    const output = await dumpCanonicalTable("companies");
    const indexDefinition = companyIndexLine(output, /company_partial_index/);
    let expectedDefinition: string;
    // eslint-disable-next-line blazetrails/no-conditional-in-test -- Rails branches on supports_partial_index? / supports_index_sort_order?, not current_adapter?
    if (adapterSupports("partial_index")) {
      expectedDefinition =
        't.index(["firm_id", "type"], { name: "company_partial_index", where: "(rating > 10)" });';
      expect(indexDefinition).toBe(expectedDefinition);
    } else {
      expectedDefinition = 't.index(["firm_id", "type"], { name: "company_partial_index" });';
      expect(indexDefinition).toBe(expectedDefinition);
    }
  });

  it("schema dumps nulls not distinct", async () => {
    const output = await dumpCanonicalTable("companies");
    const indexDefinition = companyIndexLine(output, /company_nulls_not_distinct/);
    let expectedDefinition: string;
    // eslint-disable-next-line blazetrails/no-conditional-in-test -- Rails branches on supports_partial_index? / supports_index_sort_order?, not current_adapter?
    if (adapterSupports("nulls_not_distinct")) {
      expectedDefinition =
        't.index(["firm_id"], { name: "company_nulls_not_distinct", nullsNotDistinct: true });';
      expect(indexDefinition).toBe(expectedDefinition);
    } else {
      expectedDefinition = 't.index(["firm_id"], { name: "company_nulls_not_distinct" });';
      expect(indexDefinition).toBe(expectedDefinition);
    }
  });

  it("schema dumps index sort order", async () => {
    const output = await dumpCanonicalTable("companies");
    const indexDefinition = companyIndexLine(output, /_name_and_rating/);
    let expectedDefinition: string;
    // eslint-disable-next-line blazetrails/no-conditional-in-test -- Rails branches on supports_partial_index? / supports_index_sort_order?, not current_adapter?
    if (await dumpsIndexSortOrder()) {
      expectedDefinition =
        't.index(["name", "rating"], { name: "index_companies_on_name_and_rating", order: "desc" });';
      expect(indexDefinition).toBe(expectedDefinition);
    } else {
      expectedDefinition =
        't.index(["name", "rating"], { name: "index_companies_on_name_and_rating" });';
      expect(indexDefinition).toBe(expectedDefinition);
    }
  });

  it("schema dumps index length", async () => {
    const output = await dumpCanonicalTable("companies");
    const indexDefinition = companyIndexLine(output, /_name_and_description/);
    let expectedDefinition: string;
    if (adapterType === "mysql") {
      expectedDefinition =
        't.index(["name", "description"], { name: "index_companies_on_name_and_description", length: 10 });';
      expect(indexDefinition).toBe(expectedDefinition);
    } else {
      expectedDefinition =
        't.index(["name", "description"], { name: "index_companies_on_name_and_description" });';
      expect(indexDefinition).toBe(expectedDefinition);
    }
  });

  itIfSupports("expression_index", "schema dump expression indices", async () => {
    const output = await dumpCanonicalTable("companies");
    let line = companyIndexLine(output, /company_expression_index/);
    line = line.replace(/, \{ name: "company_expression_index" \}\);$/, "");
    if (adapterType === "postgres") {
      expect(line).toMatch(/CASE.+lower\(\(name\)::text\).+END\) DESC"/i);
    } else if (adapterType === "mysql") {
      expect(line).toMatch(/CASE.+lower\(`name`\).+END\) DESC"/i);
    } else if (adapterType === "sqlite") {
      expect(line).toMatch(/CASE.+lower\(name\).+END\) DESC"/i);
    } else {
      expect(false).toBeTruthy();
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

      if (adapterType === "postgres") {
        expect(output).toMatch(/c_int_1.*limit: 2/);
        expect(output).toMatch(/c_int_2.*limit: 2/);

        expect(output).toMatch(/"c_int_3"(?!.*limit)/);
        expect(output).toMatch(/"c_int_4"(?!.*limit)/);
      } else if (adapterType === "mysql") {
        expect(output).toMatch(/c_int_1.*limit: 1/);
        expect(output).toMatch(/c_int_2.*limit: 2/);
        expect(output).toMatch(/c_int_3.*limit: 3/);

        expect(output).toMatch(/"c_int_4"(?!.*limit)/);
      } else if (adapterType === "sqlite") {
        expect(output).toMatch(/c_int_1.*limit: 1/);
        expect(output).toMatch(/c_int_2.*limit: 2/);
        expect(output).toMatch(/c_int_3.*limit: 3/);
        expect(output).toMatch(/c_int_4.*limit: 4/);
      }

      if (adapterType === "sqlite") {
        expect(output).toMatch(/c_int_5.*limit: 5/);
        expect(output).toMatch(/c_int_6.*limit: 6/);
        expect(output).toMatch(/c_int_7.*limit: 7/);
        expect(output).toMatch(/c_int_8.*limit: 8/);
      } else {
        expect(output).toMatch(/t\.bigint\("c_int_5"\);$/m);
        expect(output).toMatch(/t\.bigint\("c_int_6"\);$/m);
        expect(output).toMatch(/t\.bigint\("c_int_7"\);$/m);
        expect(output).toMatch(/t\.bigint\("c_int_8"\);$/m);
      }
    },
  );

  itIfSupports("check_constraints", "schema dumps check constraints", async () => {
    const constraintDefinition = (await dumpCanonicalTable("products"))
      .split(/\n/)
      .filter((line) => /t\.checkConstraint.*products_price_check/.test(line))[0]
      .trim();
    let expectedDefinition: string;

    if (adapterType === "mysql") {
      expectedDefinition =
        't.checkConstraint("`price` > `discounted_price`", { name: "products_price_check" });';
      expect(constraintDefinition).toBe(expectedDefinition);
    } else {
      expectedDefinition =
        't.checkConstraint("price > discounted_price", { name: "products_price_check" });';
      expect(constraintDefinition).toBe(expectedDefinition);
    }
  });
});

describe("SchemaDumperTest", () => {
  afterEach(() => {
    delete (SchemaDumper as unknown as Record<string, unknown>)["ignoreTables"];
    SchemaDumper.fkIgnorePattern = /^fk_rails_[0-9a-f]{10}$/;
  });

  it("dump schema information with empty versions", async () => {
    const schemaMigration = Base.connectionPool().schemaMigration;
    await schemaMigration.createTable();
    await schemaMigration.deleteAllVersions();
    const schemaInfo = (await (await Base.leaseConnection()).dumpSchemaInformation!()) ?? "";
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
      const schemaInfo = await (await Base.leaseConnection()).dumpSchemaInformation!();
      const expected = [
        `INSERT INTO ${(await Base.leaseConnection()).quoteTableName("schema_migrations")} (version) VALUES`,
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
    const adapter = await Base.leaseConnection();
    const sm = new SchemaMigration(adapter.pool);
    await sm.createTable();
    await sm.createVersion("20240601120000");
    const output = (await TopLevelDumper.dump(adapter)).string();
    expect(output).toMatch(/export const defineParams = \{ version: 2024_06_01_120000 \};/);
  }, 60000);

  it("schema dump with regexp ignored table", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    const output = await dumpAllTableSchema([/^courses/], await ARUnit2Model.leaseConnection());
    expect(output).not.toMatch(/createTable\("courses"/);
    expect(output).toMatch(/createTable\("colleges"/);
    expect(output).not.toMatch(/createTable\("schema_migrations"/);
    expect(output).not.toMatch(/createTable\("ar_internal_metadata"/);
  });

  it(
    "schema dump keeps id false when id is false and unique not null column added",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      await (
        await Base.leaseConnection()
      ).createTable("dump_string_key_objects", { id: false, force: true }, (t) => {
        t.string("key", { null: false });
      });
      await (
        await Base.leaseConnection()
      ).addIndex("dump_string_key_objects", "key", { unique: true });
      const output = await dumpTableSchema(await Base.leaseConnection(), "dump_string_key_objects");
      expect(output).toMatch(/createTable\("dump_string_key_objects",\s*\{[^}]*id:\s*false/);
    },
  );

  itIfSupports("exclusion_constraints", "schema dumps exclusion constraints", async () => {
    const output = await dumpTableSchema(
      await Base.leaseConnection(),
      "test_exclusion_constraints",
    );
    const constraintDefinitions = output
      .split(/\n/)
      .filter((line) => /test_exclusion_constraints_.*_overlap/.test(line));

    expect(constraintDefinitions.length).toBe(3);
    expect(output).toMatch(
      't.exclusionConstraint("daterange(start_date, end_date) WITH &&", { where: "(start_date IS NOT NULL) AND (end_date IS NOT NULL)", using: "gist", name: "test_exclusion_constraints_date_overlap" });',
    );
    expect(output).toMatch(
      't.exclusionConstraint("daterange(valid_from, valid_to) WITH &&", { where: "(valid_from IS NOT NULL) AND (valid_to IS NOT NULL)", using: "gist", deferrable: "immediate", name: "test_exclusion_constraints_valid_overlap" });',
    );
    expect(output).toMatch(
      't.exclusionConstraint("daterange(transaction_from, transaction_to) WITH &&", { where: "(transaction_from IS NOT NULL) AND (transaction_to IS NOT NULL)", using: "gist", deferrable: "deferred", name: "test_exclusion_constraints_transaction_overlap" });',
    );
  });
  itIfSupports("unique_constraints", "schema dumps unique constraints", async () => {
    const output = await dumpTableSchema(await Base.leaseConnection(), "test_unique_constraints");
    const constraintDefinitions = output
      .split(/\n/)
      .filter((line) => /t\.uniqueConstraint/.test(line));

    expect(constraintDefinitions.length).toBe(4);
    expect(output).toMatch(
      't.uniqueConstraint(["position_1"], { name: "test_unique_constraints_position_deferrable_false" });',
    );
    expect(output).toMatch(
      't.uniqueConstraint(["position_2"], { deferrable: "immediate", name: "test_unique_constraints_position_deferrable_immediate" });',
    );
    expect(output).toMatch(
      't.uniqueConstraint(["position_3"], { deferrable: "deferred", name: "test_unique_constraints_position_deferrable_deferred" });',
    );
    expect(output).toMatch(
      't.uniqueConstraint(["position_4"], { nullsNotDistinct: true, name: "test_unique_constraints_position_nulls_not_distinct" });',
    );
  });
  itIfSupports(
    "unique_constraints",
    "schema does not dump unique constraints as indexes",
    async () => {
      const output = await dumpTableSchema(await Base.leaseConnection(), "test_unique_constraints");
      const uniqueIndexDefinitions = output
        .split(/\n/)
        .filter((line) => /t\.index.*unique: true/.test(line));

      expect(uniqueIndexDefinitions.length).toBe(0);
    },
  );
  it.skipIf(adapterType !== "mysql")(
    "schema dump includes length for mysql binary fields",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await dumpTableSchema(await Base.leaseConnection(), "binary_fields");
      expect(output).toMatch(/t\.binary\("var_binary", \{ limit: 255 \}\)/);
      expect(output).toMatch(/t\.binary\("var_binary_large", \{ limit: 4095 \}\)/);
    },
  );
  it.skipIf(adapterType !== "mysql")(
    "schema dump includes length for mysql blob and text fields",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await dumpTableSchema(await Base.leaseConnection(), "binary_fields");
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
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await dumpTableSchema(await Base.leaseConnection(), "booleans");
      expect(output).not.toMatch(/t\.boolean\("has_fun",.+limit: 1/);
    },
  );
  it.skipIf(adapterType !== "mysql")(
    "schema dumps index type",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await dumpTableSchema(await Base.leaseConnection(), "key_tests");
      expect(output).toMatch(
        /t\.index\(\["awesome"\], \{ name: "index_key_tests_on_awesome", type: "fulltext" \}\);$/m,
      );
      expect(output).toMatch(/t\.index\(\["pizza"\], \{ name: "index_key_tests_on_pizza" \}\);$/m);
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump includes bigint default",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await dumpTableSchema(await Base.leaseConnection(), "defaults");
      expect(output).toMatch(/t\.bigint\("bigint_default",\s*\{[^}]*default:\s*0[^}]*\}/);
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump includes limit on array type",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await dumpTableSchema(await Base.leaseConnection(), "bigint_array");
      expect(output).toMatch(/t\.bigint\("big_int_data_points", \{ array: true \}\)/);
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump allows array of decimal defaults",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await dumpTableSchema(await Base.leaseConnection(), "bigint_array");
      expect(output).toMatch(
        /t\.decimal\("decimal_array_default",\s*\{[^}]*default:\s*\["1\.23", "3\.45"\][^}]*array:\s*true/,
      );
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump interval type",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await dumpTableSchema(await Base.leaseConnection(), "postgresql_times");
      expect(output).toMatch(/t\.interval\("time_interval"\)/);
      expect(output).toMatch(/t\.interval\("scaled_time_interval", \{ precision: 6 \}\)/);
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump oid type",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await dumpTableSchema(await Base.leaseConnection(), "postgresql_oids");
      expect(output).toMatch(/t\.oid\("obj_id"\)/);
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump includes extensions",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const adapter = await Base.leaseConnection();
      const original = (adapter as any).extensions;
      await adapter.createTable("schema_dump_probe", { force: true }, (t) => {
        t.integer("x");
      });
      try {
        (adapter as any).extensions = async () => ["hstore"];
        let output = await dumpTableSchema(adapter, "schema_dump_probe");
        expect(output).toMatch("These are extensions that must be enabled");
        expect(output).toMatch(/enableExtension\("hstore"\)/);

        (adapter as any).extensions = async () => [];
        output = await dumpTableSchema(adapter, "schema_dump_probe");
        expect(output).not.toMatch("These are extensions that must be enabled");
        expect(output).not.toMatch(/enableExtension/);
      } finally {
        (adapter as any).extensions = original;
      }
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump includes extensions in alphabetic order",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const adapter = await Base.leaseConnection();
      const original = (adapter as any).extensions;
      await adapter.createTable("schema_dump_probe", { force: true }, (t) => {
        t.integer("x");
      });
      try {
        (adapter as any).extensions = async () => ["hstore", "uuid-ossp", "xml2"];
        let output = await dumpTableSchema(adapter, "schema_dump_probe");
        let enabledExtensions = [...output.matchAll(/enableExtension\("(.+?)"\)/g)].map(
          (m) => m[1],
        );
        expect(enabledExtensions).toEqual(["hstore", "uuid-ossp", "xml2"]);

        (adapter as any).extensions = async () => ["uuid-ossp", "xml2", "hstore"];
        output = await dumpTableSchema(adapter, "schema_dump_probe");
        enabledExtensions = [...output.matchAll(/enableExtension\("(.+?)"\)/g)].map((m) => m[1]);
        expect(enabledExtensions).toEqual(["hstore", "uuid-ossp", "xml2"]);
      } finally {
        (adapter as any).extensions = original;
      }
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump include limit for float4 field",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const output = await dumpTableSchema(await Base.leaseConnection(), "numeric_data");
      expect(output).toMatch(/t\.float\("temperature_with_limit", \{ limit: 24 \}\)/);
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump keeps enum intact if it contains comma",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      const adapter = await Base.leaseConnection();
      await (adapter as any).createEnum("enum_with_comma", ["value1", "value,2", "value3"]);
      await adapter.createTable("schema_dump_probe", { force: true }, (t) => {
        t.integer("x");
      });
      try {
        const output = await dumpTableSchema(adapter, "schema_dump_probe");
        const expectedDefinition = 'createEnum("enum_with_comma", ["value1","value,2","value3"])';
        expect(output).toContain(expectedDefinition);
      } finally {
        await (adapter as any).dropEnum("enum_with_comma", { ifExists: true });
      }
    },
  );

  itIfSupports(
    "foreign_keys",
    "foreign keys are dumped at the bottom to circumvent dependency issues",
    async () => {
      const output = await dumpAllTableSchema([], await Base.leaseConnection());
      expect(output).toMatch(
        /^\s+await ctx\.addForeignKey\("fk_test_has_fk"[^\n]+\n\s+await ctx\.addForeignKey\("lessons_students"/m,
      );
    },
    FULL_DUMP_TIMEOUT_MS,
  );
  itIfSupports("foreign_keys", "do not dump foreign keys for ignored tables", async () => {
    const output = await dumpTableSchema(await Base.leaseConnection(), "authors");
    expect(
      [...output.matchAll(/^\s*await ctx\.addForeignKey\("([^"]+)".+$/gm)].map((m) => m[1]),
    ).toEqual(["authors"]);
  });
  itIfSupports.skipIf(inMemoryDb())(
    "foreign_keys",
    "do not dump foreign keys when bypassed by config",
    async () => {
      const storage = await mkdtemp(join(tmpdir(), "trails-schema-dumper-"));
      try {
        await Base.establishConnection({
          adapter: "sqlite3",
          database: join(storage, "test.sqlite3"),
          foreignKeys: false,
        });

        const output = await dumpAllTableSchema();
        expect(output).not.toMatch(
          /^\s+await ctx\.addForeignKey\("fk_test_has_fk"[^\n]+\n\s+await ctx\.addForeignKey\("lessons_students"/m,
        );
      } finally {
        await Base.establishConnection(ambientPoolConfiguration());
        await rm(storage, { recursive: true, force: true });
      }
    },
  );

  it("schema dump with table name prefix and suffix", async () => {
    const prefixWas = Base.tableNamePrefix;
    const suffixWas = Base.tableNameSuffix;
    Base.tableNamePrefix = "foo_";
    Base.tableNameSuffix = "_bar";
    const migration = new CreateCatMigration();
    await migration.migrate("up");
    try {
      const output = await dumpTableSchema(
        await Base.leaseConnection(),
        "foo_cat_owners_bar",
        "foo_cats_bar",
      );

      expect(output).toMatch(/createTable\("cat_owners"/);
      expect(output).toMatch(/createTable\("cats"/);
      expect(output).toMatch(/t\.index\(\["name"\], \{ name: "index_foo_cats_bar_on_name" \}\)/);
      expect(output).not.toMatch(/createTable\("foo_.+_bar"/);
      expect(output).not.toMatch(/addIndex\("foo_.+_bar"/);
      expect(output).not.toMatch(/createTable\("schema_migrations"/);
      expect(output).not.toMatch(/createTable\("ar_internal_metadata"/);

      if (adapterSupports("foreign_keys")) {
        expect(output).toMatch(/addForeignKey\("cats", "cat_owners", \{ column: "owner_id" \}\)/);
        expect(output).not.toMatch(/addForeignKey\("foo_.+_bar"/);
        expect(output).not.toMatch(/addForeignKey\("[^"]+", "foo_.+_bar"/);
      }
    } finally {
      await migration.migrate("down");
      Base.tableNamePrefix = prefixWas;
      Base.tableNameSuffix = suffixWas;
    }
  });

  it("schema dump with table name prefix and suffix regexp escape", async () => {
    const prefixWas = Base.tableNamePrefix;
    const suffixWas = Base.tableNameSuffix;
    Base.tableNamePrefix = "foo$";
    Base.tableNameSuffix = "$bar";
    const migration = new CreateCatMigration();
    await migration.migrate("up");
    try {
      const output = await dumpTableSchema(
        await Base.leaseConnection(),
        "foo$cat_owners$bar",
        "foo$cats$bar",
      );

      expect(output).toMatch(/createTable\("cat_owners"/);
      expect(output).toMatch(/createTable\("cats"/);
      expect(output).toMatch(/t\.index\(\["name"\], \{ name: "index_foo\$cats\$bar_on_name" \}\)/);
      expect(output).not.toMatch(/createTable\("foo\$.+\$bar"/);
      expect(output).not.toMatch(/addIndex\("foo\$.+\$bar"/);
      expect(output).not.toMatch(/createTable\("schema_migrations"/);
      expect(output).not.toMatch(/createTable\("ar_internal_metadata"/);

      if (adapterSupports("foreign_keys")) {
        expect(output).toMatch(/addForeignKey\("cats", "cat_owners", \{ column: "owner_id" \}\)/);
        expect(output).not.toMatch(/addForeignKey\("foo\$.+\$bar"/);
        expect(output).not.toMatch(/addForeignKey\("[^"]+", "foo\$.+\$bar"/);
      }
    } finally {
      await migration.migrate("down");
      Base.tableNamePrefix = prefixWas;
      Base.tableNameSuffix = suffixWas;
    }
  });
  it("schema dump with table name prefix and ignoring tables", async () => {
    const source = {
      tables: async () => ["omg_cats", "omg_omg_cats"],
      columns: async (_t: string) => [schemaColumn("id", "integer")],
      indexes: async () => [],
      adapter: PRIMARY_KEY_ADAPTER,
    };
    SchemaDumper.ignoreTables = ["cats"];
    const output = (
      await SchemaDumper.dump(source as any, new StringIO(), { tableNamePrefix: "omg_" })
    ).string();

    expect(output).toMatch(/createTable\("omg_cats"/);
    expect(output).not.toMatch(/createTable\("cats"/);
  });

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via create table and t column",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      await (
        await Base.leaseConnection()
      ).createTable("timestamps", { force: true }, (t) => {
        t.datetime("this_should_remain_datetime");
        t.timestamp("this_is_an_alias_of_datetime");
        t.column("without_time_zone", "timestamp");
        t.column("with_time_zone", "timestamptz");
      });
      const output = await dumpTableSchema(await Base.leaseConnection(), "timestamps");
      expect(output.includes('t.datetime("this_should_remain_datetime"')).toBeTruthy();
      expect(output.includes('t.datetime("this_is_an_alias_of_datetime"')).toBeTruthy();
      expect(output.includes('t.datetime("without_time_zone"')).toBeTruthy();
      expect(output.includes('t.timestamptz("with_time_zone"')).toBeTruthy();
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump with timestamptz datetime format",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      await withPostgresqlDatetimeType("timestamptz", async () => {
        await (
          await Base.leaseConnection()
        ).createTable("timestamps", { force: true }, (t) => {
          t.datetime("this_should_remain_datetime");
          (t as PostgreSQLTableDefinition).timestamptz("this_is_an_alias_of_datetime");
          t.column("without_time_zone", "timestamp");
          t.column("with_time_zone", "timestamptz");
        });
        const output = await dumpTableSchema(await Base.leaseConnection(), "timestamps");
        expect(output.includes('t.datetime("this_should_remain_datetime"')).toBeTruthy();
        expect(output.includes('t.datetime("this_is_an_alias_of_datetime"')).toBeTruthy();
        expect(output.includes('t.timestamp("without_time_zone"')).toBeTruthy();
        expect(output.includes('t.datetime("with_time_zone"')).toBeTruthy();
      });
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "timestamps schema dump before rails 7",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async (ctx) => {
      // BLOCKED: migration-compatibility-v6-1-for-pre-rails-7-dump-tests
      ctx.skip();
      class TimestampsMigration extends Migration.get(6.1) {
        override async up(): Promise<void> {
          await this.createTable("timestamps", (t) => {
            t.datetime("this_should_remain_datetime");
            t.timestamp("this_is_an_alias_of_datetime");
            t.column("this_is_also_an_alias_of_datetime", "timestamp");
          });
        }
        override async down(): Promise<void> {
          await this.dropTable("timestamps");
        }
      }
      const migration = new TimestampsMigration();
      await migration.migrate("up");

      const output = await dumpTableSchema(await Base.leaseConnection(), "timestamps");
      expect(output.includes('t.datetime("this_should_remain_datetime"')).toBeTruthy();
      expect(output.includes('t.datetime("this_is_an_alias_of_datetime"')).toBeTruthy();
      expect(output.includes('t.datetime("this_is_also_an_alias_of_datetime"')).toBeTruthy();
      await migration.migrate("down");
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "timestamps schema dump before rails 7 with timestamptz setting",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async (ctx) => {
      // BLOCKED: migration-compatibility-v6-1-for-pre-rails-7-dump-tests
      ctx.skip();
      let migration!: Migration;
      await withPostgresqlDatetimeType("timestamptz", async () => {
        class TimestampsMigration extends Migration.get(6.1) {
          override async up(): Promise<void> {
            await this.createTable("timestamps", (t) => {
              t.datetime("this_should_change_to_timestamp");
              t.timestamp("this_should_stay_as_timestamp");
              t.column("this_should_also_stay_as_timestamp", "timestamp");
            });
          }
          override async down(): Promise<void> {
            await this.dropTable("timestamps");
          }
        }
        migration = new TimestampsMigration();
        await migration.migrate("up");

        const output = await dumpTableSchema(await Base.leaseConnection(), "timestamps");
        expect(output.includes('t.timestamp("this_should_change_to_timestamp"')).toBeTruthy();
        expect(output.includes('t.timestamp("this_should_stay_as_timestamp"')).toBeTruthy();
        expect(output.includes('t.timestamp("this_should_also_stay_as_timestamp"')).toBeTruthy();
      });
      await migration.migrate("down");
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump when changing datetime type for an existing app",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      await (
        await Base.leaseConnection()
      ).createTable("timestamps", { force: true }, (t) => {
        t.datetime("default_format");
        t.column("without_time_zone", "timestamp");
        t.column("with_time_zone", "timestamptz");
      });

      let output = await dumpTableSchema(await Base.leaseConnection(), "timestamps");
      expect(output.includes('t.datetime("default_format"')).toBeTruthy();
      expect(output.includes('t.datetime("without_time_zone"')).toBeTruthy();
      expect(output.includes('t.timestamptz("with_time_zone"')).toBeTruthy();

      await withPostgresqlDatetimeType("timestamptz", async () => {
        output = await dumpTableSchema(await Base.leaseConnection(), "timestamps");
        expect(output.includes('t.timestamp("default_format"')).toBeTruthy();
        expect(output.includes('t.timestamp("without_time_zone"')).toBeTruthy();
        expect(output.includes('t.datetime("with_time_zone"')).toBeTruthy();
      });
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via create table and t timestamptz",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      await (
        await Base.leaseConnection()
      ).createTable("timestamps", { force: true }, (t) => {
        t.datetime("default_format");
        t.datetime("without_time_zone");
        t.timestamp("also_without_time_zone");
        (t as PostgreSQLTableDefinition).timestamptz("with_time_zone");
      });
      const output = await dumpTableSchema(await Base.leaseConnection(), "timestamps");
      expect(output.includes('t.datetime("default_format"')).toBeTruthy();
      expect(output.includes('t.datetime("without_time_zone"')).toBeTruthy();
      expect(output.includes('t.datetime("also_without_time_zone"')).toBeTruthy();
      expect(output.includes('t.timestamptz("with_time_zone"')).toBeTruthy();
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      await (await Base.leaseConnection()).createTable("timestamps", { force: true }, () => {});
      await (await Base.leaseConnection()).addColumn("timestamps", "default_format", "datetime");
      await (await Base.leaseConnection()).addColumn("timestamps", "without_time_zone", "datetime");
      await (
        await Base.leaseConnection()
      ).addColumn("timestamps", "also_without_time_zone", "timestamp");
      await (await Base.leaseConnection()).addColumn("timestamps", "with_time_zone", "timestamptz");

      const output = await dumpTableSchema(await Base.leaseConnection(), "timestamps");
      expect(output.includes('t.datetime("default_format"')).toBeTruthy();
      expect(output.includes('t.datetime("without_time_zone"')).toBeTruthy();
      expect(output.includes('t.datetime("also_without_time_zone"')).toBeTruthy();
      expect(output.includes('t.timestamptz("with_time_zone"')).toBeTruthy();
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column before rails 7",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async (ctx) => {
      // BLOCKED: migration-compatibility-v6-1-for-pre-rails-7-dump-tests
      ctx.skip();
      class TimestampsMigration extends Migration.get(6.1) {
        override async up(): Promise<void> {
          await this.createTable("timestamps");

          await this.addColumn("timestamps", "default_format", "datetime");
          await this.addColumn("timestamps", "without_time_zone", "datetime");
          await this.addColumn("timestamps", "also_without_time_zone", "timestamp");
        }
        override async down(): Promise<void> {
          await this.dropTable("timestamps");
        }
      }
      const migration = new TimestampsMigration();
      await migration.migrate("up");

      const output = await dumpTableSchema(await Base.leaseConnection(), "timestamps");
      expect(output.includes('t.datetime("default_format"')).toBeTruthy();
      expect(output.includes('t.datetime("without_time_zone"')).toBeTruthy();
      expect(output.includes('t.datetime("also_without_time_zone"')).toBeTruthy();
      await migration.migrate("down");
    },
  );
  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column before rails 7 with timestamptz setting",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async (ctx) => {
      // BLOCKED: migration-compatibility-v6-1-for-pre-rails-7-dump-tests
      ctx.skip();
      let migration!: Migration;
      await withPostgresqlDatetimeType("timestamptz", async () => {
        class TimestampsMigration extends Migration.get(6.1) {
          override async up(): Promise<void> {
            await this.createTable("timestamps");

            await this.addColumn("timestamps", "this_should_change_to_timestamp", "datetime");
            await this.addColumn("timestamps", "this_should_stay_as_timestamp", "timestamp");
          }
          override async down(): Promise<void> {
            await this.dropTable("timestamps");
          }
        }
        migration = new TimestampsMigration();
        await migration.migrate("up");

        const output = await dumpTableSchema(await Base.leaseConnection(), "timestamps");
        expect(output.includes('t.timestamp("this_should_change_to_timestamp"')).toBeTruthy();
        expect(output.includes('t.timestamp("this_should_stay_as_timestamp"')).toBeTruthy();
      });
      await migration.migrate("down");
    },
  );

  it.skipIf(adapterType !== "postgres")(
    "schema dump with correct timestamp types via add column with type as string",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async (ctx) => {
      // BLOCKED: migration-compatibility-v6-1-for-pre-rails-7-dump-tests
      ctx.skip();
      let migration!: Migration;
      await withPostgresqlDatetimeType("timestamptz", async () => {
        class TimestampsMigration extends Migration.get(6.1) {
          override async up(): Promise<void> {
            await this.createTable("timestamps");

            await this.addColumn("timestamps", "this_should_change_to_timestamp", "datetime");
            await this.addColumn("timestamps", "this_should_stay_as_timestamp", "timestamp");
          }
          override async down(): Promise<void> {
            await this.dropTable("timestamps");
          }
        }
        migration = new TimestampsMigration();
        await migration.migrate("up");

        const output = await dumpTableSchema(await Base.leaseConnection(), "timestamps");
        expect(output.includes('t.timestamp("this_should_change_to_timestamp"')).toBeTruthy();
        expect(output.includes('t.timestamp("this_should_stay_as_timestamp"')).toBeTruthy();
      });
      await migration.migrate("down");
    },
  );
});

describe("SchemaDumperDefaultsTest", () => {
  let adapter: TestDatabaseAdapter;
  beforeEach(async () => {
    adapter = await Base.leaseConnection();
  });

  it(
    "schema dump defaults with universally supported types",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      await adapter.createTable("dump_defaults", { force: true }, (t) => {
        t.string("string_with_default", { default: "Hello!" });
        t.date("date_with_default", { default: "2014-06-05" });
        t.datetime("datetime_with_default", { default: "2014-06-05 07:17:04" });
        t.time("time_with_default", { default: "07:17:04" });
        t.decimal("decimal_with_default", { precision: 3, scale: 2, default: 2.78 });
      });
      const output = await dumpTableSchema(await Base.leaseConnection(), "dump_defaults");
      expect(output).toMatch(/string.*"string_with_default".*default: "Hello!"/);
      expect(output).toMatch(/date.*"date_with_default".*default: "2014-06-05"/);
      expect(output).toMatch(/datetime.*"datetime_with_default".*default:/);
      expect(output).toMatch(/time.*"time_with_default".*default:/);
      expect(output).toMatch(/decimal.*"decimal_with_default".*precision: 3.*scale: 2/);
    },
  );

  itIfSupports("text_column_with_default", "schema dump with text column", async () => {
    await adapter.createTable("dump_defaults", { force: true }, (t) => {
      t.text("text_with_default", { default: "John' Doe" });
      t.text("uuid", {
        default: () => (adapterType === "postgres" ? "gen_random_uuid()" : "uuid()"),
      });
    });
    const output = await dumpTableSchema(await Base.leaseConnection(), "dump_defaults");

    expect(output).toMatch(/text.*"text_with_default".*default: "John' Doe"/);

    if (adapterType === "postgres") {
      expect(output).toMatch(/text.*"uuid".*default: \(\) => "gen_random_uuid\(\)"/);
    } else {
      expect(output).toMatch(/text.*"uuid".*default: \(\) => "uuid\(\)"/);
    }
  });

  it.skipIf(adapterType !== "postgres")(
    "schema dump with column infinity default",
    { timeout: FULL_DUMP_TIMEOUT_MS },
    async () => {
      await adapter.createTable("infinity_defaults", {}, (t) => {
        t.float("float_with_inf_default", { default: Infinity });
        t.float("float_with_nan_default", { default: NaN });
        t.datetime("beginning_of_time", { default: "-infinity" });
        t.datetime("end_of_time", { default: "infinity" });
        t.date("date_with_neg_inf_default", { default: -Infinity });
        t.date("date_with_pos_inf_default", { default: Infinity });
      });
      const output = await dumpTableSchema(adapter, "infinity_defaults");
      expect(output).toMatch(/t\.float\("float_with_inf_default",.*default: ::Float::INFINITY/);
      expect(output).toMatch(/t\.float\("float_with_nan_default",.*default: ::Float::NAN/);
      expect(output).toMatch(/t\.datetime\("beginning_of_time",.*default: -::Float::INFINITY/);
      expect(output).toMatch(/t\.datetime\("end_of_time",.*default: ::Float::INFINITY/);
      expect(output).toMatch(/t\.date\("date_with_neg_inf_default",.*default: -::Float::INFINITY/);
      expect(output).toMatch(/t\.date\("date_with_pos_inf_default",.*default: ::Float::INFINITY/);
    },
  );
});

afterAll(async () => {
  const o = { ifExists: true } as const;
  await (await Base.leaseConnection()).dropTable("dump_check_constraints", o);
  await (await Base.leaseConnection()).dropTable("dump_defaults", o);
  await (await Base.leaseConnection()).dropTable("dump_string_key_objects", o);
  await (await Base.leaseConnection()).dropTable("infinity_defaults", o);
  await (await Base.leaseConnection()).dropTable("schema_dump_probe", o);
  await (await Base.leaseConnection()).dropTable("timestamps", o);
});
