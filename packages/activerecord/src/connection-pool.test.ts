import { it, expect, vi } from "vitest";
import { Process, Thread, ThreadError } from "@blazetrails/ruby-compat";
import {
  Notifications,
  assertRaise,
  assertRaises,
  assertRespondTo,
} from "@blazetrails/activesupport";
import { ConnectionTimeoutError } from "./errors.js";
import {
  NullTransaction,
  RealTransaction,
  SavepointTransaction,
} from "./connection-adapters/abstract/transaction.js";
import { Visitors } from "@blazetrails/arel";
import { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-handler.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { SchemaReflection } from "./connection-adapters/schema-cache.js";
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

const activeConnections = (pool: ConnectionPool) => pool.connections.filter((c) => c.inUse);

function makePool(size: number = 5): ConnectionPool {
  return makeAmbientPool({ pool: size });
}

class TransactionAwareTestAdapter extends AbstractAdapter implements DatabaseAdapter {
  constructor() {
    super({});
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
  async execDelete(_sql: string, _n?: string | null, _b?: unknown[]) {
    return 0;
  }
  async execUpdate(_sql: string, _n?: string | null, _b?: unknown[]) {
    return 0;
  }
  isWriteQuery(_sql: string) {
    return false;
  }
  emptyInsertStatementValue() {
    return "DEFAULT VALUES";
  }
}

register(
  "transaction_aware_test",
  "TrailsTestAdapter",
  "./connection-adapters/transaction-aware-test-adapter.js",
  async () => TransactionAwareTestAdapter,
);
await resolve("transaction_aware_test");

function makeTransactionAwarePool(size: number = 5): ConnectionPool {
  return makeAmbientPool({ adapter: "transaction_aware_test", pool: size });
}

it("checkout after close", async () => {
  const pool = makePool();
  const connection = await pool.leaseConnection();
  expect(connection.inUse).toBeTruthy();

  await connection.close();
  expect(connection.inUse).toBeFalsy();

  expect((await pool.leaseConnection()).inUse).toBeTruthy();
});

it("with connection", async () => {
  const pool = makePool();
  expect(activeConnections(pool).length).toBe(0);

  const mainThread = await pool.leaseConnection();
  expect(activeConnections(pool).length).toBe(1);

  await new Thread(async () => {
    await pool.withConnection(async (conn) => {
      expect(conn).toBeTruthy();
      expect(activeConnections(pool).length).toBe(2);
    });
    expect(activeConnections(pool).length).toBe(1);

    await pool.withConnection(async (conn) => {
      expect(conn).toBeTruthy();
      expect(activeConnections(pool).length).toBe(2);
      await pool.leaseConnection();
    });

    expect(activeConnections(pool).length).toBe(2);
    pool.releaseConnection();
    expect(activeConnections(pool).length).toBe(1);
  }).join();

  await mainThread.close();
  expect(activeConnections(pool).length).toBe(0);
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
  expect(pool.activeConnection).toBeFalsy();
  const mainThread = await pool.leaseConnection();

  expect(pool.activeConnection).toBeTruthy();

  await mainThread.close();

  expect(pool.activeConnection).toBeFalsy();
});

it("full pool exception", async () => {
  const pool = makePool();
  pool.checkoutTimeout = 0.001;
  for (let i = 0; i < pool.size; i++) expect(await pool.checkout()).toBeTruthy();

  const error = (await assertRaises([ConnectionTimeoutError], {}, () =>
    pool.checkout(),
  )) as ConnectionTimeoutError;
  expect(error.connectionPool).toBe(pool);
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
  const pool = makePool();
  const cs = [];
  for (let i = 0; i < pool.size; i++) cs.push(await pool.checkout());
  const t = new Thread(() => pool.checkout());

  while (pool.numWaitingInQueue() !== 1) await new Promise((resolve) => setTimeout(resolve, 1));

  const connection = cs[0];
  pool.remove(connection);
  assertRespondTo(await t.value(), "execute");
  await connection.close();
});

it("reap and active", async () => {
  const pool = makePool();
  await pool.checkout();
  await pool.checkout();
  await pool.checkout();
  const count = pool.connections.length;
  await pool.reap();
  expect(pool.connections.length).toBe(count);
  await pool.disconnect();
});

it("reap inactive", async () => {
  const pool = makePool();
  const conn = await pool.checkout();
  await new Thread(async () => {
    await pool.checkout();
    await pool.checkout();
  }).value();

  expect(activeConnections(pool).length).toBe(3);

  await pool.reap();

  expect(activeConnections(pool).length).toBe(1);
  pool.checkin(conn);
  await pool.disconnect();
});

it("idle timeout configuration", async () => {
  let pool = makePool();
  await pool.disconnectBang();

  pool = makeAmbientPool({ idleTimeout: 0.02 });
  const idleConn = await pool.checkout();
  pool.checkin(idleConn);

  (idleConn as unknown as { _idleSince: number })._idleSince =
    Process.clockGettime(Process.CLOCK_MONOTONIC) - 0.01;

  await pool.flush();
  expect(pool.connections.length).toBe(1);

  (idleConn as unknown as { _idleSince: number })._idleSince =
    Process.clockGettime(Process.CLOCK_MONOTONIC) - 0.03;

  await pool.flush();
  expect(pool.connections.length).toBe(0);
});

it("disable flush", async () => {
  const pool = makeAmbientPool({ idleTimeout: null });
  const conn = await pool.checkout();
  pool.checkin(conn);
  await pool.flush();
  expect(pool.stat().connections).toBe(1);
});

it("flush", async () => {
  const pool = makePool();
  const idleConn = await pool.checkout();
  const recentConn = await pool.checkout();
  const activeConn = await pool.checkout();

  try {
    pool.checkin(idleConn);
    pool.checkin(recentConn);

    expect(pool.connections.length).toBe(3);

    (idleConn as unknown as { _idleSince: number })._idleSince =
      Process.clockGettime(Process.CLOCK_MONOTONIC) - 1000;

    await pool.flush(30);

    expect(pool.connections.length).toBe(2);

    expect(new Set(pool.connections)).toEqual(new Set([recentConn, activeConn]));
  } finally {
    pool.checkin(activeConn);
  }
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
  try {
    expect(conn.inUse).toBeTruthy();

    const length = pool.connections.length;
    pool.remove(conn);
    expect(conn.inUse).toBeTruthy();
    expect(pool.connections.length).toBe(length - 1);
  } finally {
    await conn.close();
  }
});

it("active connection?", async () => {
  const pool = makePool();
  expect(pool.activeConnection).toBeFalsy();
  expect(await pool.leaseConnection()).toBeTruthy();
  expect(pool.activeConnection).toBeTruthy();
  pool.releaseConnection();
  expect(pool.activeConnection).toBeFalsy();
});

it("checkout behavior", async () => {
  const pool = makePool();
  const mainConnection = await pool.leaseConnection();
  expect(mainConnection).not.toBeNull();
  const threads: Thread[] = [];
  for (let i = 0; i < 4; i++) {
    threads.push(
      new Thread(async () => {
        const threadConnection = await pool.leaseConnection();
        expect(threadConnection).not.toBeNull();
        await threadConnection.close();
      }),
    );
  }

  for (const thread of threads) await thread.join();

  await new Thread(async () => {
    expect(await pool.leaseConnection()).toBeTruthy();
    await (await pool.leaseConnection()).close();
  }).join();
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
  expect(pool.automaticReconnect).toBeTruthy();
  expect(await pool.leaseConnection()).toBeTruthy();

  await pool.disconnectBang();
  expect(await pool.leaseConnection()).toBeTruthy();
});

it("automatic reconnect can be disabled", async () => {
  const pool = makePool();
  await pool.disconnectBang();
  pool.automaticReconnect = false;

  await expect(pool.leaseConnection()).rejects.toThrow(/automatic_reconnect is disabled/);
  await expect(pool.withConnection(() => {})).rejects.toThrow(/automatic_reconnect is disabled/);
});

it("pool sets connection visitor", async () => {
  const pool = makePool();
  expect(
    ((await pool.leaseConnection()) as unknown as { visitor: unknown }).visitor instanceof
      Visitors.ToSql,
  ).toBeTruthy();
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
    await Base.connectionHandler.establishConnection(dbConfig, { ownerName: ConnectionTestModel });
    expect(Object.keys(payloads[0]).sort()).toEqual(["config", "connection_name", "role", "shard"]);
    expect(payloads[0].connection_name).toBe(ConnectionTestModel.name);
    expect(payloads[0].shard).toBe("default");
    expect(payloads[0].role).toBe("writing");
  } finally {
    Notifications.unsubscribe(sub);
    await Base.connectionHandler.removeConnectionPool(ConnectionTestModel.name);
    await Base.connectionHandler.clearAllConnectionsBang();
  }
});

it("connection notification is called for shard", async () => {
  const payloads: Record<string, unknown>[] = [];
  const sub = Notifications.subscribe("!connection.active_record", (event) => {
    payloads.push(event.payload as Record<string, unknown>);
  });
  try {
    await ConnectionTestModel.connectsTo({
      shards: { default: { writing: ambientPoolConfiguration() } },
    });
    expect(Object.keys(payloads[0]).sort()).toEqual(["config", "connection_name", "role", "shard"]);
    expect(payloads[0].connection_name).toBe(ConnectionTestModel.name);
    expect(payloads[0].shard).toBe("default");
    expect(payloads[0].role).toBe("writing");
  } finally {
    Notifications.unsubscribe(sub);
    await Base.connectionHandler.removeConnectionPool(ConnectionTestModel.name);
    await Base.connectionHandler.clearAllConnectionsBang();
  }
});

it("sets pool schema reflection", async () => {
  const pool = makePool();
  await pool.schemaCache.add("posts");
  expect(await pool.schemaCache.isCached("posts")).toBeTruthy();

  pool.schemaReflection = new SchemaReflection("does-not-exist");
  expect(await pool.schemaCache.isCached("posts")).toBeFalsy();

  await pool.schemaCache.add("posts");
  expect(await pool.schemaCache.isCached("posts")).toBeTruthy();
});

it("pool sets connection schema cache", async () => {
  const pool = makePool();
  await pool.schemaCache.add("posts");
  const connection = await pool.checkout();

  await pool.withConnection(async (conn) => {
    expect(conn).not.toBe(connection);

    expect(await connection.schemaCache.size()).toBe(await conn.schemaCache.size());
    expect(await connection.schemaCache.columns("posts")).toBe(
      await conn.schemaCache.columns("posts"),
    );
  });

  pool.checkin(connection);
});

it("connection pool stat", async () => {
  const pool = makeAmbientPool({ pool: 1 });
  try {
    await pool.withConnection(async () => {
      const stats = pool.stat();
      expect(stats).toEqual({
        size: 1,
        connections: 1,
        busy: 1,
        dead: 0,
        idle: 0,
        waiting: 0,
        checkoutTimeout: 0.2,
      });
    });

    let stats = pool.stat();
    expect(stats).toEqual({
      size: 1,
      connections: 1,
      busy: 0,
      dead: 0,
      idle: 1,
      waiting: 0,
      checkoutTimeout: 0.2,
    });

    await assertRaise([ThreadError], {}, async () => {
      await new Thread(async () => {
        await pool.checkout();
        throw new ThreadError();
      }).join();
    });

    stats = pool.stat();
    expect(stats).toEqual({
      size: 1,
      connections: 1,
      busy: 0,
      dead: 1,
      idle: 0,
      waiting: 0,
      checkoutTimeout: 0.2,
    });
  } finally {
    await pool.disconnectBang();
  }
});

it("role and shard is returned", async () => {
  const poolConfig = new PoolConfig(
    new ConnectionDescriptor("primary"),
    makeAmbientDbConfig(),
    "writing",
    "default",
  );
  const pool = new ConnectionPool(poolConfig);
  expect(poolConfig.role).toBe("writing");
  expect(pool.role).toBe("writing");
  expect((await pool.leaseConnection()).role).toBe("writing");

  expect(poolConfig.shard).toBe("default");
  expect(pool.shard).toBe("default");
  expect((await pool.leaseConnection()).shard).toBe("default");

  const readingPoolConfig = new PoolConfig(
    new ConnectionDescriptor("primary"),
    makeAmbientDbConfig(),
    "reading",
    "shard_one",
  );
  const readingPool = new ConnectionPool(readingPoolConfig);

  expect(readingPoolConfig.role).toBe("reading");
  expect(readingPool.role).toBe("reading");
  expect((await readingPool.leaseConnection()).role).toBe("reading");

  expect(readingPoolConfig.shard).toBe("shard_one");
  expect(readingPool.shard).toBe("shard_one");
  expect((await readingPool.leaseConnection()).shard).toBe("shard_one");
});

it("pin connection always returns the same connection", async () => {
  const pool = makePool();
  expect(pool.activeConnection).toBeFalsy();
  await pool.pinConnectionBang(true);
  const pinnedConnection = await pool.checkout();

  expect(pool.activeConnection).toBeFalsy();
  expect(await pool.leaseConnection()).toBe(pinnedConnection);
  expect(pool.activeConnection).toBeTruthy();

  expect(await pool.checkout()).toBe(pinnedConnection);

  pool.releaseConnection();
  expect(pool.activeConnection).toBeFalsy();
  expect(await pool.checkout()).toBe(pinnedConnection);
});

it("pin connection connected?", async () => {
  const pool = makePool();
  expect(pool.isConnected()).toBeFalsy();
  await pool.pinConnectionBang(true);
  expect(pool.isConnected()).toBeTruthy();

  const pinConnection = await pool.checkout();

  await pool.disconnect();
  expect(pool.isConnected()).toBeFalsy();
  expect(await pool.checkout()).toBe(pinConnection);
  expect(pool.isConnected()).toBeTruthy();
});

it("isConnected probes each pooled connection's connected state", async () => {
  const pool = makePool();
  const conn = await pool.checkout();
  await conn.verifyBang();
  expect(pool.isConnected()).toBe(true);
  pool.checkin(conn);
  await conn.disconnectBang();
  expect(pool.connections.length).toBe(1);
  expect(pool.isConnected()).toBe(false);
});

it("pin connection opens a transaction", async () => {
  const pool = makePool();
  expect((await pool.leaseConnection()).currentTransaction()).toBeInstanceOf(NullTransaction);
  await pool.pinConnectionBang(true);
  expect((await pool.leaseConnection()).currentTransaction()).toBeInstanceOf(RealTransaction);
  await pool.unpinConnectionBang();
  expect((await pool.leaseConnection()).currentTransaction()).toBeInstanceOf(NullTransaction);
});

it("unpin connection returns whether transaction has been rolledback", async () => {
  const pool = makePool();
  await pool.pinConnectionBang(true);
  expect(await pool.unpinConnectionBang()).toBe(true);

  await pool.pinConnectionBang(true);
  await (await pool.leaseConnection()).commitTransaction();
  expect(await pool.unpinConnectionBang()).toBe(false);

  await pool.pinConnectionBang(true);
  await (await pool.leaseConnection()).rollbackTransaction();
  expect(await pool.unpinConnectionBang()).toBe(false);
});

it("pin connection nesting", async () => {
  const pool = makePool();
  expect((await pool.leaseConnection()).currentTransaction()).toBeInstanceOf(NullTransaction);
  await pool.pinConnectionBang(true);
  expect((await pool.leaseConnection()).currentTransaction()).toBeInstanceOf(RealTransaction);
  await pool.pinConnectionBang(true);
  expect((await pool.leaseConnection()).currentTransaction()).toBeInstanceOf(SavepointTransaction);
  await pool.unpinConnectionBang();
  expect((await pool.leaseConnection()).currentTransaction()).toBeInstanceOf(RealTransaction);
  await pool.unpinConnectionBang();
  expect((await pool.leaseConnection()).currentTransaction()).toBeInstanceOf(NullTransaction);

  await assertRaises([Error], { match: /There isn't a pinned connection/ }, () =>
    pool.unpinConnectionBang(),
  );
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
  expect(pool.inspect()).toMatch(
    /#<ActiveRecord::ConnectionAdapters::ConnectionPool env_name="\w+" role=:writing>/,
  );

  const readingPool = makeAmbientPool({}, { role: "reading", shard: "shard_one" });

  expect(readingPool.inspect()).toMatch(
    /#<ActiveRecord::ConnectionAdapters::ConnectionPool env_name="\w+" role=:reading shard=:shard_one>/,
  );
});
