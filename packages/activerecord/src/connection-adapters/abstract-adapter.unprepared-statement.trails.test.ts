import { describe, expect, it } from "vitest";
import { AbstractAdapter } from "./abstract-adapter.js";
import { toSqlAndBinds, type DatabaseStatementsHost } from "./abstract/database-statements.js";
import { Nodes } from "@blazetrails/arel";

class TestAdapter extends AbstractAdapter {
  static override readonly ADAPTER_NAME = "TestAdapter";
}

const adapter = (): AbstractAdapter => {
  const a = Object.create(TestAdapter.prototype) as AbstractAdapter;
  (a as unknown as { _preparedStatements: boolean })._preparedStatements = true;
  return a;
};

describe("AbstractAdapter#unpreparedStatement", () => {
  it("disables prepared statements through the disabled cache, not the flag", () => {
    const a = adapter();
    const seen: boolean[] = [];
    const result = a.unpreparedStatement(() => {
      seen.push(a.preparedStatements);
      expect(a.preparedStatementsDisabledCache.has(a)).toBe(true);
      expect((a as unknown as { _preparedStatements: boolean })._preparedStatements).toBe(true);
      return "sql";
    });

    expect(result).toBe("sql");
    expect(seen).toEqual([false]);
    expect(a.preparedStatements).toBe(true);
    expect(a.preparedStatementsDisabledCache.has(a)).toBe(false);
  });

  it("returns a synchronous block's value without a promise", () => {
    const a = adapter();
    expect(a.unpreparedStatement(() => 42)).toBe(42);
  });

  it("clears the disabled cache when the block raises", () => {
    const a = adapter();
    expect(() =>
      a.unpreparedStatement(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(a.preparedStatementsDisabledCache.has(a)).toBe(false);
  });

  it("clears the disabled cache when an async block rejects", async () => {
    const a = adapter();
    await expect(
      a.unpreparedStatement(async () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    expect(a.preparedStatementsDisabledCache.has(a)).toBe(false);
  });

  it("to_sql_and_binds retries through the adapter's unprepared_statement", () => {
    let unpreparedCalls = 0;
    const host = {
      _preparedStatements: true,
      preparedStatementsDisabledCache: new Set<unknown>(),
      get preparedStatements(): boolean {
        return this._preparedStatements && !this.preparedStatementsDisabledCache.has(this);
      },
      unpreparedStatement<T>(fn: () => Promise<T> | T): Promise<T> | T {
        unpreparedCalls++;
        return AbstractAdapter.prototype.unpreparedStatement.call(this, fn) as Promise<T> | T;
      },
      bindParamsLength(): number {
        return 0;
      },
      collector(): unknown {
        return { retryable: false, preparable: undefined };
      },
      visitor: {
        compile(_node: unknown, collector: { preparable?: boolean }): unknown {
          return collector.preparable === true ? ["SELECT 1", [1]] : "SELECT 1";
        },
      },
    };

    const [sql, binds] = toSqlAndBinds.call(
      host as unknown as DatabaseStatementsHost,
      new Nodes.Node(),
    );

    expect(unpreparedCalls).toBe(1);
    expect(sql).toBe("SELECT 1");
    expect(binds).toEqual([]);
    expect(host._preparedStatements).toBe(true);
    expect(host.preparedStatementsDisabledCache.size).toBe(0);
  });
});
