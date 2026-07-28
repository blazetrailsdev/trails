/**
 * Trails-only sibling of copy-table.test.ts (Rails
 * activerecord/test/cases/adapters/sqlite3/copy_table_test.rb).
 *
 * Everything here probes the SQLite table-rebuild helpers at a granularity no
 * Rails test reaches. Per-test reasons:
 *
 * - `tableStructureWithCollation` / `tableStructure`: private helpers Rails only
 *   drives through `copy_table`, so no Rails test asserts the AUTOINCREMENT flag
 *   or the missing-table error directly.
 * - `copyTableIndexes`: Rails' "copy table with index" only asserts the indexes
 *   survive; the partial-index WHERE clause, expression indexes and column
 *   orders are trails regressions with no Rails counterpart.
 * - `moveTable`: reached in Rails only as an `alter_table` implementation
 *   detail; no Rails test names it.
 * - `alterTable`: the foreign-key re-point (#5529) and the integer-like primary
 *   key shape are trails regressions. Rails' index-preserving column
 *   rename/removal *is* tested — migration/columns_test.rb
 *   `test_rename_column_with_an_index` / `test_remove_column_with_multi_column_index`
 *   — but that file is not ported yet, so the coverage stays here until it is.
 */
import { it, expect, beforeEach, afterEach } from "vitest";
import "../../index.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import type { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";

type Row = Record<string, unknown>;

// The table-rebuild helpers are private on the adapter; name their shapes here
// rather than reaching through `any`.
interface TableRebuildInternals {
  tableInfo(tableName: string): Promise<Row[]>;
  tableStructureWithCollation(tableName: string, basicStructure: Row[]): Promise<Row[]>;
  tableStructure(tableName: string): Promise<Row[]>;
  copyTable(from: string, to: string): Promise<void>;
  moveTable(from: string, to: string): Promise<void>;
  alterTable(
    tableName: string,
    block: undefined,
    foreignKeys: undefined,
    checkConstraints: undefined,
    options: { rename?: Record<string, string> },
  ): Promise<void>;
}

fixtures([]);

