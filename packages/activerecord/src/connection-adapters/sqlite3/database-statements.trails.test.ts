import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { isWriteQuery } from "./database-statements.js";
import { BetterSQLite3Adapter } from "../better-sqlite3-adapter.js";

describe("SQLite3::DatabaseStatements#isWriteQuery", () => {
  it("retries the match against the bytes when the first match raises ArgumentError", () => {
    let matches = 0;
    const sql = {
      toString() {
        if (matches++ === 0) throw new ArgumentError("invalid byte sequence in UTF-8");
        return "SELECT 1";
      },
    } as unknown as string;

    expect(isWriteQuery(sql)).toBe(false);
  });

  it("re-raises anything but ArgumentError", () => {
    const sql = {
      toString() {
        throw new TypeError("boom");
      },
    } as unknown as string;

    expect(() => isWriteQuery(sql)).toThrow(TypeError);
  });
});

describe("SQLite3::DatabaseStatements#perform_query", () => {
  it("answers the columns of a table recreated under a cached prepared statement", async () => {
    const adapter = new BetterSQLite3Adapter({ database: ":memory:" });
    try {
      const sql = "SELECT * FROM foos WHERE id = ?";
      await adapter.execute("CREATE TABLE foos (id INTEGER PRIMARY KEY, a TEXT)");
      await adapter.execute("INSERT INTO foos (id, a) VALUES (1, 'x')");
      await adapter.execQuery(sql, "SQL", [1], { prepare: true });
      await adapter.execute("DROP TABLE foos");
      await adapter.execute("CREATE TABLE foos (id INTEGER PRIMARY KEY, happened_at TEXT)");
      await adapter.execute("INSERT INTO foos (id, happened_at) VALUES (1, 'y')");
      const result = await adapter.execQuery(sql, "SQL", [1], { prepare: true });
      expect(result.columns).toEqual(["id", "happened_at"]);
      expect(result.rows).toEqual([[1, "y"]]);
    } finally {
      await adapter.disconnectBang();
    }
  });
});
