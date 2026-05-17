import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SqliteConnection } from "../sqlite-adapter.js";
import { isNodeSqliteAvailable, nodeSqliteDriver } from "./node-sqlite.js";

describe.skipIf(!isNodeSqliteAvailable)("SqliteDriver — node-sqlite round-trip", () => {
  let conn: SqliteConnection;

  beforeAll(async () => {
    conn = await nodeSqliteDriver.open({ database: ":memory:" });
    const create = await conn.prepare(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL, qty INTEGER)",
    );
    await create.run();
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
    for (const row of select.iterate() as Iterable<unknown>) collected.push(row);
    expect(collected.length).toBeGreaterThanOrEqual(2);
  });

  it("named binds work as a single object", async () => {
    const select = await conn.prepare("SELECT qty FROM widgets WHERE name = $name");
    const row = (await select.get({ name: "sprocket" })) as Record<string, unknown>;
    expect(row["qty"]).toBe(42);
  });

  it("columns() returns column metadata", async () => {
    const stmt = await conn.prepare("SELECT id, name, qty FROM widgets");
    const cols = stmt.columns();
    expect(cols.length).toBe(3);
    expect(cols[0]!.name).toBe("id");
    expect(cols[0]!.column === null || typeof cols[0]!.column === "string").toBe(true);
  });

  it("setReadBigInts enables bigint returns", async () => {
    const stmt = await conn.prepare("SELECT qty FROM widgets WHERE name = ?");
    stmt.setReadBigInts(true);
    const row = (await stmt.get(["sprocket"])) as Record<string, unknown>;
    expect(typeof row["qty"]).toBe("bigint");
  });

  it("exec runs SQL", async () => {
    await conn.exec("CREATE TABLE IF NOT EXISTS tmp_exec (x INTEGER)");
    await conn.exec("DROP TABLE tmp_exec");
  });

  it("pragma returns a value", async () => {
    const result = await conn.pragma("journal_mode");
    expect(result).toBeDefined();
  });

  it("write pragma does not throw and returns []", async () => {
    expect(await conn.pragma("foreign_keys = ON")).toEqual([]);
  });

  it("isOpen() is true while connected", () => {
    expect(conn.isOpen()).toBe(true);
  });

  it("statement.reader is true for SELECT/PRAGMA, false for INSERT/write-PRAGMA", async () => {
    expect((await conn.prepare("SELECT 1")).reader).toBe(true);
    expect((await conn.prepare("PRAGMA journal_mode")).reader).toBe(true);
    expect((await conn.prepare("INSERT INTO widgets (name, qty) VALUES (?, ?)")).reader).toBe(
      false,
    );
    expect((await conn.prepare("PRAGMA foreign_keys = ON")).reader).toBe(false);
  });

  it("databaseExists() reports memory databases as present", () => {
    expect(nodeSqliteDriver.databaseExists?.({ database: ":memory:" })).toBe(true);
  });

  it("capabilities reflect node-sqlite traits", () => {
    expect(nodeSqliteDriver.capabilities.inProcessSync).toBe(true);
    expect(nodeSqliteDriver.capabilities.streaming).toBe(true);
    expect(nodeSqliteDriver.capabilities.foreignKeysOnByDefault).toBe(false);
  });
});

describe.skipIf(!isNodeSqliteAvailable)("SqliteDriver — node-sqlite strict", () => {
  // node:sqlite exposes SQLITE_DBCONFIG_DQS_* via the
  // `enableDoubleQuotedStringLiterals` open option. With strict: true DQS is
  // disabled, so `SELECT "missing_col"` raises "no such column". With
  // strict: false (the default) the unknown double-quoted token is parsed
  // as a string literal and SELECT returns its text verbatim.
  it("rejects unknown double-quoted identifiers under strict: true", async () => {
    const conn = await nodeSqliteDriver.open({ database: ":memory:", strict: true });
    try {
      // node:sqlite raises at prepare() time (not get()) when DQS is off and
      // the identifier is unknown — wrap the call so expect() catches the
      // synchronous throw rather than evaluating it as an argument.
      expect(() => conn.prepare(`SELECT "missing_col" AS v`)).toThrow(/no such column/i);
    } finally {
      await conn.close();
    }
  });

  it("treats unknown double-quoted identifiers as literals under strict: false", async () => {
    const conn = await nodeSqliteDriver.open({ database: ":memory:", strict: false });
    try {
      const stmt = await conn.prepare(`SELECT "missing_col" AS v`);
      const row = (await stmt.get()) as Record<string, unknown>;
      expect(row["v"]).toBe("missing_col");
    } finally {
      await conn.close();
    }
  });
});
