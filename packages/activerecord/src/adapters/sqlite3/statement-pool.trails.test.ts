import { it, expect, afterEach } from "vitest";
import { describeIfSqlite } from "./test-helper.js";
import { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";

describeIfSqlite("SQLite3StatementPoolTest", () => {
  // Track every adapter created so a failing assertion can't leak an
  // open SQLite handle into later tests.
  const openAdapters: AbstractSQLite3Adapter[] = [];
  const track = (adapter: AbstractSQLite3Adapter): AbstractSQLite3Adapter => {
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
    expect(adapter.statementLimit).toBe(7);
  });

  it("reads preparedStatements from the options hash", () => {
    const adapter = track(new BetterSQLite3Adapter(":memory:", { preparedStatements: false }));
    expect(adapter.preparedStatements).toBe(false);
  });

  it("rejects invalid statementLimit at construction time", () => {
    expect(() => new BetterSQLite3Adapter(":memory:", { statementLimit: -1 })).toThrow(RangeError);
    expect(() => new BetterSQLite3Adapter(":memory:", { statementLimit: 1.5 })).toThrow(RangeError);
  });

  it("rejects non-boolean preparedStatements at construction time and via assignment", () => {
    expect(
      () =>
        new BetterSQLite3Adapter(":memory:", { preparedStatements: "false" as unknown as boolean }),
    ).toThrow(TypeError);
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
    adapter.exec(`CREATE TABLE t (id INTEGER)`);
    await adapter.execute("SELECT * FROM t WHERE id = ?", [1]);
    adapter.clearCacheBang();
    await adapter.execute("SELECT * FROM t WHERE id = ?", [2]);
    await adapter.exec(`DROP TABLE IF EXISTS t`);
  });
});
