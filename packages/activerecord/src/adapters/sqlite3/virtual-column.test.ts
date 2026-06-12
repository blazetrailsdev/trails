/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/virtual_column_test.rb
 */
import { expect, beforeEach, afterEach } from "vitest";
import { describeIfSqlite } from "./test-helper.js";
import { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";
import { itIfSupports } from "../../test-helpers/supports.js";

let adapter: AbstractSQLite3Adapter;

beforeEach(() => {
  adapter = new BetterSQLite3Adapter(":memory:");
});

afterEach(() => {
  adapter.close();
});

// -- Rails test class: virtual_column_test.rb --
describeIfSqlite("SQLite3VirtualColumnTest", () => {
  itIfSupports("virtual_columns", "stored column", async () => {
    adapter.exec(
      `CREATE TABLE "stored_gen" ("id" INTEGER PRIMARY KEY, "price" INTEGER, "tax" INTEGER, "total" INTEGER GENERATED ALWAYS AS ("price" + "tax") STORED)`,
    );
    await adapter.executeMutation(`INSERT INTO "stored_gen" ("price", "tax") VALUES (100, 10)`);
    const rows = await adapter.execute(`SELECT "total" FROM "stored_gen"`);
    expect(rows[0].total).toBe(110);
  });

  itIfSupports("virtual_columns", "explicit virtual column", async () => {
    adapter.exec(
      `CREATE TABLE "virt_gen" ("id" INTEGER PRIMARY KEY, "first" TEXT, "last" TEXT, "full" TEXT GENERATED ALWAYS AS ("first" || ' ' || "last") VIRTUAL)`,
    );
    await adapter.executeMutation(
      `INSERT INTO "virt_gen" ("first", "last") VALUES ('Alice', 'Smith')`,
    );
    const rows = await adapter.execute(`SELECT "full" FROM "virt_gen"`);
    expect(rows[0].full).toBe("Alice Smith");
  });

  itIfSupports("virtual_columns", "implicit virtual column", async () => {
    // Without STORED keyword, generated columns are virtual by default
    adapter.exec(
      `CREATE TABLE "impl_virt" ("id" INTEGER PRIMARY KEY, "a" INTEGER, "b" INTEGER, "c" INTEGER GENERATED ALWAYS AS ("a" + "b"))`,
    );
    await adapter.executeMutation(`INSERT INTO "impl_virt" ("a", "b") VALUES (3, 4)`);
    const rows = await adapter.execute(`SELECT "c" FROM "impl_virt"`);
    expect(rows[0].c).toBe(7);
  });

  itIfSupports("virtual_columns", "virtual column with comma in definition", async () => {
    adapter.exec(
      `CREATE TABLE "virt_comma" ("id" INTEGER PRIMARY KEY, "x" INTEGER, "y" INTEGER, "label" TEXT GENERATED ALWAYS AS (CAST("x" AS TEXT) || ',' || CAST("y" AS TEXT)) VIRTUAL)`,
    );
    await adapter.executeMutation(`INSERT INTO "virt_comma" ("x", "y") VALUES (1, 2)`);
    const rows = await adapter.execute(`SELECT "label" FROM "virt_comma"`);
    expect(rows[0].label).toBe("1,2");
  });

  itIfSupports("virtual_columns", "change table with stored generated column", async () => {
    adapter.exec(`CREATE TABLE "chg_stored" ("id" INTEGER PRIMARY KEY, "x" INTEGER, "y" INTEGER)`);
    // SQLite 3.31+ supports ADD COLUMN with generated
    adapter.exec(
      `ALTER TABLE "chg_stored" ADD COLUMN "total" INTEGER GENERATED ALWAYS AS ("x" + "y") STORED`,
    );
    await adapter.executeMutation(`INSERT INTO "chg_stored" ("x", "y") VALUES (5, 3)`);
    const rows = await adapter.execute(`SELECT "total" FROM "chg_stored"`);
    expect(rows[0].total).toBe(8);
  });

  itIfSupports(
    "virtual_columns",
    "change table with explicit virtual generated column",
    async () => {
      adapter.exec(`CREATE TABLE "chg_virt" ("id" INTEGER PRIMARY KEY, "first" TEXT, "last" TEXT)`);
      adapter.exec(
        `ALTER TABLE "chg_virt" ADD COLUMN "full" TEXT GENERATED ALWAYS AS ("first" || ' ' || "last") VIRTUAL`,
      );
      await adapter.executeMutation(
        `INSERT INTO "chg_virt" ("first", "last") VALUES ('John', 'Doe')`,
      );
      const rows = await adapter.execute(`SELECT "full" FROM "chg_virt"`);
      expect(rows[0].full).toBe("John Doe");
    },
  );

  itIfSupports(
    "virtual_columns",
    "change table with implicit virtual generated column",
    async () => {
      adapter.exec(`CREATE TABLE "chg_impl" ("id" INTEGER PRIMARY KEY, "a" INTEGER, "b" INTEGER)`);
      adapter.exec(`ALTER TABLE "chg_impl" ADD COLUMN "c" INTEGER GENERATED ALWAYS AS ("a" * "b")`);
      await adapter.executeMutation(`INSERT INTO "chg_impl" ("a", "b") VALUES (4, 5)`);
      const rows = await adapter.execute(`SELECT "c" FROM "chg_impl"`);
      expect(rows[0].c).toBe(20);
    },
  );

  // null-overridden: needs schema dump/load infrastructure
  // it.skip("schema dumping", () => {});
  // it.skip("build fixture sql", () => {});
});

// -- Rails test class: virtual_table_test.rb --
// All tests null-overridden (needs schema dump/load infrastructure)
