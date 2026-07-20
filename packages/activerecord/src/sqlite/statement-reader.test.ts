import { describe, it, expect } from "vitest";
import type { SqliteConnection, SqliteDriver } from "../sqlite-adapter.js";
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
