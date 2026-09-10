import { describe, expect, it, vi } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

type Host = { beginDeferredTransaction(isolationLevel?: string): Promise<void> };

function sqlHost(klass: typeof Mysql2Adapter | typeof PostgreSQLAdapter) {
  const sql: string[] = [];
  const host = Object.create(klass.prototype, {
    internalExecute: { value: vi.fn(async (s: string) => void sql.push(s)) },
    withRawConnection: { value: async (_o: unknown, f: () => unknown) => f() },
    _acquireFreshClient: { value: async () => ({}) },
    _client: { value: null, writable: true },
  });
  return { host: host as Host, sql };
}

describe("Mysql2Adapter#beginDeferredTransaction", () => {
  it("issues SET TRANSACTION ISOLATION LEVEL when given an isolation level", async () => {
    const { host, sql } = sqlHost(Mysql2Adapter);
    await host.beginDeferredTransaction(":read_committed");
    expect(sql).toEqual(["SET TRANSACTION ISOLATION LEVEL READ COMMITTED", "BEGIN"]);
  });

  it("issues a bare BEGIN without an isolation level", async () => {
    const { host, sql } = sqlHost(Mysql2Adapter);
    await host.beginDeferredTransaction();
    expect(sql).toEqual(["BEGIN"]);
  });
});

describe("PostgreSQLAdapter#beginDeferredTransaction", () => {
  it("issues BEGIN ISOLATION LEVEL when given an isolation level", async () => {
    const { host, sql } = sqlHost(PostgreSQLAdapter);
    await host.beginDeferredTransaction(":read_committed");
    expect(sql).toEqual(["BEGIN ISOLATION LEVEL READ COMMITTED"]);
  });

  it("issues a bare BEGIN without an isolation level", async () => {
    const { host, sql } = sqlHost(PostgreSQLAdapter);
    await host.beginDeferredTransaction();
    expect(sql).toEqual(["BEGIN"]);
  });
});
