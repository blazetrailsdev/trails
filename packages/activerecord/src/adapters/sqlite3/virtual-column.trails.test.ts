import { it, expect, beforeEach, afterEach } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "./test-helper.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-helpers/fixtures.js";
import type { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import type { Column } from "../../connection-adapters/sqlite3/column.js";

let adapter: AbstractSQLite3Adapter;

// TS-only regression coverage: Rails' alter_table rebuilds from columns(from)
// and re-adds generated columns with as:/stored: (sqlite3_adapter.rb:623),
// but PRAGMA table_info hides them — a table_info-sourced rebuild silently
// drops every pre-existing generated column.
describeIfSqlite("SQLite3VirtualColumnTest trails extras", () => {
  fixtures([]);

  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as unknown as AbstractSQLite3Adapter;
    await adapter.dropTable("virtual_columns", { ifExists: true });
    await adapter.exec(
      `CREATE TABLE "virtual_columns" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar, "upper_name" varchar GENERATED ALWAYS AS (UPPER(name)) STORED, "lower_name" varchar GENERATED ALWAYS AS (LOWER(name)) VIRTUAL, "column1" integer)`,
    );
    await adapter.executeMutation(
      `INSERT INTO "virtual_columns" ("name", "column1") VALUES ('Rails', 10)`,
    );
  });

  afterEach(async () => {
    await adapter.dropTable("virtual_columns", { ifExists: true });
  });

  it("alter-table rebuild preserves pre-existing generated columns", async () => {
    await adapter.changeTable("virtual_columns", async (t) => {
      await t.virtual("decr_column1", { type: "integer", as: "column1 - 1", stored: true });
    });

    const columns = (await adapter.columns("virtual_columns")) as Column[];
    const names = columns.map((c) => c.name);
    expect(names).toEqual(["id", "name", "upper_name", "lower_name", "column1", "decr_column1"]);

    const upperName = columns.find((c) => c.name === "upper_name")!;
    expect(upperName.isVirtualStored()).toBe(true);
    const lowerName = columns.find((c) => c.name === "lower_name")!;
    expect(lowerName.isVirtual()).toBe(true);
    expect(lowerName.isVirtualStored()).toBe(false);

    const rows = await adapter.execute(
      `SELECT "upper_name", "lower_name", "decr_column1" FROM "virtual_columns"`,
    );
    expect(rows).toEqual([{ upper_name: "RAILS", lower_name: "rails", decr_column1: 9 }]);
  });

  it("remove column preserves generated columns", async () => {
    await adapter.removeColumn("virtual_columns", "column1");

    const columns = (await adapter.columns("virtual_columns")) as Column[];
    expect(columns.map((c) => c.name)).toEqual(["id", "name", "upper_name", "lower_name"]);
    const rows = await adapter.execute(`SELECT "upper_name", "lower_name" FROM "virtual_columns"`);
    expect(rows).toEqual([{ upper_name: "RAILS", lower_name: "rails" }]);
  });
});
