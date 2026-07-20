import { describe, it, expect } from "vitest";
import type { SqliteConnection, SqliteDriver } from "../sqlite-adapter.js";
import type { AbstractSQLite3Adapter } from "../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { LibSQLAdapter } from "../connection-adapters/libsql-adapter.js";
import { NodeSQLiteAdapter } from "../connection-adapters/node-sqlite-adapter.js";
import { statementIsReader } from "./statement-reader.js";
import { betterSqlite3Driver } from "./better-sqlite3.js";
import { libsqlDriver } from "./libsql.js";
import { isNodeSqliteAvailable, nodeSqliteDriver } from "./node-sqlite.js";

describe("statementIsReader", () => {
  it("classifies plain writes as non-readers", () => {
    expect(statementIsReader("INSERT INTO widgets (name) VALUES ('a')")).toBe(false);
    expect(statementIsReader("UPDATE widgets SET name = 'a'")).toBe(false);
    expect(statementIsReader("PRAGMA foreign_keys = ON")).toBe(false);
  });

  it("classifies RETURNING writes as readers", () => {
    expect(statementIsReader("INSERT INTO widgets (name) VALUES ('a') RETURNING id")).toBe(true);
    expect(statementIsReader("  delete from widgets returning id")).toBe(true);
    expect(statementIsReader("UPDATE widgets SET name = 'b' RETURNING id, name")).toBe(true);
  });

  it("still classifies queries and read PRAGMAs as readers", () => {
    expect(statementIsReader("SELECT 1")).toBe(true);
    expect(statementIsReader("PRAGMA foreign_keys")).toBe(true);
  });
});

const drivers: [string, SqliteDriver, boolean][] = [
  ["better-sqlite3", betterSqlite3Driver, true],
  ["libsql", libsqlDriver, true],
  ["node-sqlite", nodeSqliteDriver, isNodeSqliteAvailable],
];

describe.each(drivers)("SqliteStatement#reader — %s", (_name, driver, available) => {
  it.skipIf(!available)("reports INSERT ... RETURNING as row-returning", async () => {
    const conn: SqliteConnection = await driver.open({ database: ":memory:" });
    try {
      const create = await conn.prepare(
        "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
      );
      await create.run();

      const stmt = await conn.prepare("INSERT INTO widgets (name) VALUES (?) RETURNING id, name");
      expect(stmt.reader).toBe(true);

      const rows = (await stmt.all(["sprocket"])) as Record<string, unknown>[];
      expect(rows).toHaveLength(1);
      expect(rows[0]?.["name"]).toBe("sprocket");
      expect(rows[0]?.["id"]).toBe(1);
    } finally {
      await conn.close();
    }
  });
});

const adapters: [string, () => AbstractSQLite3Adapter, boolean][] = [
  ["better-sqlite3", () => new BetterSQLite3Adapter(":memory:"), true],
  ["libsql", () => new LibSQLAdapter(":memory:"), true],
  ["node-sqlite", () => new NodeSQLiteAdapter(":memory:"), isNodeSqliteAvailable],
];

// `execute` (via `_performQuery`) still drops RETURNING rows on EVERY driver,
// because that path gates rows on `stmt.reader && !isWriteQuery(sql)` — a
// trails invention; Rails branches on `column_count.zero?` alone. Removing the
// isWrite gate would cost `executeMutation` the atomic RunResult rowid that PR
// 4893 introduced, so it is tracked separately as
// sqlite-perform-query-iswrite-gate-drops-returning-rows.
describe.each(adapters)("SQLite3Adapter RETURNING rows — %s", (_name, build, available) => {
  it.skipIf(!available)("internalExecQuery returns the RETURNING rows", async () => {
    const adapter = build();
    try {
      await adapter.execute("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");

      const result = await adapter.internalExecQuery(
        "INSERT INTO widgets (name) VALUES ('gear') RETURNING id, name",
      );
      expect(result.columns).toEqual(["id", "name"]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.[1]).toBe("gear");
    } finally {
      await adapter.execute('DROP TABLE IF EXISTS "widgets"');
      await adapter.close();
    }
  });
});
