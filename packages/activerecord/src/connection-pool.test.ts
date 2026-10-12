import { it, expect, vi } from "vitest";
import {
  Concurrent,
  Enumerator,
  Mutex,
  Process,
  Timeout,
  block,
  rbObjSingletonClass,
  rbFPublicSend,
  rbFSend,
  rbObjIvarSet,
  registerConstant,
  RuntimeError,
  Thread,
  ThreadError,
} from "@blazetrails/ruby-compat";
import {
  IsolatedExecutionState,
  Notifications,
  NullLock,
  assertRaise,
  assertRaises,
  assertRespondTo,
} from "@blazetrails/activesupport";
import {
  ConnectionNotEstablished,
  ConnectionTimeoutError,
  ExclusiveConnectionTimeoutError,
} from "./errors.js";
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
import { Base } from "./base.js";
import { assertNoQueries } from "./testing/query-assertions.js";
import { load, register } from "./connection-adapters.js";
import { resultFromRowHashes } from "./test-helpers/result-from-row-hashes.js";

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

const activeConnections = (pool: ConnectionPool) => pool.connections.filter((c) => c.isInUse());

async function createPosts(pool: ConnectionPool): Promise<void> {
  if (inMemoryDb()) {
    await pool.withConnection(async (connection) => {
      await connection.createTable("posts", (t) => {
        t.integer("cololumn");
      });
    });
  }
}

function makePool(size: number = 5): ConnectionPool {
  return makeAmbientPool({ pool: size });
}

function newThread<R>(block: () => R): Thread<R> {
  return new Thread(block);
}

function stopThread(): Promise<null> {
  return Thread.stop();
}

function passTo(_thread: Thread): Promise<null> {
  return Thread.pass();
}

async function withSingleConnectionPool(block: (pool: ConnectionPool) => Promise<void>) {
  const pool = makeAmbientPool({ pool: 1 });
  try {
    await block(pool);
  } finally {
    await pool.disconnectBang();
  }
}

