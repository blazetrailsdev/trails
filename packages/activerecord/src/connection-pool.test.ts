import { it, expect, vi } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { NoMethodError } from "@blazetrails/activemodel";
import { Visitors } from "@blazetrails/arel";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-handler.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { SchemaCache, SchemaReflection } from "./connection-adapters/schema-cache.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { ambientPoolConfiguration, rawTestAdapterConfiguration } from "./test-adapter.js";
import { inMemoryDb } from "./support/adapter-helper.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Result } from "./result.js";
import { Base } from "./base.js";
import { assertNoQueries } from "./testing/query-assertions.js";
import { register, resolve } from "./connection-adapters.js";

interface AmbientPoolOptions {
  role?: string;
  shard?: string;
}

function makeAmbientDbConfig(overrides: Record<string, unknown> = {}): HashConfig {
  return new HashConfig("test", "primary", {
    ...rawTestAdapterConfiguration(),
    checkoutTimeout: 0.2,
    reapingFrequency: null,
    ...overrides,
  });
}

function makeAmbientPool(
  overrides: Record<string, unknown> = {},
  { role = "writing", shard = "default" }: AmbientPoolOptions = {},
): ConnectionPool {
  const pc = new PoolConfig(
    new ConnectionDescriptor("primary"),
    makeAmbientDbConfig(overrides),
    role,
    shard,
  );
  return new ConnectionPool(pc);
}

function makePool(size: number = 5): ConnectionPool {
  return makeAmbientPool({ pool: size });
}

class TransactionAwareTestAdapter extends AbstractAdapter implements DatabaseAdapter {
  constructor() {
    super();
    this._connection = this;
  }
  activeFlag = true;
  override async active(): Promise<boolean> {
    return this.activeFlag;
  }
  isInTransaction(): boolean {
    return false;
  }

  async execute(_sql: string, _name?: string | null): Promise<Record<string, unknown>[]> {
    return [];
  }
  async executeMutation(_sql: string, _binds?: unknown[], _name?: string): Promise<number> {
    return 0;
  }
  async commit(): Promise<void> {}
  async rollback(): Promise<void> {}
  async createSavepoint(_name: string): Promise<void> {}
  async releaseSavepoint(_name: string): Promise<void> {}
  async rollbackToSavepoint(_name: string): Promise<void> {}
  async selectAll(sql: string, _n?: string | null, _b?: unknown[]) {
    return Result.fromRowHashes(await this.execute(sql));
  }
  async selectOne(sql: string, _n?: string | null, _b?: unknown[]) {
    return (await this.execute(sql))[0];
  }
  async selectValue(_s: string) {
    return undefined;
  }
  async selectValues(_s: string) {
    return [];
  }
  async selectRows(_s: string) {
    return [];
  }
  async execQuery(sql: string, _n?: string | null, _b?: unknown[]) {
    return Result.fromRowHashes(await this.execute(sql));
  }
  async execInsert(sql: string, _n?: string | null, _b?: unknown[]) {
    return Result.fromRowHashes(await this.execute(sql));
  }
  async execDelete(sql: string, _n?: string | null, b?: unknown[]) {
    return this.executeMutation(sql, b);
  }
  async execUpdate(sql: string, _n?: string | null, b?: unknown[]) {
    return this.executeMutation(sql, b);
  }
  isWriteQuery(_sql: string) {
    return false;
  }
  emptyInsertStatementValue() {
    return "DEFAULT VALUES";
  }
}

register("transaction_aware_test", async () => TransactionAwareTestAdapter);
await resolve("transaction_aware_test");

function makeTransactionAwarePool(size: number = 5): ConnectionPool {
  return makeAmbientPool({ adapter: "transaction_aware_test", pool: size });
}

it("checkout after close", async () => {
  const pool = makePool();
  const conn = await pool.leaseConnection();
  expect(conn).toBeTruthy();
  pool.releaseConnection();

  await pool.disconnectBang();

  const conn2 = await pool.leaseConnection();
  expect(conn2).toBeTruthy();
  expect(conn2).not.toBe(conn);
  pool.releaseConnection();
});