describeIfSqlite("SQLite3Adapter table-rebuild cluster", () => {
  let db: AbstractSQLite3Adapter;
  // Teardown-only handle. `db` stays non-optional for the test bodies, but the
  // teardown has to tolerate a beforeEach that failed before the lease, so it
  // reads a genuinely optional binding rather than casting `db`.
  let leased: AbstractSQLite3Adapter | undefined;
  const internals = (): TableRebuildInternals => db as unknown as TableRebuildInternals;

  const dropCopyTargets = async (): Promise<void> => {
    await leased?.exec(
      `DROP TABLE IF EXISTS customers2; DROP TABLE IF EXISTS customers3; DROP TABLE IF EXISTS books2; DROP TABLE IF EXISTS auto_id_tests2; DROP TABLE IF EXISTS "acustomers2"`,
    );
  };

  beforeEach(async () => {
    db = leased = Base.connection as AbstractSQLite3Adapter;
    await dropCopyTargets();
  });

  afterEach(dropCopyTargets);

  // --- tableStructureWithCollation ---

  it("tableStructureWithCollation extracts auto_increment flag", async () => {
    const basic = await internals().tableInfo("customers");
    const enriched = await internals().tableStructureWithCollation("customers", basic);
    const idCol = enriched.find((c) => c["name"] === "id");
    expect(idCol?.["auto_increment"]).toBe(true);
  });

  // --- tableStructure ---

  it("tableStructure throws StatementInvalid for non-existent table", async () => {
    await expect(internals().tableStructure("no_such")).rejects.toThrow(/Could not find table/);
  });

  // --- copyTableIndexes ---

  const copiedIndexSql = async (table: string, matching: string): Promise<string | undefined> => {
    const rows = (await db.execute(
      `SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='${table}'`,
    )) as Array<{ sql: string | null }>;
    return rows.find((row) => row.sql?.includes(matching))?.sql ?? undefined;
  };

  it("copyTableIndexes preserves partial index WHERE clause", async () => {
    await internals().copyTable("books", "books2");
    expect(await copiedIndexSql("books2", "isbn")).toMatch(
      /WHERE\s+published_on\s+IS\s+NOT\s+NULL/i,
    );
  });

  it("copyTableIndexes copies an expression index verbatim", async () => {
    await internals().copyTable("books", "books2");
    expect(await copiedIndexSql("books2", "lower")).toMatch(/lower\(external_id\)/i);
  });

  it("copyTableIndexes carries the index column orders across", async () => {
    // Rolled back with the fixture transaction; no teardown needed.
    await db.addIndex("customers", ["name"], { order: { name: "desc" } });
    await internals().copyTable("customers", "customers2");
    expect(await copiedIndexSql("customers2", "name")).toMatch(/"name"\s+DESC/i);
  });

  it("copyTable keeps a column's SQL function default", async () => {
    // Rails deserializes column.default and, when that is nil, substitutes
    // `-> { column.default_function }` before handing it to create_table
    // (sqlite3_adapter.rb:627-634). `auto_id_tests.published_at` is the
    // canonical `default: -> { "CURRENT_TIMESTAMP" }` column.
    await internals().copyTable("auto_id_tests", "auto_id_tests2");
    const copied = (await db.columns("auto_id_tests2")).find((c) => c.name === "published_at");
    expect(copied?.defaultFunction).toBe("CURRENT_TIMESTAMP");
  });

  // --- moveTable ---

  it("moveTable copies data to destination and drops source", async () => {
    await internals().copyTable("customers", "customers2");
    await db.executeMutation("INSERT INTO customers2 (name) VALUES ('Alice')");
    const sourceRows = await db.execute("SELECT * FROM customers2");
    await internals().moveTable("customers2", "customers3");
    const rows = (await db.execute("SELECT * FROM customers3")) as Row[];
    expect(rows).toHaveLength(sourceRows.length);
    expect(rows.map((r) => r["name"])).toContain("Alice");
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table'")) as Row[];
    expect(tables.map((t) => t["name"])).not.toContain("customers2");
  });

  // --- alterTable ---

  it("alterTable re-points a foreign key across a column rename", async () => {
    await internals().alterTable("fk_test_has_fk", undefined, undefined, undefined, {
      rename: { fk_id: "renamed_fk_id" },
    });
    const fks = await db.foreignKeys("fk_test_has_fk");
    expect(fks).toHaveLength(1);
    expect(fks[0].column).toBe("renamed_fk_id");
    expect(fks[0].toTable).toBe("fk_test_has_pk");
  });

  it("removeColumn keeps a multi-column index on the surviving columns", async () => {
    await db.addIndex("customers", ["name", "gps_location"], { unique: true });
    await db.removeColumn("customers", "gps_location");
    const indexes = (await db.indexes("customers")) as Array<{ name: string; columns: string[] }>;
    expect(indexes.map((i) => i.name)).toEqual(["index_customers_on_name_and_gps_location"]);
    expect(indexes[0].columns).toEqual(["name"]);
  });

  it("renameColumn renames the index whose name embeds the column", async () => {
    await db.addIndex("customers", ["name"]);
    await db.renameColumn("customers", "name", "nickname");
    const names = ((await db.indexes("customers")) as Array<{ name: string }>).map((i) => i.name);
    expect(names).toContain("index_customers_on_nickname");
    expect(names).not.toContain("index_customers_on_name");
  });

  it("alterTable keeps the primary key of a lowercase integer-like declared type", async () => {
    // PRAGMA table_info normalizes a declared `integer` to `INTEGER` but leaves
    // `bigint` verbatim, so hand-written DDL is the one way the rebuild sees an
    // AR-spelled integer-like type — the shape that makes newColumnDefinition
    // flip the column to :primary_key. No canonical table declares a `bigint`
    // primary key, so this table alone is laid down by hand, under the
    // `customers2` copy-target name the teardown above already reclaims.
    await db.exec('CREATE TABLE "customers2" ("id" bigint PRIMARY KEY, "name" TEXT)');
    await db.removeColumn("customers2", "name");
    const pk = (await internals().tableInfo("customers2")).filter((c) => Number(c["pk"]) > 0);
    expect(pk.map((c) => c["name"])).toEqual(["id"]);
  });
});
