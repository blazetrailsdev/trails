import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

describe("SQLite3Adapter table-rebuild cluster", () => {
  let db: SQLite3Adapter;

  beforeEach(() => {
    db = new SQLite3Adapter(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  // --- tableStructureSql ---

  it("tableStructureSql returns column definition strings from CREATE TABLE SQL", () => {
    db.exec('CREATE TABLE "users" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL)');
    const strings = (db as any).tableStructureSql("users", ["id", "name"]);
    expect(strings).toHaveLength(2);
    expect(strings[0]).toMatch(/"id"/);
    expect(strings[1]).toMatch(/"name"/);
  });

  it("tableStructureSql returns empty array for non-existent table", () => {
    const strings = (db as any).tableStructureSql("no_such_table");
    expect(strings).toEqual([]);
  });

  it("tableStructureSql includes CONSTRAINT strings", () => {
    db.exec(
      'CREATE TABLE "orders" ("id" INTEGER PRIMARY KEY, "user_id" INTEGER, CONSTRAINT "fk_user" FOREIGN KEY("user_id") REFERENCES "users"("id"))',
    );
    const strings = (db as any).tableStructureSql("orders", ["id", "user_id"]);
    expect(strings.some((s: string) => s.includes("CONSTRAINT"))).toBe(true);
  });

  // --- tableStructureWithCollation ---

  it("tableStructureWithCollation extracts collation from CREATE TABLE SQL", () => {
    db.exec('CREATE TABLE "users" ("id" INTEGER PRIMARY KEY, "name" TEXT COLLATE "NOCASE")');
    const basic = [
      { name: "id", type: "INTEGER", notnull: 0, dflt_value: null, pk: 1 },
      { name: "name", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ];
    const enriched = (db as any).tableStructureWithCollation("users", basic);
    const nameCol = enriched.find((c: any) => c.name === "name");
    expect(nameCol.collation).toBe("NOCASE");
  });

  it("tableStructureWithCollation extracts auto_increment flag", () => {
    db.exec('CREATE TABLE "users" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT)');
    const basic = [
      { name: "id", type: "INTEGER", notnull: 0, dflt_value: null, pk: 1 },
      { name: "name", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ];
    const enriched = (db as any).tableStructureWithCollation("users", basic);
    const idCol = enriched.find((c: any) => c.name === "id");
    expect(idCol.auto_increment).toBe(true);
  });

  // --- tableInfo ---

  it("tableInfo returns PRAGMA table_info rows", async () => {
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    const info = await (db as any).tableInfo("users");
    expect(info).toHaveLength(2);
    expect(info[0].name).toBe("id");
  });

  // --- tableStructure ---

  it("tableStructure returns enriched column info", async () => {
    db.exec('CREATE TABLE "users" ("id" INTEGER PRIMARY KEY, "name" TEXT COLLATE "NOCASE")');
    const structure = await (db as any).tableStructure("users");
    expect(structure).toHaveLength(2);
    const nameCol = structure.find((c: any) => c.name === "name");
    expect(nameCol.collation).toBe("NOCASE");
  });

  it("tableStructure throws StatementInvalid for non-existent table", async () => {
    await expect((db as any).tableStructure("no_such")).rejects.toThrow(/Could not find table/);
  });

  // --- copyTableContents ---

  it("copyTableContents copies rows from source to destination", async () => {
    db.exec("CREATE TABLE src (id INTEGER, name TEXT)");
    db.exec("CREATE TABLE dst (id INTEGER, name TEXT)");
    db.exec("INSERT INTO src VALUES (1, 'Alice'), (2, 'Bob')");
    await (db as any).copyTableContents("src", "dst", ["id", "name"]);
    const rows = (db.raw as import("better-sqlite3").Database)
      .prepare("SELECT * FROM dst ORDER BY id")
      .all();
    expect(rows).toHaveLength(2);
    expect((rows[0] as any).name).toBe("Alice");
  });

  it("copyTableContents respects column rename mapping", async () => {
    db.exec("CREATE TABLE src (id INTEGER, old_name TEXT)");
    db.exec("CREATE TABLE dst (id INTEGER, new_name TEXT)");
    db.exec("INSERT INTO src VALUES (1, 'Alice')");
    // rename: {srcCol: destCol} = {old_name: new_name}
    await (db as any).copyTableContents("src", "dst", ["id", "new_name"], {
      old_name: "new_name",
    });
    const rows = (db.raw as import("better-sqlite3").Database).prepare("SELECT * FROM dst").all();
    expect((rows[0] as any).new_name).toBe("Alice");
  });

  // --- copyTableIndexes ---

  it("copyTableIndexes recreates indexes on destination table", async () => {
    db.exec("CREATE TABLE src (id INTEGER, email TEXT)");
    db.exec("CREATE UNIQUE INDEX index_src_on_email ON src (email)");
    db.exec("CREATE TABLE dst (id INTEGER, email TEXT)");
    await (db as any).copyTableIndexes("src", "dst");
    const idxList = (db.raw as import("better-sqlite3").Database)
      .prepare("PRAGMA index_list(dst)")
      .all() as any[];
    expect(idxList.length).toBeGreaterThan(0);
    expect(idxList[0].unique).toBe(1);
  });

  it("copyTableIndexes preserves partial index WHERE clause", async () => {
    db.exec("CREATE TABLE src (id INTEGER, active INTEGER, email TEXT)");
    db.exec("CREATE UNIQUE INDEX index_src_on_email_active ON src (email) WHERE active = 1");
    db.exec("CREATE TABLE dst (id INTEGER, active INTEGER, email TEXT)");
    await (db as any).copyTableIndexes("src", "dst");
    const idxSql = (db.raw as import("better-sqlite3").Database)
      .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='dst'")
      .get() as { sql: string } | undefined;
    expect(idxSql?.sql).toMatch(/WHERE\s+active\s*=\s*1/i);
  });

  // --- copyTable ---

  it("copyTable creates destination with same schema and data", async () => {
    db.exec("CREATE TABLE src (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
    db.exec("INSERT INTO src VALUES (1, 'Alice')");
    await (db as any).copyTable("src", "dst");
    const rows = (db.raw as import("better-sqlite3").Database).prepare("SELECT * FROM dst").all();
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).name).toBe("Alice");
  });

  it("copyTable renames columns when options.rename is provided", async () => {
    db.exec("CREATE TABLE src (id INTEGER, old_col TEXT)");
    db.exec("INSERT INTO src VALUES (1, 'hello')");
    await (db as any).copyTable("src", "dst", { rename: { old_col: "new_col" } });
    const cols = (db.raw as import("better-sqlite3").Database)
      .prepare("PRAGMA table_info(dst)")
      .all() as any[];
    expect(cols.map((c: any) => c.name)).toContain("new_col");
    const rows = (db.raw as import("better-sqlite3").Database).prepare("SELECT * FROM dst").all();
    expect((rows[0] as any).new_col).toBe("hello");
  });

  // --- moveTable ---

  it("moveTable copies data to destination and drops source", async () => {
    db.exec("CREATE TABLE src (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO src VALUES (1, 'Alice')");
    await (db as any).moveTable("src", "dst");
    const rows = (db.raw as import("better-sqlite3").Database).prepare("SELECT * FROM dst").all();
    expect(rows).toHaveLength(1);
    const tables = (db.raw as import("better-sqlite3").Database)
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as any[];
    expect(tables.map((t: any) => t.name)).not.toContain("src");
  });
});
