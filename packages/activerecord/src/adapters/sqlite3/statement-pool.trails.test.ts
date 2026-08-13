import { it, expect, afterEach } from "vitest";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";

describeIfSqlite("SQLite3StatementPoolTest", () => {
  // Track every adapter created so a failing assertion can't leak an
  // open SQLite handle into later tests.
  const openAdapters: SQLite3Adapter[] = [];
  const track = (adapter: SQLite3Adapter): SQLite3Adapter => {
    openAdapters.push(adapter);
    return adapter;
  };
  afterEach(() => {
    while (openAdapters.length) {
      try {
        openAdapters.pop()!.disconnectBang();
      } catch {
        // best-effort cleanup
      }
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

  it("rejects non-boolean preparedStatements at construction time and via assignment", () => {
    // `"false"` is NOT rejected: abstract_adapter.rb:159 pipes the config
    // through `type_cast_config_to_boolean`, which maps the string `"false"`
    // to `false` (abstract_adapter.rb:65-71) so a database.yml value survives.
    expect(
      new BetterSQLite3Adapter(":memory:", { preparedStatements: "false" as unknown as boolean })
        .preparedStatements,
    ).toBe(false);
    expect(
      () => new BetterSQLite3Adapter(":memory:", { preparedStatements: 0 as unknown as boolean }),
    ).toThrow(TypeError);

    const adapter = track(new BetterSQLite3Adapter(":memory:"));
    expect(() => {
      (adapter as unknown as { preparedStatements: unknown }).preparedStatements = "true";
    }).toThrow(TypeError);
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