it("with connection", async () => {
  const pool = makePool();
  const result = await pool.withConnection((conn) => {
    expect(conn).toBeTruthy();
    return "ok";
  });
  expect(result).toBe("ok");
  expect(pool.stat().busy).toBe(0);
  expect(pool.stat().idle).toBe(1);

  const asyncResult = await pool.withConnection(async (conn) => {
    expect(conn).toBeTruthy();
    return "async-ok";
  });
  expect(asyncResult).toBe("async-ok");
  expect(pool.stat().busy).toBe(0);

  await expect(
    pool.withConnection(async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(pool.stat().busy).toBe(0);
});

it.skipIf(inMemoryDb())("new connection no query", async () => {
  const pool = makePool();
  expect(pool.stat().connections).toBe(0);
  await pool.withConnection(() => {});
  await pool.flush(0);
  expect(pool.stat().connections).toBe(0);

  await assertNoQueries(false, async () => {
    await pool.withConnection(() => {});
  });
});

it("active connection in use", async () => {
  const pool = makePool();
  expect(pool.activeConnection).toBeNull();
  const conn = await pool.leaseConnection();
  expect(pool.activeConnection).toBe(conn);
  pool.releaseConnection();
  expect(pool.activeConnection).toBeNull();
});

it("full pool exception", async () => {
  const pool = makePool(1);
  await pool.checkout();
  await expect(pool.checkout(0.05)).rejects.toThrow(/could not obtain a connection/i);
});

it("full pool blocks", async () => {
  const pool = makePool(1);
  const conn = await pool.checkout();
  const promise = pool.checkout(1);
  pool.checkin(conn);
  const conn2 = await promise;
  expect(conn2).toBe(conn);
  pool.checkin(conn2);
});

it("removing releases latch", async () => {
  const pool = makePool(1);
  const conn = await pool.checkout();
  const promise = pool.checkout(1);
  pool.remove(conn);
  const conn2 = await promise;
  expect(conn2).not.toBe(conn);
  pool.checkin(conn2);
});

it("reap and active", async () => {
  const pool = makePool();
  await pool.checkout();
  await pool.checkout();
  await pool.checkout();
  const count = pool.connections.length;
  pool.reap();
  expect(pool.connections.length).toBe(count);
  await pool.disconnect();
});

it("idle timeout configuration", async () => {
  const keepPool = makeAmbientPool({ idleTimeout: 9999 });
  const keepConn = await keepPool.checkout();
  keepPool.checkin(keepConn);
  expect(keepPool.stat().connections).toBe(1);
  await keepPool.flush();
  expect(keepPool.stat().connections).toBe(1);

  const flushPool = makeAmbientPool({ idleTimeout: 1 });
  vi.useFakeTimers();
  try {
    const flushConn = await flushPool.checkout();
    flushPool.checkin(flushConn);
    expect(flushPool.stat().connections).toBe(1);
    await flushPool.flush();
    expect(flushPool.stat().connections).toBe(1);
    vi.advanceTimersByTime(2000);
    await flushPool.flush();
    expect(flushPool.stat().connections).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("disable flush", async () => {
  const pool = makeAmbientPool({ idleTimeout: null });
  const conn = await pool.checkout();
  pool.checkin(conn);
  await pool.flush();
  expect(pool.stat().connections).toBe(1);
});

it("flush", async () => {
  const pool = makePool(5);
  const conn = await pool.checkout();
  pool.checkin(conn);
  expect(pool.stat().connections).toBe(1);
  expect(pool.stat().idle).toBe(1);
  await pool.flush(9999);
  expect(pool.stat().connections).toBe(1);
  await pool.flush(0);
  expect(pool.stat().connections).toBe(0);
});

it("flush bang", async () => {
  const pool = makePool(5);
  const c1 = await pool.checkout();
  const c2 = await pool.checkout();
  pool.checkin(c1);
  pool.checkin(c2);
  expect(pool.stat().idle).toBe(2);
  await pool.flushBang();
  expect(pool.stat().connections).toBe(0);
  expect(pool.stat().idle).toBe(0);
});

it("remove connection", async () => {
  const pool = makePool();
  const conn = await pool.checkout();
  expect(pool.stat().connections).toBe(1);
  pool.remove(conn);
  expect(pool.stat().connections).toBe(0);
});

it("active connection?", async () => {
  const pool = makePool();
  expect(pool.activeConnection).toBeNull();
  const conn = await pool.leaseConnection();
  expect(pool.activeConnection).toBe(conn);
  pool.releaseConnection();
});

it("checkout behavior", async () => {
  const pool = makePool(2);
  const c1 = await pool.checkout();
  const c2 = await pool.checkout();
  expect(c1).not.toBe(c2);
  pool.checkin(c1);
  pool.checkin(c2);
});

it("checkout order is lifo", async () => {
  const pool = makePool(2);
  const c1 = await pool.checkout();
  const c2 = await pool.checkout();
  pool.checkin(c1);
  pool.checkin(c2);
  const c3 = await pool.checkout();
  expect(c3).toBe(c2);
});

it("automatic reconnect restores after disconnect", async () => {
  const pool = makePool();
  expect(pool.automaticReconnect).toBe(true);
  expect(await pool.leaseConnection()).toBeTruthy();
  pool.releaseConnection();

  await pool.disconnectBang();
  expect(await pool.leaseConnection()).toBeTruthy();
  pool.releaseConnection();
});

it("automatic reconnect can be disabled", async () => {
  const pool = makePool();
  await pool.disconnectBang();
  pool.automaticReconnect = false;

  await expect(pool.leaseConnection()).rejects.toThrow(/automatic_reconnect is disabled/);
  await expect(pool.withConnection(() => {})).rejects.toThrow(/automatic_reconnect is disabled/);
});

it("pool sets connection visitor", async () => {
  const pool = makeTransactionAwarePool(5);
  const conn = await pool.leaseConnection();
  expect((conn as unknown as { visitor: unknown }).visitor).toBeInstanceOf(Visitors.ToSql);
  pool.releaseConnection();
});

it("anonymous class exception", async () => {
  const makeAnon = (): typeof Base => class extends Base {} as unknown as typeof Base;
  const Anon = makeAnon();
  await expect(Anon.establishConnection()).rejects.toThrow("Anonymous class is not allowed.");
});

class ConnectionTestModel extends Base {
  static override abstractClass = true;
}

it("connection notification is called", async () => {
  const payloads: Record<string, unknown>[] = [];
  const sub = Notifications.subscribe("!connection.active_record", (event) => {
    payloads.push(event.payload as Record<string, unknown>);
  });
  try {
    const dbConfig = new HashConfig("test", "primary", ambientPoolConfiguration());
    Base.connectionHandler.establishConnection(dbConfig, { ownerName: ConnectionTestModel });
    expect(payloads).toHaveLength(1);
    expect(Object.keys(payloads[0]).sort()).toEqual(["config", "connection_name", "role", "shard"]);
    expect(payloads[0].connection_name).toBe(ConnectionTestModel.name);
    expect(payloads[0].shard).toBe("default");
    expect(payloads[0].role).toBe("writing");
  } finally {
    Notifications.unsubscribe(sub);
    Base.connectionHandler.removeConnectionPool(ConnectionTestModel.name);
    await Base.connectionHandler.clearAllConnectionsBang();
  }
});

it("connection notification is called for shard", async () => {
  const payloads: Record<string, unknown>[] = [];
  const sub = Notifications.subscribe("!connection.active_record", (event) => {
    payloads.push(event.payload as Record<string, unknown>);
  });
  try {
    ConnectionTestModel.connectsTo({
      shards: { default: { writing: ambientPoolConfiguration() } },
    });
    expect(payloads).toHaveLength(1);
    expect(Object.keys(payloads[0]).sort()).toEqual(["config", "connection_name", "role", "shard"]);
    expect(payloads[0].connection_name).toBe(ConnectionTestModel.name);
    expect(payloads[0].shard).toBe("default");
    expect(payloads[0].role).toBe("writing");
  } finally {
    Notifications.unsubscribe(sub);
    Base.connectionHandler.removeConnectionPool(ConnectionTestModel.name);
    await Base.connectionHandler.clearAllConnectionsBang();
  }
});

it("sets pool schema reflection", async () => {
  const pool = makePool();
  const original = pool.schemaReflection;
  expect(original).toBeTruthy();

  const newReflection = new SchemaReflection(null);
  pool.schemaReflection = newReflection;
  expect(pool.schemaReflection).toBe(newReflection);
  expect(pool.schemaReflection).not.toBe(original);
});

it("pool sets connection schema cache", async () => {
  const pool = makeTransactionAwarePool(5);
  const conn1 = await pool.checkout();
  const conn2 = await pool.checkout();
  expect(conn1).not.toBe(conn2);
  const cache1 = (conn1 as unknown as { internalSchemaCache: SchemaCache }).internalSchemaCache;
  const cache2 = (conn2 as unknown as { internalSchemaCache: SchemaCache }).internalSchemaCache;
  expect(cache1).toBeInstanceOf(SchemaCache);
  expect(cache1).toBe(cache2);
  pool.checkin(conn1);
  pool.checkin(conn2);
});

it("connection pool stat", async () => {
  const pool = makePool(5);
  const conn = await pool.checkout();
  const stat = pool.stat();
  expect(stat.size).toBe(5);
  expect(stat.connections).toBe(1);
  expect(stat.busy).toBe(1);
  expect(stat.idle).toBe(0);
  pool.checkin(conn);
});

it("role and shard is returned", async () => {
  const pool = makeAmbientPool({}, { role: "reading", shard: "shard_one" });
  expect(pool.role).toBe("reading");
  expect(pool.shard).toBe("shard_one");
});

it("pin connection always returns the same connection", async () => {
  const pool = makeTransactionAwarePool(5);
  await pool.pinConnectionBang();
  const conn1 = await pool.checkout();
  const conn2 = await pool.checkout();
  expect(conn1).toBe(conn2);
  await pool.unpinConnectionBang();
});

it("pin connection connected?", async () => {
  const pool = makeTransactionAwarePool(5);
  await pool.pinConnectionBang();
  expect(pool.isConnected()).toBe(true);
  await pool.unpinConnectionBang();
});

it("isConnected probes each pooled connection's connected state", async () => {
  const pool = makePool();
  const conn = await pool.checkout();
  await conn.verifyBang();
  expect(pool.isConnected()).toBe(true);
  pool.checkin(conn);
  conn.disconnectBang();
  expect(pool.connections.length).toBe(1);
  expect(pool.isConnected()).toBe(false);
});

it("pin connection opens a transaction", async () => {
  const pool = makeTransactionAwarePool(5);
  await pool.pinConnectionBang();
  const conn = (await pool.checkout()) as TransactionAwareTestAdapter;
  expect(conn.transactionManager.openTransactions).toBe(1);
  expect(conn.transactionManager.currentTransaction.open).toBe(true);
  expect(conn.transactionManager.currentTransaction.joinable).toBe(false);
  await pool.unpinConnectionBang();
});

it("unpin connection returns whether transaction has been rolledback", async () => {
  const pool = makeTransactionAwarePool(5);

  await pool.pinConnectionBang();
  const clean = await pool.unpinConnectionBang();
  expect(clean).toBe(true);

  await pool.pinConnectionBang();
  const conn = (await pool.checkout()) as TransactionAwareTestAdapter;
  await conn.transactionManager.commitTransaction();
  const dirty = await pool.unpinConnectionBang();
  expect(dirty).toBe(false);
});

it("pin connection nesting", async () => {
  const pool = makeTransactionAwarePool(5);
  await pool.pinConnectionBang();
  const conn1 = (await pool.checkout()) as TransactionAwareTestAdapter;
  expect(conn1.transactionManager.openTransactions).toBe(1);
  expect(conn1.transactionManager.currentTransaction.joinable).toBe(false);

  await pool.pinConnectionBang();
  const conn2 = await pool.checkout();
  expect(conn1).toBe(conn2);
  expect(conn1.transactionManager.openTransactions).toBe(2);

  await pool.unpinConnectionBang();
  expect(conn1.transactionManager.openTransactions).toBe(1);
  expect(conn1.transactionManager.currentTransaction.open).toBe(true);
  const conn3 = await pool.checkout();
  expect(conn3).toBe(conn1);

  await pool.unpinConnectionBang();
  expect(conn1.transactionManager.openTransactions).toBe(0);
});

it("subsequent pinned checkout verifies and reconnects a connection that died mid-session", async () => {
  const pool = makeTransactionAwarePool(5);
  await pool.pinConnectionBang();

  const conn = (await pool.checkout()) as TransactionAwareTestAdapter;
  const verify = vi.spyOn(conn, "verifyBang");
  const reconnect = vi.spyOn(conn, "reconnectBang").mockImplementation(async () => {
    conn.activeFlag = true;
  });

  expect(await pool.checkout()).toBe(conn);
  expect(verify).toHaveBeenCalledTimes(1);
  expect(reconnect).not.toHaveBeenCalled();

  conn.activeFlag = false;
  const again = (await pool.checkout()) as TransactionAwareTestAdapter;
  expect(again).toBe(conn);
  expect(verify).toHaveBeenCalledTimes(2);
  expect(reconnect).toHaveBeenCalledWith({ restoreTransactions: true });
  expect(await again.active()).toBe(true);

  verify.mockRestore();
  reconnect.mockRestore();
  await pool.unpinConnectionBang();
});

it("inspect does not show secrets", async () => {
  const pool = makePool();
  const str = pool.inspect();
  expect(str).toMatch(/ConnectionPool/);
  expect(str).toMatch(/env_name="test"/);
  expect(str).toMatch(/role="writing"/);
  expect(str).not.toMatch(/password/);
  expect(str).not.toContain(String(ambientPoolConfiguration().adapter));

  const pool2 = makeAmbientPool({}, { role: "reading", shard: "shard_one" });
  expect(pool2.inspect()).toMatch(/shard="shard_one"/);
  expect(pool2.inspect()).toMatch(/role="reading"/);
});

it("adapter proxy treats a probe name as the send it is, with no carve-out set", async () => {
  const pool = makePool();
  const proxy = (
    pool as unknown as { _getAdapterProxy(): Record<PropertyKey, unknown> }
  )._getAdapterProxy();

  for (const key of [
    "then",
    "toJSON",
    "asymmetricMatch",
    "$$typeof",
    "nodeType",
    "getMockName",
    "_isMockFunction",
  ]) {
    expect(() => proxy[key]).toThrow(NoMethodError);
  }
  expect(typeof proxy.hasOwnProperty).toBe("function");
  expect(proxy.constructor).toBe(AbstractAdapter);
  expect(proxy[Symbol.iterator]).toBeUndefined();

  expect(() => expect({ adapter: proxy, n: 1 }).toEqual({ adapter: proxy, n: 2 })).toThrow(
    /expected/i,
  );
});

it("adapter proxy still dispatches genuine adapter methods to the connection", async () => {
  const pool = makePool();
  const proxy = (
    pool as unknown as {
      _getAdapterProxy(): {
        quoteTableName(name: string): Promise<string>;
      };
    }
  )._getAdapterProxy();

  const quoted = await proxy.quoteTableName("people");
  expect(quoted).toContain("people");
});

it("adapter proxy does not fabricate a method for an unknown probe key once a connection exists", async () => {
  const pool = makePool();
  await pool.checkout();
  const proxy = (
    pool as unknown as { _getAdapterProxy(): Record<PropertyKey, unknown> }
  )._getAdapterProxy();
  expect(() => proxy.someMatcherProbeKey).toThrow(NoMethodError);
  await pool.disconnect();
});
