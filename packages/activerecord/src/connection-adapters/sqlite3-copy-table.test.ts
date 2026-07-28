import { it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { describeIfSqlite } from "../adapters/sqlite3/test-helper.js";
import type { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";

// The rebuild helpers are DDL, so the suite cannot run inside the fixture
// transaction. Sources are canonical tables read-only; every table this file
// writes is a `<canonical>2`/`<canonical>3` copy target (the naming Rails'
// copy_table_test.rb uses) that the drop below reclaims.
fixtures([], { useTransactionalTests: false });

describeIfSqlite("SQLite3Adapter table-rebuild cluster", () => {
  let db: AbstractSQLite3Adapter;

  // The ambient connection is a shared worker DB, so the copy targets are
  // cleared on the way in as well as out: a hard-killed run must not wedge the
  // next one. `_alter_tmp_customers2` is alterTable's rebuild scratch table
  // (sqlite3-adapter.ts `_alter_tmp_${bareTable}`), which it only drops on the
  // success path — a mid-rebuild failure leaves it behind.
  const dropCopyTargets = async (): Promise<void> => {
    // Guarded so a beforeEach that fails before the lease surfaces its own
    // error rather than a TypeError on `undefined.exec` from this teardown.
    const conn = db as AbstractSQLite3Adapter | undefined;
    if (!conn) return;
    await conn.exec(
      `DROP TABLE IF EXISTS customers2; DROP TABLE IF EXISTS customers3; DROP TABLE IF EXISTS books2; DROP TABLE IF EXISTS "_alter_tmp_customers2"`,
    );
  };

  beforeEach(async () => {
    db = Base.connection as AbstractSQLite3Adapter;
    await dropCopyTargets();
  });

  afterEach(dropCopyTargets);

  // --- tableStructureSql ---

  it("tableStructureSql returns column definition strings from CREATE TABLE SQL", async () => {
    // The splitter only breaks before the named columns, so `customers`' seven
    // columns yield two strings: `id`, and `name` plus the trailing remainder.
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
    // `fk_test_has_fk` is the canonical table whose CREATE TABLE carries a named
    // FOREIGN KEY constraint (schema.rb: fk_name → fk_test_has_pk.pk_id).
    const strings = await (db as any).tableStructureSql("fk_test_has_fk", ["id", "fk_id"]);
    expect(strings.some((s: string) => s.includes("CONSTRAINT"))).toBe(true);
  });

  // --- tableStructureWithCollation ---

  it("tableStructureWithCollation extracts auto_increment flag", async () => {
    // Rails' SQLite primary key is `integer PRIMARY KEY AUTOINCREMENT NOT NULL`,
    // so any canonical table exercises the AUTOINCREMENT branch. (The COLLATE
    // branch is covered by the Rails port at adapters/sqlite3/collation.test.ts.)
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

  it("copyTableIndexes preserves partial index WHERE clause", async () => {
    // `books` carries schema.rb's unique partial index on `isbn`
    // (`WHERE published_on IS NOT NULL`); its generated name embeds the source
    // table, so the copy is renamed to index_books2_on_isbn — no collision.
    await (db as any).copyTable("books", "books2");
    const idxSql = (
      await db.execute("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='books2'")
    ).find((row: any) => typeof row["sql"] === "string" && row["sql"].includes("isbn")) as
      | { sql: string }
      | undefined;
    expect(idxSql?.sql).toMatch(/WHERE\s+published_on\s+IS\s+NOT\s+NULL/i);
  });

  // --- moveTable ---

  it("moveTable copies data to destination and drops source", async () => {
    await (db as any).copyTable("customers", "customers2");
    await db.executeMutation("INSERT INTO customers2 (name) VALUES ('Alice')");
    await (db as any).moveTable("customers2", "customers3");
    const rows = await db.execute("SELECT * FROM customers3");
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).name).toBe("Alice");
    const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
    expect(tables.map((t: any) => t.name)).not.toContain("customers2");
  });

  // --- alterTable ---

  it("alterTable keeps the primary key of a lowercase integer-like declared type", async () => {
    // PRAGMA table_info normalizes a declared `integer` to `INTEGER` but leaves
    // `bigint` verbatim, so hand-written DDL is the one way the rebuild sees an
    // AR-spelled integer-like type — the shape that makes newColumnDefinition
    // flip the column to :primary_key, where the constraint rides entirely on
    // type_to_sql(:primary_key). No canonical table declares a `bigint` primary
    // key, so this one table is laid down by hand; it reuses the `customers2`
    // copy-target name rather than inventing a table.

    await db.exec('CREATE TABLE "customers2" ("id" bigint PRIMARY KEY, "name" TEXT)');
    await db.removeColumn("customers2", "name");
    const pk = (await (db as any).tableInfo("customers2")).filter((c: any) => Number(c.pk) > 0);
    expect(pk.map((c: any) => c.name)).toEqual(["id"]);
  });
});
