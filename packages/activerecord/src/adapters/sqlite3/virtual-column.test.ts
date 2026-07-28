/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/virtual_column_test.rb
 */
import { expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { Base } from "../../index.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { FixtureSet } from "../../fixtures.js";
import { fixtures } from "../../test-fixtures.js";
import { virtualColumnFixtureData } from "../../test-helpers/fixtures/virtual-columns.js";
import { itIfSupports } from "../../support/supports.js";
import type { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import type { Column } from "../../connection-adapters/sqlite3/column.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

fixtures([], { useTransactionalTests: false });

let adapter: AbstractSQLite3Adapter;

class VirtualColumn extends Base {
  static tableName = "virtual_columns";
  static {
    this.attribute("id", "integer");
  }
}

beforeEach(async () => {
  adapter = Base.connection as AbstractSQLite3Adapter;
  await adapter.createTable("virtual_columns", { force: true }, (t) => {
    t.string("name");
    t.virtual("upper_name", { type: "string", as: "UPPER(name)", stored: true });
    t.virtual("lower_name", { type: "string", as: "LOWER(name)", stored: false });
    t.virtual("octet_name", { type: "integer", as: "LENGTH(name)" });
    t.virtual("mutated_name", { type: "string", as: "REPLACE(name, 'l', 'L')" });
    t.integer("column1");
  });
  await reloadColumnInformation();
  await VirtualColumn.create({ name: "Rails", column1: 10 });
});

afterEach(async () => {
  await adapter.dropTable("virtual_columns", { ifExists: true }).catch(() => undefined);
  VirtualColumn.resetColumnInformation();
});

async function take(): Promise<Record<string, unknown>> {
  return (await VirtualColumn.take()) as unknown as Record<string, unknown>;
}

function columnFor(name: string): Column {
  return VirtualColumn.columnsHash()[name] as unknown as Column;
}

async function reloadColumnInformation(): Promise<void> {
  adapter.schemaCache?.clear();
  VirtualColumn.resetColumnInformation();
  await VirtualColumn.loadSchema();
}

// -- Rails test class: virtual_column_test.rb --
describeIfSqlite("SQLite3VirtualColumnTest", () => {
  itIfSupports("virtual_columns", "virtual column with full inserts", async () => {
    const partialInsertsWas = VirtualColumn.partialInserts;
    VirtualColumn.partialInserts = false;
    try {
      await expect(VirtualColumn.createBang({ name: "Rails" })).resolves.toBeTruthy();
    } finally {
      VirtualColumn.partialInserts = partialInsertsWas;
    }
  });

  itIfSupports("virtual_columns", "stored column", async () => {
    const column = columnFor("upper_name");
    expect(column.isVirtual()).toBe(true);
    expect(column.isVirtualStored()).toBe(true);
    expect((await take()).upper_name).toBe("RAILS");
  });

  itIfSupports("virtual_columns", "explicit virtual column", async () => {
    const column = columnFor("lower_name");
    expect(column.isVirtual()).toBe(true);
    expect(column.isVirtualStored()).toBe(false);
    expect((await take()).lower_name).toBe("rails");
  });

  itIfSupports("virtual_columns", "implicit virtual column", async () => {
    const column = columnFor("octet_name");
    expect(column.isVirtual()).toBe(true);
    expect(column.isVirtualStored()).toBe(false);
    expect((await take()).octet_name).toBe(5);
  });

  itIfSupports("virtual_columns", "virtual column with comma in definition", async () => {
    const column = columnFor("mutated_name");
    expect(column.isVirtual()).toBe(true);
    expect(column.isVirtualStored()).toBe(false);
    expect(column.defaultFunction).not.toBeNull();
    expect((await take()).mutated_name).toBe("RaiLs");
  });

  itIfSupports("virtual_columns", "change table with stored generated column", async () => {
    await adapter.changeTable("virtual_columns", async (t) => {
      await t.virtual("decr_column1", { type: "integer", as: "column1 - 1", stored: true });
    });
    await reloadColumnInformation();
    const column = columnFor("decr_column1");
    expect(column.isVirtual()).toBe(true);
    expect(column.isVirtualStored()).toBe(true);
    expect((await take()).decr_column1).toBe(9);
  });

  itIfSupports(
    "virtual_columns",
    "change table with explicit virtual generated column",
    async () => {
      await adapter.changeTable("virtual_columns", async (t) => {
        await t.virtual("incr_column1", { type: "integer", as: "column1 + 1", stored: false });
      });
      await reloadColumnInformation();
      const column = columnFor("incr_column1");
      expect(column.isVirtual()).toBe(true);
      expect(column.isVirtualStored()).toBe(false);
      expect((await take()).incr_column1).toBe(11);
    },
  );

  itIfSupports(
    "virtual_columns",
    "change table with implicit virtual generated column",
    async () => {
      await adapter.changeTable("virtual_columns", async (t) => {
        await t.virtual("sqr_column1", { type: "integer", as: "pow(column1, 2)" });
      });
      await reloadColumnInformation();
      const column = columnFor("sqr_column1");
      expect(column.isVirtual()).toBe(true);
      expect(column.isVirtualStored()).toBe(false);
      expect((await take()).sqr_column1).toBe(100);
    },
  );

  itIfSupports("virtual_columns", "schema dumping", async () => {
    const output = await SchemaDumper.dumpTableSchema(adapter, "virtual_columns");
    expect(output).toMatch(
      /t\.virtual\(\s*"upper_name",\s*\{\s*type:\s*"string",\s*as:\s*"UPPER\(name\)",\s*stored:\s*true\s*\}\s*\);/i,
    );
  });

  itIfSupports("virtual_columns", "build fixture sql", async () => {
    const created = await FixtureSet.createFixtures(
      adapter,
      VirtualColumn,
      virtualColumnFixtureData,
    );
    expect(Object.keys(created).length).toBe(2);
  });
});
