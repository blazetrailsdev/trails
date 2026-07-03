import { it, expect, vi } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Visitors } from "@blazetrails/arel";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-descriptor.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { SchemaCache, SchemaReflection } from "./connection-adapters/schema-cache.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { newRawTestAdapter } from "./test-adapter.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import type {
  AdapterName,
  AbstractAdapter as DatabaseAdapter,
} from "./connection-adapters/abstract-adapter.js";
import { Result } from "./result.js";
import { Base } from "./base.js";

function makePool(size: number = 5): ConnectionPool {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    pool: size,
    reapingFrequency: null,
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
    adapterFactory: newRawTestAdapter,
  });
  return new ConnectionPool(pc);
}

class TransactionAwareTestAdapter extends AbstractAdapter implements DatabaseAdapter {
  override get adapterName(): AdapterName {
    return "sqlite";
  }
  isNoDatabaseError(_error: unknown): boolean {
    return false;
  }
  // This double has no real raw connection; report active so checkout's
  // verify! is a no-op (mirroring Rails, where the pinned connection is
  // active and verify! returns without reconnecting).
  override get active(): boolean {
    return true;
  }
  readonly inTransaction = false;

  async execute(
    _sql: string,
    _binds?: unknown[],
    _name?: string,
  ): Promise<Record<string, unknown>[]> {
    return [];
  }
  async executeMutation(_sql: string, _binds?: unknown[], _name?: string): Promise<number> {
    return 0;
  }
  async beginTransaction(): Promise<void> {}
  async commit(): Promise<void> {}
  async rollback(): Promise<void> {}
  async createSavepoint(_name: string): Promise<void> {}
  async releaseSavepoint(_name: string): Promise<void> {}
  async rollbackToSavepoint(_name: string): Promise<void> {}
  async selectAll(sql: string, _n?: string | null, b?: unknown[]) {
    return Result.fromRowHashes(await this.execute(sql, b));
  }
  async selectOne(sql: string, _n?: string | null, b?: unknown[]) {
    return (await this.execute(sql, b))[0];
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
  async execQuery(sql: string, _n?: string | null, b?: unknown[]) {
    return Result.fromRowHashes(await this.execute(sql, b));
  }
  async execInsert(sql: string, _n?: string | null, b?: unknown[]) {
    return this.executeMutation(sql, b);
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

function makeTransactionAwarePool(size: number = 5): ConnectionPool {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    pool: size,
    reapingFrequency: null,
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
    adapterFactory: () => new TransactionAwareTestAdapter(),
  });
  return new ConnectionPool(pc);
}

it("checkout after close", async () => {
  const pool = makePool();
  const conn = await pool.leaseConnection();
  expect(conn).toBeTruthy();
  pool.releaseConnection();

  pool.disconnectBang();

  // After disconnect, leaseConnection creates a fresh connection
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
  // `checkout` is async now (it awaits per-checkout verifyBang), so a saturated
  // pool rejects with ConnectionTimeoutError after the checkout timeout rather
  // than throwing synchronously.
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
  // In single-threaded JS, no connections have dead owners, so reap is a no-op
  expect(pool.connections.length).toBe(count);
  pool.disconnect();
});

it("idle timeout configuration", async () => {
  // High idleTimeout: flush() with no args keeps connections
  const keepConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    idleTimeout: 9999,
    reapingFrequency: null,
  });
  const keepPc = new PoolConfig(
    new ConnectionDescriptor("primary"),
    keepConfig,
    "writing",
    "default",
    { adapterFactory: newRawTestAdapter },
  );
  const keepPool = new ConnectionPool(keepPc);
  const keepConn = await keepPool.checkout();
  keepPool.checkin(keepConn);
  expect(keepPool.stat().connections).toBe(1);
  await keepPool.flush();
  expect(keepPool.stat().connections).toBe(1);

  // Small idleTimeout: flush() with no args removes expired idle connections
  const flushConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    idleTimeout: 1,
    reapingFrequency: null,
  });
  const flushPc = new PoolConfig(
    new ConnectionDescriptor("primary"),
    flushConfig,
    "writing",
    "default",
    { adapterFactory: newRawTestAdapter },
  );
  const flushPool = new ConnectionPool(flushPc);
  vi.useFakeTimers();
  try {
    const flushConn = await flushPool.checkout();
    flushPool.checkin(flushConn);
    expect(flushPool.stat().connections).toBe(1);
    // Not yet expired
    await flushPool.flush();
    expect(flushPool.stat().connections).toBe(1);
    // Advance past the 1-second idleTimeout
    vi.advanceTimersByTime(2000);
    await flushPool.flush();
    expect(flushPool.stat().connections).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("disable flush", async () => {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    idleTimeout: null,
    reapingFrequency: null,
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default", {
    adapterFactory: newRawTestAdapter,
  });
  const pool = new ConnectionPool(pc);
  const conn = await pool.checkout();
  pool.checkin(conn);
  // flush is a no-op when idleTimeout is null
  await pool.flush();
  expect(pool.stat().connections).toBe(1);
});

