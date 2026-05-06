import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ColumnInfo, SqliteDriver } from "./driver.js";
import { betterSqlite3DriverFactory } from "./drivers/better-sqlite3.js";

describe("SqliteDriver — better-sqlite3 round-trip", () => {
  let driver: SqliteDriver;

  beforeAll(async () => {
    driver = await betterSqlite3DriverFactory.open({ database: ":memory:" });
    const stmt = await driver.prepare(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL, qty INTEGER)",
    );
    await stmt.run();
  });

  afterAll(async () => {
    await driver.close();
  });

  it("inserts and retrieves a row", async () => {
    const insert = await driver.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    const result = await insert.run("sprocket", 42);
    expect(result.changes).toBe(1);
    expect(
      typeof result.lastInsertRowid === "number" || typeof result.lastInsertRowid === "bigint",
    ).toBe(true);

    const select = await driver.prepare("SELECT id, name, qty FROM widgets WHERE name = ?");
    const row = (await select.get("sprocket")) as Record<string, unknown>;
    expect(row["name"]).toBe("sprocket");
    expect(row["qty"]).toBe(42);
  });

  it("returns all rows", async () => {
    const insert = await driver.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    await insert.run("gear", 7);

    const select = await driver.prepare("SELECT id, name, qty FROM widgets ORDER BY id");
    const rows = (await select.all()) as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("columns() matches ColumnInfo shape", async () => {
    const stmt = await driver.prepare("SELECT id, name, qty FROM widgets");
    const cols: ColumnInfo[] = stmt.columns();
    expect(cols.length).toBe(3);
    for (const col of cols) {
      expect(typeof col.name).toBe("string");
      expect(col.column === null || typeof col.column === "string").toBe(true);
      expect(col.table === null || typeof col.table === "string").toBe(true);
      expect(col.database === null || typeof col.database === "string").toBe(true);
      expect(col.type === null || typeof col.type === "string").toBe(true);
    }
    expect(cols[0]!.name).toBe("id");
    expect(cols[1]!.name).toBe("name");
    expect(cols[2]!.name).toBe("qty");
  });

  it("setReadBigInts enables bigint returns", async () => {
    const stmt = await driver.prepare("SELECT qty FROM widgets WHERE name = ?");
    stmt.setReadBigInts(true);
    const row = (await stmt.get("sprocket")) as Record<string, unknown>;
    expect(typeof row["qty"]).toBe("bigint");
  });

  it("exec runs SQL", async () => {
    await driver.exec("CREATE TABLE IF NOT EXISTS tmp_exec (x INTEGER)");
    await driver.exec("DROP TABLE tmp_exec");
  });

  it("pragma returns a value", async () => {
    const result = await driver.pragma("journal_mode");
    expect(result).toBeDefined();
  });

  it("driver.open is true while connected", () => {
    expect(driver.open).toBe(true);
  });

  it("statement.reader is true for SELECT, false for INSERT", async () => {
    const sel = await driver.prepare("SELECT 1");
    expect(sel.reader).toBe(true);

    const ins = await driver.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    expect(ins.reader).toBe(false);
  });
});
