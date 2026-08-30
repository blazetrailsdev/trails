import { it, expect, afterEach } from "vitest";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";

describeIfSqlite("SQLite3StatementPoolTest", () => {
  const openAdapters: SQLite3Adapter[] = [];
  const track = (adapter: SQLite3Adapter): SQLite3Adapter => {
    openAdapters.push(adapter);
    return adapter;
  };
  afterEach(() => {
    while (openAdapters.length) {
      try {
        openAdapters.pop()!.disconnectBang();
      } catch {}
    }
  });

  it("reads statementLimit from the options hash", () => {
    const adapter = track(new BetterSQLite3Adapter(":memory:", { statementLimit: 7 }));
    const pool = adapter.buildStatementPool();
    expect((pool as unknown as { _statementLimit: number })._statementLimit).toBe(7);
  });

  it("reads preparedStatements from the options hash", () => {
    const adapter = track(new BetterSQLite3Adapter(":memory:", { preparedStatements: false }));
    expect(adapter.preparedStatements).toBe(false);
  });

  it("passes a non-boolean preparedStatements config through as Rails does", () => {
    expect(
      track(
        new BetterSQLite3Adapter(":memory:", {
          preparedStatements: "false" as unknown as boolean,
        }),
      ).preparedStatements,
    ).toBe(false);
    expect(
      track(new BetterSQLite3Adapter(":memory:", { preparedStatements: 0 as unknown as boolean }))
        .preparedStatements,
    ).toBe(true);

    const adapter = track(new BetterSQLite3Adapter(":memory:"));
    (adapter as unknown as { preparedStatements: unknown }).preparedStatements = "true";
    expect(adapter.preparedStatements).toBe(true);
  });

  it("clearCacheBang clears the pool without throwing on next query", async () => {
    const adapter = track(new BetterSQLite3Adapter(":memory:"));
    await adapter.exec(`CREATE TABLE t (id INTEGER)`);
    await adapter.execQuery("SELECT * FROM t WHERE id = ?", "SQL", [1]);
    await adapter.clearCacheBang();
    await adapter.execQuery("SELECT * FROM t WHERE id = ?", "SQL", [2]);
    await adapter.exec(`DROP TABLE IF EXISTS t`);
  });
});