it("flush", async () => {
  const pool = makePool(5);
  const conn = await pool.checkout();
  pool.checkin(conn);
  expect(pool.stat().connections).toBe(1);
  expect(pool.stat().idle).toBe(1);
  // Flush with high idle threshold — nothing removed
  await pool.flush(9999);
  expect(pool.stat().connections).toBe(1);
  // Flush with 0 threshold — removes all idle
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

  pool.disconnectBang();
  // With automaticReconnect=true (default), new connections are created
  expect(await pool.leaseConnection()).toBeTruthy();
  pool.releaseConnection();
});

it("automatic reconnect can be disabled", async () => {
  const pool = makePool();
  pool.disconnectBang();
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
  // Anonymous class (no name) cannot establish a connection — mirrors Rails
  // `raise "Anonymous class is not allowed." unless name`
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
    const dbConfig = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: ":memory:",
    });
    Base.connectionHandler.establishConnection(dbConfig, { owner: ConnectionTestModel });
    expect(payloads).toHaveLength(1);
    expect(Object.keys(payloads[0]).sort()).toEqual(["config", "connection_name", "role", "shard"]);
    expect(payloads[0].connection_name).toBe(ConnectionTestModel.name);
    expect(payloads[0].shard).toBe("default");
    expect(payloads[0].role).toBe("writing");
  } finally {
    Notifications.unsubscribe(sub);
    Base.connectionHandler.clearAllConnectionsBang();
  }
});

it("connection notification is called for shard", async () => {
  const payloads: Record<string, unknown>[] = [];
  const sub = Notifications.subscribe("!connection.active_record", (event) => {
    payloads.push(event.payload as Record<string, unknown>);
  });
  try {
    ConnectionTestModel.connectsTo({
      shards: { default: { writing: { adapter: "sqlite3", database: ":memory:" } } },
    });
    expect(payloads).toHaveLength(1);
    expect(Object.keys(payloads[0]).sort()).toEqual(["config", "connection_name", "role", "shard"]);
    expect(payloads[0].connection_name).toBe(ConnectionTestModel.name);
    expect(payloads[0].shard).toBe("default");
    expect(payloads[0].role).toBe("writing");
  } finally {
    Notifications.unsubscribe(sub);
    Base.connectionHandler.clearAllConnectionsBang();
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
  // Two simultaneous checkouts return distinct connections.
  const conn1 = await pool.checkout();
  const conn2 = await pool.checkout();
  expect(conn1).not.toBe(conn2);
  // Both connections share the same raw SchemaCache instance via poolConfig.
  const cache1 = (conn1 as unknown as { schemaCache: SchemaCache }).schemaCache;
  const cache2 = (conn2 as unknown as { schemaCache: SchemaCache }).schemaCache;
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
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    reapingFrequency: null,
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "reading", "shard_one", {
    adapterFactory: newRawTestAdapter,
  });
  const pool = new ConnectionPool(pc);
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

  // Clean unpin — transaction is still open, rollback happens → clean = true
  await pool.pinConnectionBang();
  const clean = await pool.unpinConnectionBang();
  expect(clean).toBe(true);

  // Dirty unpin — manually commit the transaction before unpin
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

  // Nested pin opens a second transaction (savepoint-level in Rails)
  await pool.pinConnectionBang();
  const conn2 = await pool.checkout();
  expect(conn1).toBe(conn2);
  expect(conn1.transactionManager.openTransactions).toBe(2);

  // First unpin rolls back the inner transaction but keeps connection pinned
  await pool.unpinConnectionBang();
  expect(conn1.transactionManager.openTransactions).toBe(1);
  expect(conn1.transactionManager.currentTransaction.open).toBe(true);
  const conn3 = await pool.checkout();
  expect(conn3).toBe(conn1);

  // Second unpin rolls back the outer transaction and checks in
  await pool.unpinConnectionBang();
  expect(conn1.transactionManager.openTransactions).toBe(0);
});

it("inspect does not show secrets", async () => {
  const pool = makePool();
  const str = pool.inspect();
  expect(str).toMatch(/ConnectionPool/);
  expect(str).toMatch(/env_name="test"/);
  expect(str).toMatch(/role="writing"/);
  expect(str).not.toMatch(/password/);
  expect(str).not.toMatch(/sqlite3/);

  // With non-default shard
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    reapingFrequency: null,
    database: "test.db",
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "reading", "shard_one", {
    adapterFactory: newRawTestAdapter,
  });
  const pool2 = new ConnectionPool(pc);
  expect(pool2.inspect()).toMatch(/shard="shard_one"/);
  expect(pool2.inspect()).toMatch(/role="reading"/);
});
