/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/virtual_column_test.rb
 */
import { expect, beforeEach, afterEach } from "vitest";
import { describeIfSqlite } from "./test-helper.js";
import { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import type { Column } from "../../connection-adapters/sqlite3/column.js";
import { itIfSupports } from "../../test-helpers/supports.js";

let adapter: AbstractSQLite3Adapter;

// Rails setup: @connection.create_table :virtual_columns, force: true —
// the raw DDL below is what that create_table emits on SQLite.
beforeEach(async () => {
  adapter = new BetterSQLite3Adapter(":memory:");
  await adapter.exec(
    `CREATE TABLE "virtual_columns" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar, "upper_name" varchar GENERATED ALWAYS AS (UPPER(name)) STORED, "lower_name" varchar GENERATED ALWAYS AS (LOWER(name)) VIRTUAL, "octet_name" integer GENERATED ALWAYS AS (LENGTH(name)) VIRTUAL, "mutated_name" varchar GENERATED ALWAYS AS (REPLACE(name, 'l', 'L')) VIRTUAL, "column1" integer)`,
  );
  // Rails setup: VirtualColumn.create(name: "Rails", column1: 10)
  await adapter.executeMutation(
    `INSERT INTO "virtual_columns" ("name", "column1") VALUES ('Rails', 10)`,
  );
});

afterEach(async () => {
  // Rails teardown: @connection.drop_table :virtual_columns, if_exists: true
  await adapter.exec(`DROP TABLE IF EXISTS "virtual_columns"`).catch(() => undefined);
  await adapter.close();
});

async function columnsHash(): Promise<Record<string, Column>> {
  const hash: Record<string, Column> = {};
  for (const col of await adapter.columns("virtual_columns")) {
    hash[col.name] = col as Column;
  }
  return hash;
}

// -- Rails test class: virtual_column_test.rb --
describeIfSqlite("SQLite3VirtualColumnTest", () => {
  itIfSupports("virtual_columns", "stored column", async () => {
    const column = (await columnsHash())["upper_name"];
    expect(column.isVirtual()).toBe(true);
    expect(column.isVirtualStored()).toBe(true);
    const rows = await adapter.execute(`SELECT "upper_name" FROM "virtual_columns" LIMIT 1`);
    expect(rows[0].upper_name).toBe("RAILS");
  });

  itIfSupports("virtual_columns", "explicit virtual column", async () => {
    const column = (await columnsHash())["lower_name"];
    expect(column.isVirtual()).toBe(true);
    expect(column.isVirtualStored()).toBe(false);
    const rows = await adapter.execute(`SELECT "lower_name" FROM "virtual_columns" LIMIT 1`);
    expect(rows[0].lower_name).toBe("rails");
  });

  itIfSupports("virtual_columns", "implicit virtual column", async () => {
    const column = (await columnsHash())["octet_name"];
    expect(column.isVirtual()).toBe(true);
    expect(column.isVirtualStored()).toBe(false);
    const rows = await adapter.execute(`SELECT "octet_name" FROM "virtual_columns" LIMIT 1`);
    expect(rows[0].octet_name).toBe(5);
  });

  itIfSupports("virtual_columns", "virtual column with comma in definition", async () => {
    const column = (await columnsHash())["mutated_name"];
    expect(column.isVirtual()).toBe(true);
    expect(column.isVirtualStored()).toBe(false);
    expect(column.defaultFunction).not.toBeNull();
    const rows = await adapter.execute(`SELECT "mutated_name" FROM "virtual_columns" LIMIT 1`);
    expect(rows[0].mutated_name).toBe("RaiLs");
  });

  itIfSupports("virtual_columns", "change table with stored generated column", async () => {
    await adapter.changeTable("virtual_columns", async (t) => {
      await t.virtual("decr_column1", { type: "integer", as: "column1 - 1", stored: true });
    });
    const column = (await columnsHash())["decr_column1"];
    expect(column.isVirtual()).toBe(true);
    expect(column.isVirtualStored()).toBe(true);
    const rows = await adapter.execute(`SELECT "decr_column1" FROM "virtual_columns" LIMIT 1`);
    expect(rows[0].decr_column1).toBe(9);
  });

  itIfSupports(
    "virtual_columns",
    "change table with explicit virtual generated column",
    async () => {
      await adapter.changeTable("virtual_columns", async (t) => {
        await t.virtual("incr_column1", { type: "integer", as: "column1 + 1", stored: false });
      });
      const column = (await columnsHash())["incr_column1"];
      expect(column.isVirtual()).toBe(true);
      expect(column.isVirtualStored()).toBe(false);
      const rows = await adapter.execute(`SELECT "incr_column1" FROM "virtual_columns" LIMIT 1`);
      expect(rows[0].incr_column1).toBe(11);
    },
  );

  itIfSupports(
    "virtual_columns",
    "change table with implicit virtual generated column",
    async () => {
      await adapter.changeTable("virtual_columns", async (t) => {
        await t.virtual("sqr_column1", { type: "integer", as: "pow(column1, 2)" });
      });
      const column = (await columnsHash())["sqr_column1"];
      expect(column.isVirtual()).toBe(true);
      expect(column.isVirtualStored()).toBe(false);
      const rows = await adapter.execute(`SELECT "sqr_column1" FROM "virtual_columns" LIMIT 1`);
      expect(rows[0].sqr_column1).toBe(100);
    },
  );

  // null-overridden: needs model layer / schema dump / fixture infrastructure
  // it.skip("virtual column with full inserts", () => {});
  // it.skip("schema dumping", () => {});
  // it.skip("build fixture sql", () => {});
});

// -- Rails test class: virtual_table_test.rb --
// All tests null-overridden (needs schema dump/load infrastructure)
