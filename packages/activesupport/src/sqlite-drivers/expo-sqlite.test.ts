import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SqliteConnection } from "../sqlite-adapter.js";
import { isExpoSqliteAvailable, expoSqliteDriver } from "./expo-sqlite.js";

describe.skipIf(!isExpoSqliteAvailable)("SqliteDriver — expo-sqlite round-trip", () => {
  let conn: SqliteConnection;

  beforeAll(async () => {
    conn = await expoSqliteDriver.open({ database: ":memory:" });
    await conn.exec(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL, qty INTEGER)",
    );
    const insert = await conn.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    await insert.run(["sprocket", 42]);
    await insert.run(["gear", 7]);
  });

  afterAll(async () => {
    await conn.close();
  });

  it("retrieves a row by name", async () => {
    const select = await conn.prepare("SELECT id, name, qty FROM widgets WHERE name = ?");
    const row = (await select.get(["sprocket"])) as Record<string, unknown>;
    expect(row["name"]).toBe("sprocket");
    expect(row["qty"]).toBe(42);
  });

  it("run() returns changes and lastInsertRowid", async () => {
    const insert = await conn.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    const result = await insert.run(["bolt", 99]);
    expect(result.changes).toBe(1);
    expect(
      typeof result.lastInsertRowid === "number" || typeof result.lastInsertRowid === "bigint",
    ).toBe(true);
  });

  it("returns all rows", async () => {
    const select = await conn.prepare("SELECT id, name, qty FROM widgets ORDER BY id");
    const rows = (await select.all()) as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const names = rows.map((r) => r["name"]);
    expect(names).toContain("sprocket");
    expect(names).toContain("gear");
  });

  it("iterate() yields rows incrementally", async () => {
    const select = await conn.prepare("SELECT id, name FROM widgets ORDER BY id");
    const collected: unknown[] = [];
    for await (const row of select.iterate() as AsyncIterable<unknown>) collected.push(row);
    expect(collected.length).toBeGreaterThanOrEqual(2);
  });

  it("named binds work as a single object", async () => {
    const select = await conn.prepare("SELECT qty FROM widgets WHERE name = $name");
    const row = (await select.get({ name: "sprocket" })) as Record<string, unknown>;
    expect(row["qty"]).toBe(42);
  });

  it("exec runs multi-statement SQL", async () => {
    await conn.exec("CREATE TABLE IF NOT EXISTS tmp_exec (x INTEGER)");
    await conn.exec("DROP TABLE tmp_exec");
  });

  it("pragma read returns a value", async () => {
    const result = await conn.pragma("journal_mode");
    expect(result).toBeDefined();
  });

  it("write pragma does not throw and returns []", async () => {
    expect(await conn.pragma("foreign_keys = ON")).toEqual([]);
  });

  it("isOpen() is true while connected", () => {
    expect(conn.isOpen()).toBe(true);
  });

  it("statement.reader is true for SELECT/PRAGMA reads, false for writes", async () => {
    expect((await conn.prepare("SELECT 1")).reader).toBe(true);
    expect((await conn.prepare("PRAGMA journal_mode")).reader).toBe(true);
    expect((await conn.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)")).reader).toBe(
      false,
    );
    expect((await conn.prepare("PRAGMA foreign_keys = ON")).reader).toBe(false);
  });

  it("transaction: BEGIN → INSERT → COMMIT → row visible", async () => {
    await conn.exec("BEGIN IMMEDIATE");
    const insert = await conn.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)");
    await insert.run(["txn-widget", 1]);
    await conn.exec("COMMIT");
    const select = await conn.prepare("SELECT qty FROM widgets WHERE name = ?");
    const row = (await select.get(["txn-widget"])) as Record<string, unknown>;
    expect(row["qty"]).toBe(1);
  });

  it("foreign key enforcement works after PRAGMA foreign_keys = ON", async () => {
    await conn.exec("PRAGMA foreign_keys = ON");
    await conn.exec("CREATE TABLE IF NOT EXISTS fk_parent (id INTEGER PRIMARY KEY)");
    await conn.exec(
      "CREATE TABLE IF NOT EXISTS fk_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES fk_parent(id))",
    );
    const insert = await conn.prepare("INSERT INTO fk_child (id, parent_id) VALUES (?, ?)");
    await expect(insert.run([1, 999])).rejects.toThrow();
  });

  it("capabilities reflect expo-sqlite traits", () => {
    expect(expoSqliteDriver.capabilities.inProcessSync).toBe(false);
    expect(expoSqliteDriver.capabilities.streaming).toBe(true);
    expect(expoSqliteDriver.capabilities.foreignKeysOnByDefault).toBe(false);
    expect(expoSqliteDriver.capabilities.immediateTransactions).toBe(true);
  });
});
