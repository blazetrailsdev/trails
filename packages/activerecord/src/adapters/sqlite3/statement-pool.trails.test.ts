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
    expect(adapter.buildStatementPool().maxSize).toBe(7);
  });

  it("reads preparedStatements from the options hash", () => {
    const adapter = track(new BetterSQLite3Adapter(":memory:", { preparedStatements: false }));
    expect(adapter.preparedStatements).toBe(false);
  });

  it("passes a non-boolean preparedStatements config through as Rails does", () => {
    // abstract_adapter.rb:159 pipes the config through
    // `type_cast_config_to_boolean`, which maps the string `"false"` to `false`
    // and returns everything else UNCHANGED (abstract_adapter.rb:65-71).
    expect(
      track(
        new BetterSQLite3Adapter(":memory:", {
          preparedStatements: "false" as unknown as boolean,
        }),
      ).preparedStatements,
    ).toBe(false);
    // `0` survives the cast and is truthy in Ruby, so
    // `prepared_statements?` (abstract_adapter.rb:234-235) answers true.
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
    await adapter.execute("SELECT * FROM t WHERE id = ?", [1]);
    adapter.clearCacheBang();
    await adapter.execute("SELECT * FROM t WHERE id = ?", [2]);
    await adapter.exec(`DROP TABLE IF EXISTS t`);
  });
});
