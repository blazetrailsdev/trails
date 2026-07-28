import { it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import { fixtures } from "../test-fixtures.js";
import { describeIfSqlite } from "../support/describe-if-sqlite.js";
import type { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";

fixtures([]);

describeIfSqlite("SQLite3Adapter table-rebuild cluster", () => {
  let db: AbstractSQLite3Adapter;
  // Teardown-only handle. `db` stays non-optional for the test bodies, but the
  // teardown has to tolerate a beforeEach that failed before the lease, so it
  // reads a genuinely optional binding rather than casting `db`.
  let leased: AbstractSQLite3Adapter | undefined;

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

  // --- tableStructureSql ---

  it("tableStructureSql returns column definition strings from CREATE TABLE SQL", async () => {
    const strings = await (db as any).tableStructureSql("customers", ["id", "name"]);
    expect(strings).toHaveLength(2);
    expect(strings[0]).toMatch(/"id"/);
    expect(strings[1]).toMatch(/"name"/);
  });

  it("tableStructureSql returns empty array for non-existent table", async () => {
    const strings = await (db as any).tableStructureSql("no_such_table");
    expect(strings).toEqual([]);
  });

  it("tableStructureSql includes CONSTRAINT strings", async () => {
    const strings = await (db as any).tableStructureSql("fk_test_has_fk", ["id", "fk_id"]);
    expect(strings.some((s: string) => s.includes("CONSTRAINT"))).toBe(true);
  });

  // --- tableStructureWithCollation ---

  it("tableStructureWithCollation extracts auto_increment flag", async () => {
    const basic = await (db as any).tableInfo("customers");
    const enriched = await (db as any).tableStructureWithCollation("customers", basic);
    const idCol = enriched.find((c: any) => c.name === "id");
    expect(idCol.auto_increment).toBe(true);
  });

  // --- tableStructure ---

  it("tableStructure throws StatementInvalid for non-existent table", async () => {
    await expect((db as any).tableStructure("no_such")).rejects.toThrow(/Could not find table/);
  });

  // --- copyTableIndexes ---

  const copiedIndexSql = async (table: string, matching: string): Promise<string | undefined> => {
    const rows = (await db.execute(
      `SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='${table}'`,
    )) as Array<{ sql: string | null }>;
    return rows.find((row) => row.sql?.includes(matching))?.sql ?? undefined;
  };

  it("copyTableIndexes preserves partial index WHERE clause", async () => {
    await (db as any).copyTable("books", "books2");
    expect(await copiedIndexSql("books2", "isbn")).toMatch(
      /WHERE\s+published_on\s+IS\s+NOT\s+NULL/i,
    );
  });

  it("copyTableIndexes copies an expression index verbatim", async () => {
    await (db as any).copyTable("books", "books2");
    expect(await copiedIndexSql("books2", "lower")).toMatch(/lower\(external_id\)/i);
  });

  it("copyTableIndexes carries the index column orders across", async () => {
    // Rolled back with the fixture transaction; no teardown needed.
    await db.addIndex("customers", ["name"], { order: { name: "desc" } });
    await (db as any).copyTable("customers", "customers2");
    expect(await copiedIndexSql("customers2", "name")).toMatch(/"name"\s+DESC/i);
  });

  it("copyTable keeps a column's SQL function default", async () => {
    // Rails deserializes column.default and, when that is nil, substitutes
    // `-> { column.default_function }` before handing it to create_table
    // (sqlite3_adapter.rb:627-634). `auto_id_tests.published_at` is the
    // canonical `default: -> { "CURRENT_TIMESTAMP" }` column.
    await (db as any).copyTable("auto_id_tests", "auto_id_tests2");
    const copied = (await db.columns("auto_id_tests2")).find((c) => c.name === "published_at");
    expect(copied?.defaultFunction).toBe("CURRENT_TIMESTAMP");
  });

  // --- moveTable ---

  it("moveTable copies data to destination and drops source", async () => {
    await (db as any).copyTable("customers", "customers2");
    await db.executeMutation("INSERT INTO customers2 (name) VALUES ('Alice')");
    const sourceRows = await db.execute("SELECT * FROM customers2");
    await (db as any).moveTable("customers2", "customers3");
    const rows = await db.execute("SELECT * FROM customers3");
    expect(rows).toHaveLength(sourceRows.length);
    expect(rows.map((r: any) => r.name)).toContain("Alice");
    const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
    expect(tables.map((t: any) => t.name)).not.toContain("customers2");
  });

  // --- alterTable ---

  it("alterTable re-points a foreign key across a column rename", async () => {
    await (db as any).alterTable("fk_test_has_fk", undefined, undefined, undefined, {
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
    const pk = (await (db as any).tableInfo("customers2")).filter((c: any) => Number(c.pk) > 0);
    expect(pk.map((c: any) => c.name)).toEqual(["id"]);
  });
});
