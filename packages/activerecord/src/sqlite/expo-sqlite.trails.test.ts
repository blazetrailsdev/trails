import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type SqliteConnection, SQLite3Constants } from "../sqlite-adapter.js";
import { isExpoSqliteAvailable, expoSqliteDriver } from "./expo-sqlite.js";

it("expo-sqlite module import does not crash", () => {
  expect(typeof isExpoSqliteAvailable).toBe("boolean");
  expect(typeof expoSqliteDriver.open).toBe("function");
});

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
    await conn.exec("DROP TABLE IF EXISTS widgets");
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

  it("exec runs DDL statements", async () => {
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
    await conn.exec("DROP TABLE IF EXISTS fk_child");
    await conn.exec("DROP TABLE IF EXISTS fk_parent");
  });

  it("columns() returns empty array (expo-sqlite has no column metadata API)", async () => {
    const stmt = await conn.prepare("SELECT id, name, qty FROM widgets");
    expect(stmt.columns()).toEqual([]);
  });

  it("setReadBigInts does not throw (documented no-op on this driver)", async () => {
    const stmt = await conn.prepare("SELECT qty FROM widgets WHERE name = ?");
    expect(() => stmt.setReadBigInts(true)).not.toThrow();
    expect(() => stmt.setReadBigInts(false)).not.toThrow();
  });

  it("capabilities reflect expo-sqlite traits", () => {
    expect(expoSqliteDriver.capabilities.inProcessSync).toBe(false);
    expect(expoSqliteDriver.capabilities.streaming).toBe(true);
    expect(expoSqliteDriver.capabilities.foreignKeysOnByDefault).toBe(false);
    expect(expoSqliteDriver.capabilities.immediateTransactions).toBe(true);
  });
});

describe.skipIf(!isExpoSqliteAvailable)(
  "SqliteDriver — expo-sqlite binds unsupplied placeholders as NULL",
  () => {
    let conn: SqliteConnection;

    beforeAll(async () => {
      conn = await expoSqliteDriver.open({ database: ":memory:" });
      const create = await conn.prepare("CREATE TABLE doodads (id INTEGER PRIMARY KEY, name TEXT)");
      await create.run();
      const insert = await conn.prepare("INSERT INTO doodads (name) VALUES (?)");
      await insert.run(["alpha"]);
    });

    afterAll(async () => {
      await conn.close();
    });

    it("runs a statement with placeholders and no values at all, like the Ruby sqlite3 gem", async () => {
      const stmt = await conn.prepare("SELECT * FROM doodads WHERE id = ?");
      expect(await stmt.all()).toEqual([]);
    });

    it("pads only the trailing placeholders left unsupplied", async () => {
      const stmt = await conn.prepare("SELECT * FROM doodads WHERE name = ? OR id = ?");
      expect(await stmt.all(["alpha"])).toEqual([{ id: 1, name: "alpha" }]);
    });

    it("EXPLAIN QUERY PLAN runs against a statement whose binds were never supplied", async () => {
      const stmt = await conn.prepare("EXPLAIN QUERY PLAN SELECT * FROM doodads WHERE id = ?");
      expect((await stmt.all()).length).toBeGreaterThan(0);
    });

    it("does not raise on an ordinary query given a short bind list", async () => {
      const select = await conn.prepare("SELECT * FROM doodads WHERE name = ? AND id = ?");
      expect(await select.all(["alpha"])).toEqual([]);
      const update = await conn.prepare("UPDATE doodads SET name = ? WHERE id = ?");
      expect((await update.run(["beta"])).changes).toBe(0);
    });

    it("shared-cache open either shares a cache or fails to open", async () => {
      const conns: SqliteConnection[] = [];
      try {
        for (let i = 0; i < 2; i++) {
          conns.push(
            await expoSqliteDriver.open({
              database: "file::memory:?cache=shared",
              flags: SQLite3Constants.Open.READWRITE | SQLite3Constants.Open.SHAREDCACHE,
            }),
          );
        }
      } catch (e) {
        expect((e as Error).message).toContain("SQLITE_OPEN_SHAREDCACHE");
        return;
      }
      const [a, b] = conns;
      await a.exec("CREATE TABLE shared_cache_probe (x INTEGER)");
      await b.exec("PRAGMA read_uncommitted=ON");
      const probe = await b.prepare("SELECT count(*) AS n FROM shared_cache_probe");
      expect(await probe.all()).toEqual([{ n: 0 }]);
      await a.exec("DROP TABLE IF EXISTS shared_cache_probe");
      for (const c of conns) await c.close();
    });
  },
);