class TransactionAwareTestAdapter extends AbstractAdapter implements DatabaseAdapter {
  constructor() {
    super({});
    this._rawConnection = this;
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
    return resultFromRowHashes(await this.execute(sql));
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
    return resultFromRowHashes(await this.execute(sql));
  }
  async execInsert(sql: string, _n?: string | null, _b?: unknown[]) {
    return resultFromRowHashes(await this.execute(sql));
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

registerConstant("TransactionAwareTestAdapter", TransactionAwareTestAdapter);
register("transaction_aware_test", "TransactionAwareTestAdapter");
await load("transaction_aware_test");

function makeTransactionAwarePool(size: number = 5): ConnectionPool {
  return makeAmbientPool({ adapter: "transaction_aware_test", pool: size });
}

it("checkout after close", async () => {
  const pool = makePool();
  const connection = await pool.leaseConnection();
  expect(connection.isInUse()).toBeTruthy();

  await connection.close();
  expect(connection.isInUse()).toBeFalsy();

  expect((await pool.leaseConnection()).isInUse()).toBeTruthy();
});

it("released connection moves between threads", async () => {
  const pool = makePool();
  let threadConn: DatabaseAdapter | null = null;

  await newThread(async () => {
    await pool.withConnection((conn) => {
      threadConn = conn;
    });
  }).join();

  expect(threadConn).toBeTruthy();

  await newThread(async () => {
    await pool.withConnection((conn) => {
      expect(conn).toBe(threadConn);
    });
  }).join();
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
  expect(pool.isActiveConnection()).toBeFalsy();
  const mainThread = await pool.leaseConnection();

  expect(pool.isActiveConnection()).toBeTruthy();

  await mainThread.close();

  expect(pool.isActiveConnection()).toBeFalsy();
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
  await pool.remove(connection);
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
  try {
    const ready = new Concurrent.CountDownLatch();
    await pool.checkout();
    const child = newThread(async () => {
      await pool.checkout();
      await pool.checkout();
      ready.countDown();
      await stopThread();
    });
    while (!(await ready.wait(0))) await passTo(child);

    expect(activeConnections(pool).length).toBe(3);

    child.terminate();
    await child.join();
    await pool.reap();

    expect(activeConnections(pool).length).toBe(1);
  } finally {
    for (const conn of pool.connections) if (conn.isInUse()) await conn.close();
  }
});

it("inactive are returned from dead thread", async () => {
  const pool = makePool();
  try {
    const ready = new Concurrent.CountDownLatch();
    rbObjIvarSet(pool, "@size", 1);

    const child = newThread(async () => {
      await pool.checkout();
      ready.countDown();
      await stopThread();
    });

    while (!(await ready.wait(0))) await passTo(child);

    expect(activeConnections(pool).length).toBe(1);

    child.terminate();
    await child.join();

    await pool.checkout();

    expect(activeConnections(pool).length).toBe(1);
  } finally {
    for (const conn of pool.connections) if (conn.isInUse()) await conn.close();
  }
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
    expect(conn.isInUse()).toBeTruthy();

    const length = pool.connections.length;
    await pool.remove(conn);
    expect(conn.isInUse()).toBeTruthy();
    expect(pool.connections.length).toBe(length - 1);
  } finally {
    await conn.close();
  }
});

it("remove connection for thread", async () => {
  const pool = makePool();
  const conn = await pool.leaseConnection();
  try {
    await pool.remove(conn);
    expect(await pool.leaseConnection()).not.toBe(conn);
  } finally {
    if (conn) await conn.close();
  }
});

it("active connection?", async () => {
  const pool = makePool();
  expect(pool.isActiveConnection()).toBeFalsy();
  expect(await pool.leaseConnection()).toBeTruthy();
  expect(pool.isActiveConnection()).toBeTruthy();
  pool.releaseConnection();
  expect(pool.isActiveConnection()).toBeFalsy();
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

it("checkout fairness", async () => {
  const pool = makePool();
  rbObjIvarSet(pool, "@size", 10);
  const expected = Array.from({ length: pool.size }, (_, i) => i + 1);
  const conns = [];
  for (const _ of expected) conns.push(await pool.checkout());
  const mutex = new Mutex();
  const order: number[] = [];
  const errors: unknown[] = [];
  const disposeHeldConnections = new Concurrent.Event();

  const threads = [];
  for (const i of expected) {
    const t = newThread(async () => {
      try {
        await pool.checkout();
        await mutex.synchronize(() => order.push(i));

        await disposeHeldConnections.wait();
      } catch (e) {
        await mutex.synchronize(() => errors.push(e));
      }
    });
    while (pool.numWaitingInQueue() !== i) await passTo(t);
    threads.push(t);
  }

  for (const conn of conns) {
    pool.checkin(conn);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  disposeHeldConnections.set();
  for (const t of threads) await t.join();

  // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `raise errors.first if errors.any?` (connection_pool_test.rb:462)
  if (errors.length > 0) throw errors[0];

  expect(order).toEqual(expected);
});

it("checkout fairness by group", async () => {
  const pool = makePool();
  rbObjIvarSet(pool, "@size", 10);
  const conns: DatabaseAdapter[] = [];
  for (let i = 1; i <= 10; i++) conns.push(await pool.checkout());
  const mutex = new Mutex();
  const successes: number[] = [];
  const errors: unknown[] = [];
  const disposeHeldConnections = new Concurrent.Event();

  const makeThread = async (i: number) => {
    const t = newThread(async () => {
      try {
        await pool.checkout();
        await mutex.synchronize(() => successes.push(i));

        await disposeHeldConnections.wait();
      } catch (e) {
        await mutex.synchronize(() => errors.push(e));
      }
    });
    while (pool.numWaitingInQueue() !== i) await passTo(t);
    return t;
  };

  const group1 = [];
  for (let i = 1; i <= 5; i++) group1.push(await makeThread(i));
  const group2 = [];
  for (let i = 6; i <= 10; i++) group2.push(await makeThread(i));

  const checkin = (n: number) => {
    for (let k = 0; k < n; k++) {
      const c = conns.pop()!;
      pool.checkin(c);
    }
  };

  checkin(group1.length);

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await mutex.synchronize(() => successes.length + errors.length === group1.length)) break;
  }

  const winners = await mutex.synchronize(() => [...successes]);
  checkin(group2.length);

  disposeHeldConnections.set();
  for (const t of group1) await t.join();
  for (const t of group2) await t.join();

  expect(winners.sort((a, b) => a - b)).toEqual(Array.from(group1, (_, i) => i + 1));

  // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `if errors.any?` (connection_pool_test.rb:528)
  if (errors.length > 0) {
    throw errors[0];
  }
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

  await expect(pool.leaseConnection()).rejects.toThrow(ConnectionNotEstablished);
  await expect(pool.withConnection(() => {})).rejects.toThrow(ConnectionNotEstablished);
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
  await createPosts(pool);
  await pool.schemaCache.add("posts");
  expect(await pool.schemaCache.isCached("posts")).toBeTruthy();

  pool.schemaReflection = new SchemaReflection("does-not-exist");
  expect(await pool.schemaCache.isCached("posts")).toBeFalsy();

  await pool.schemaCache.add("posts");
  expect(await pool.schemaCache.isCached("posts")).toBeTruthy();
});

it("pool sets connection schema cache", async () => {
  const pool = makePool();
  await createPosts(pool);
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

it("concurrent connection establishment", async () => {
  const pool = makePool();
  expect(pool.connections.length).toBeLessThanOrEqual(1);

  const allThreadsInNewConnection = new Concurrent.CountDownLatch(
    pool.size - pool.connections.length,
  );
  const allGo = new Concurrent.CountDownLatch();

  Object.assign(rbObjSingletonClass(pool).prototype, {
    async newConnection(this: ConnectionPool) {
      allThreadsInNewConnection.countDown();
      await allGo.wait();
      return ConnectionPool.prototype.newConnection.call(this);
    },
  });

  const connectingThreads: Thread<unknown>[] = [];
  for (let i = 0; i < pool.size; i++) {
    connectingThreads.push(newThread(() => pool.checkout()));
  }

  try {
    await Timeout.timeout(5, undefined, undefined, async () => {
      await allThreadsInNewConnection.wait();
    });
  } catch (error) {
    if (!(error instanceof Timeout.Error)) throw error;
    expect.fail(
      "pool unable to establish connections concurrently or implementation has " +
        "changed, this test then needs to patch a different :new_connection method",
    );
  } finally {
    allGo.countDown();
    for (const thread of connectingThreads) await thread.join();
  }
});

it("non bang disconnect and clear reloadable connections throw exception if threads dont return their conns", async () => {
  const pool = makePool();
  pool.checkoutTimeout = 0.001;
  for (const groupActionMethod of ["disconnect", "clearReloadableConnections"]) {
    await pool.withConnection(async () => {
      const error = (await assertRaises([ExclusiveConnectionTimeoutError], {}, () =>
        newThread(() => rbFPublicSend(pool, groupActionMethod)).join(),
      )) as ExclusiveConnectionTimeoutError;
      expect(error.connectionPool).toBe(pool);
    });
  }
});

it("disconnect and clear reloadable connections attempt to wait for threads to return their conns", async () => {
  const pool = makePool();
  for (const groupActionMethod of [
    "disconnect",
    "disconnectBang",
    "clearReloadableConnections",
    "clearReloadableConnectionsBang",
  ]) {
    let thread: Thread<unknown> | null = null;
    let timedJoinResult: Thread<unknown> | null = null;
    try {
      await pool.withConnection(async () => {
        thread = newThread(() => rbFSend(pool, groupActionMethod));

        timedJoinResult = await thread.join(0.3);
        expect(timedJoinResult).toBeNull();

        expect(pool.isActiveConnection()).toBeTruthy();
      });
    } finally {
      if (thread && !timedJoinResult) await (thread as Thread<unknown>).join();
    }
  }
});

it("bang versions of disconnect and clear reloadable connections if unable to acquire all connections proceed anyway", async () => {
  const pool = makePool();
  pool.checkoutTimeout = 0.001;

  await pool.withConnection(async () => {
    await newThread(() => pool.disconnectBang()).join();
    expect(pool.isActiveConnection()).toBeFalsy();

    await pool.leaseConnection();
  });
  pool.releaseConnection();

  await pool.withConnection(async () => {
    await newThread(() => pool.clearReloadableConnectionsBang()).join();
    expect(pool.isActiveConnection()).toBeFalsy();

    await pool.leaseConnection();
  });
});

it("disconnect and clear reloadable connections are able to preempt other waiting threads", async () => {
  await withSingleConnectionPool(async (pool) => {
    for (const groupActionMethod of [
      "disconnect",
      "disconnectBang",
      "clearReloadableConnections",
      "clearReloadableConnectionsBang",
    ]) {
      const conn = await pool.leaseConnection();
      const secondThreadDone = new Concurrent.Event();
      let firstThread: Thread<unknown> | undefined;
      let secondThread: Thread<unknown> | undefined;

      try {
        firstThread = newThread(() => pool.withConnection(() => secondThreadDone.wait()));

        while (pool.numWaitingInQueue() !== 1) await passTo(firstThread);

        secondThread = newThread(async () => {
          await rbFSend(pool, groupActionMethod);
          secondThreadDone.set();
        });

        while (pool.numWaitingInQueue() !== 2) await passTo(secondThread);

        pool.checkin(conn);

        expect(
          await secondThread.join(2),
          `${groupActionMethod} is not able to preempt other waiting threads`,
        ).toBeTruthy();
      } finally {
        const failed = !secondThreadDone.isSet();

        if (failed) {
          secondThreadDone.set();

          await firstThread?.join(2);
          await secondThread?.join(2);
        }

        // eslint-disable-next-line no-unsafe-finally -- Ruby's `ensure` raises here (connection_pool_test.rb:772).
        if (!(await firstThread!.join(10))) throw new RuntimeError("first_thread got stuck");
        // eslint-disable-next-line no-unsafe-finally -- Ruby's `ensure` raises here (connection_pool_test.rb:773).
        if (!(await secondThread!.join(10))) throw new RuntimeError("second_thread got stuck");
      }
    }
  });
});

it("clear reloadable connections creates new connections for waiting threads if necessary", async () => {
  await withSingleConnectionPool(async (pool) => {
    const conn = await pool.leaseConnection();
    conn.requiresReloading = () => true;

    const stuckThread = newThread(() => pool.withConnection(() => {}));

    while (pool.numWaitingInQueue() !== 1) await passTo(stuckThread);

    await pool.clearReloadableConnections();

    if (!(await stuckThread.join(2))) {
      expect.fail(
        "clear_reloadable_connections must not let other connection waiting threads get stuck in queue",
      );
    }

    expect(pool.numWaitingInQueue()).toBe(0);
  });
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

it("public connections access threadsafe", async () => {
  const pool = makePool();
  await pool.checkout();
  const conn2 = await pool.checkout();

  const connections = pool.connections;
  let foundConn: DatabaseAdapter | null = null;

  for (let idx = 0; idx < connections.length; idx++) {
    if (connections[idx] === conn2) {
      await newThread(() => pool.remove(conn2)).join();
    }
    foundConn = connections[idx];
  }

  expect(foundConn).not.toBeNull();
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
  expect(pool.isActiveConnection()).toBeFalsy();
  await pool.pinConnectionBang(true);
  const pinnedConnection = await pool.checkout();

  expect(pool.isActiveConnection()).toBeFalsy();
  expect(await pool.leaseConnection()).toBe(pinnedConnection);
  expect(pool.isActiveConnection()).toBeTruthy();

  expect(await pool.checkout()).toBe(pinnedConnection);

  pool.releaseConnection();
  expect(pool.isActiveConnection()).toBeFalsy();
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

it("pin connection synchronize the connection", async () => {
  const pool = makePool();
  await pool.pinConnectionBang(true);
  expect((await pool.leaseConnection()).lock).not.toBe(NullLock);
  await pool.unpinConnectionBang();
  expect((await pool.leaseConnection()).lock).toBe(NullLock);

  await pool.pinConnectionBang(false);
  expect((await pool.leaseConnection()).lock).toBe(NullLock);
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

  await assertRaises([RuntimeError], { match: /There isn't a pinned connection/ }, () =>
    pool.unpinConnectionBang(),
  );
});

it("pin connection nesting lock", async () => {
  const pool = makePool();
  await pool.pinConnectionBang(true);
  const actualLock = (await pool.leaseConnection()).lock;
  expect(actualLock).not.toBe(NullLock);

  await pool.pinConnectionBang(false);
  expect((await pool.leaseConnection()).lock).toBe(actualLock);

  await pool.unpinConnectionBang();
  expect((await pool.leaseConnection()).lock).toBe(actualLock);

  await pool.unpinConnectionBang();
  expect((await pool.leaseConnection()).lock).toBe(NullLock);
});

it("pin connection nesting lock inverse", async () => {
  const pool = makePool();
  await pool.pinConnectionBang(false);

  await pool.pinConnectionBang(true);
  const actualLock = (await pool.leaseConnection()).lock;
  expect(actualLock).not.toBe(NullLock);

  await pool.unpinConnectionBang();
  expect((await pool.leaseConnection()).lock).toBe(actualLock);

  await pool.unpinConnectionBang();
  expect((await pool.leaseConnection()).lock).toBe(NullLock);
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

it("lock thread allow fiber reentrency", async () => {
  const pool = makePool();
  const connection = await pool.checkout();
  connection.setLockThread(IsolatedExecutionState.context());
  await connection.transaction(async () => {
    const enumerator = new Enumerator(
      block(async (yielder: { yield(value: number): unknown }) => {
        await connection.transaction(async () => {
          await yielder.yield(1);
        });
      }),
    );
    expect(await enumerator.next()).toEqual(1);
  });
});
