import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createPooledTestAdapter,
  _resetPooledTestAdapterForTests,
  type LeasedTestAdapter,
  type TestDatabaseAdapter,
} from "../test-adapter.js";
import { Base } from "../base.js";
import { SQLite3Adapter } from "../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { NullTransaction } from "../connection-adapters/abstract/transaction.js";
import { withTransactionalFixtures } from "./with-transactional-fixtures.js";
import { fixtures } from "../test-fixtures.js";

// Resolve a pool-leased adapter from the primary (schema-loaded) pool rather
// than the divergent sidecar `_pool`. Rails has no sidecar test pool.
async function primaryAdapter(): Promise<TestDatabaseAdapter> {
  return Base.connection;
}

interface AdapterWithExec {
  exec(sql: string): Promise<void>;
  execute(sql: string): Promise<unknown[]>;
}

interface TmHandle {
  transactionManager: {
    beginTransaction(opts: Record<string, unknown>): Promise<unknown>;
    commitTransaction(): Promise<void>;
    rollbackTransaction(): Promise<void>;
    openTransactions: number;
  };
}

describe("withTransactionalFixtures", () => {
  let adapter: TestDatabaseAdapter;
  const a = (): AdapterWithExec => adapter as unknown as AdapterWithExec;

  beforeAll(async () => {
    adapter = await primaryAdapter();
    await a().exec(`DROP TABLE IF EXISTS fixture_users`);
    await a().exec(`CREATE TABLE fixture_users (id INTEGER PRIMARY KEY, name TEXT)`);
  });

  withTransactionalFixtures(() => adapter);

  // These two tests run in order. If the wrap works, the second sees zero
  // rows because the first's INSERT was rolled back by `afterEach`. If it
  // doesn't, the second test sees the row from the first.
  it("inserts a row (first run)", async () => {
    await a().exec(`INSERT INTO fixture_users (id, name) VALUES (1, 'alice')`);
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(1);
  });

  it("sees zero rows because the previous insert rolled back", async () => {
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(0);
  });

  it("pins a connection pool established inside the test body", async () => {
    // Rails pins mid-test pools from its "!connection.active_record" subscriber
    // (test_fixtures.rb:183-200); the notification is emitted by
    // ConnectionHandler#establish_connection (connection_handler.rb:149).
    const pool = Base.connectionHandler.establishConnection(
      { adapter: "sqlite3", database: ":memory:" },
      { ownerName: "MidTestPool" },
    );
    // The subscriber's pin/lease is async, so let its microtasks settle.
    await Promise.resolve();
    await Promise.resolve();
    expect((pool as unknown as { _fixturePin: unknown })._fixturePin).not.toBeNull();
    Base.connectionHandler.removeConnectionPool("MidTestPool");
  });

  it("nested user transaction becomes a savepoint and still rolls back at teardown", async () => {
    const tm = ((await primaryAdapter()) as unknown as TmHandle).transactionManager;
    await tm.beginTransaction({});
    await a().exec(`INSERT INTO fixture_users (id, name) VALUES (2, 'bob')`);
    await tm.commitTransaction();
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(1);
  });

  it("nested transaction commit was a savepoint release, outer still rolls back", async () => {
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(0);
  });
});

// Adapter-cluster files (adapters/postgresql/*.test.ts, etc.) construct a
// raw DatabaseAdapter directly instead of leasing one from a pool (Base.connection
// or createPooledTestAdapter()). The helper must accept that shape —
// `transactionManager` lives on the adapter itself via AbstractAdapter, not
// behind an `innerAdapter` wrapper.
describe("withTransactionalFixtures (raw adapter)", () => {
  let adapter: SQLite3Adapter;
  const exec = (sql: string) => adapter.exec(sql);
  const query = (sql: string) => adapter.execute(sql);

  beforeAll(async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("raw_fixture_users", (t) => {
      t.string("name");
    });
  });

  afterAll(async () => {
    await adapter.close();
  });

  withTransactionalFixtures(() => adapter);

  it("rolls back inserts between tests (first run)", async () => {
    await exec(`INSERT INTO raw_fixture_users (id, name) VALUES (1, 'alice')`);
    const rows = await query(`SELECT * FROM raw_fixture_users`);
    expect(rows).toHaveLength(1);
  });

  it("sees zero rows because the previous insert rolled back", async () => {
    const rows = await query(`SELECT * FROM raw_fixture_users`);
    expect(rows).toHaveLength(0);
  });
});

// Phase C: when the adapter was leased from a real ConnectionPool (i.e.
// produced by `createPooledTestAdapter()`), the helper detects the `.pool`
// back-reference and routes setup/teardown through `pinConnectionBang(false)`
// / `unpinConnectionBang()` rather than the wrapper-direct TM begin/rollback.
// This mirrors Rails test_fixtures.rb:177-184's pin/lease lifecycle exactly.
describe("withTransactionalFixtures (pooled adapter)", () => {
  let adapter: LeasedTestAdapter;
  const exec = (sql: string) =>
    (adapter as unknown as { exec(s: string): Promise<void> }).exec(sql);
  const query = (sql: string) => adapter.execute(sql);

  beforeAll(async () => {
    const handle = await createPooledTestAdapter();
    adapter = handle.adapter;
    await exec(`DROP TABLE IF EXISTS pooled_fixture_users`);
    await exec(`CREATE TABLE pooled_fixture_users (id INTEGER PRIMARY KEY, name TEXT)`);
  });

  afterAll(async () => {
    try {
      await exec(`DROP TABLE IF EXISTS pooled_fixture_users`);
    } finally {
      _resetPooledTestAdapterForTests();
    }
  });

  withTransactionalFixtures(() => adapter);

  it("inserts a row inside the pinned transaction (first run)", async () => {
    await exec(`INSERT INTO pooled_fixture_users (id, name) VALUES (1, 'alice')`);
    const rows = await query(`SELECT * FROM pooled_fixture_users`);
    expect(rows).toHaveLength(1);
  });

  it("sees zero rows because unpinConnectionBang rolled back the previous insert", async () => {
    const rows = await query(`SELECT * FROM pooled_fixture_users`);
    expect(rows).toHaveLength(0);
  });
});

// Concurrency safety-net: two Base.transaction() calls running concurrently
// from unrelated async chains must NOT observe each other's transaction state.
// Base.transaction() routes through withinNewTransaction()/TransactionManager,
// so the test targets that mechanism directly — the invariant boundary is the
// same whether callers go via Base.transaction() or withinNewTransaction().
//
// These adapters come straight from the primary pool (`Base.connection`).
// Pool-backed isolation (each checkout gets its own AsyncLocalStorage context)
// lands at E5; these tests remain skipped until that ships.
describe("concurrency isolation: two concurrent transaction chains stay independent", () => {
  // Skipped at E3: AsyncContext filter removed; pool-backed isolation lands at E5.
  it.skip("chain B sees openTransactions=0 while chain A is mid-transaction", async () => {
    const chainA = (await primaryAdapter()) as unknown as LeasedTestAdapter;
    const chainB = (await primaryAdapter()) as unknown as LeasedTestAdapter;

    // Coordinate so chain B reads state WHILE chain A holds an open transaction.
    // Without coordination, chain B would read before chain A's async TM open,
    // passing vacuously regardless of whether the filter is in place.
    let signalBReady!: () => void;
    let signalADone!: () => void;
    const bReady = new Promise<void>((r) => {
      signalBReady = r;
    });
    const aDone = new Promise<void>((r) => {
      signalADone = r;
    });

    let bObservedOpen = -1;
    let bObservedInTransaction = true;
    let bObservedCurrentTxJoinable = true;

    await Promise.all([
      chainA.withinNewTransaction({ joinable: false }, async () => {
        // Verify chain A genuinely has an open transaction before signalling B,
        // so a vacuous pass (e.g. lazy open) is caught immediately.
        expect(chainA.openTransactions).toBeGreaterThan(0);
        // Transaction is open. Signal chain B to read.
        signalBReady();
        // Hold the transaction open until chain B has read.
        await aDone;
      }),
      (async () => {
        // Wait until chain A is inside a live transaction before reading.
        await bReady;
        try {
          bObservedOpen = chainB.openTransactions;
          bObservedInTransaction = chainB.inTransaction;
          // currentTransaction() returns null (current filter) or NullTransaction
          // (pool isolation, post-E2/E3). Both have joinable===false. Asserting on
          // joinable rather than identity keeps this green through E2–E5.
          const ct = chainB.currentTransaction() as { joinable?: boolean } | null;
          bObservedCurrentTxJoinable = ct?.joinable ?? false;
        } finally {
          // Always unblock chain A so the test fails rather than hangs.
          signalADone();
        }
      })(),
    ]);

    // Chain B must not have observed chain A's transaction state.
    // currentTransaction() is the most critical: Base.transaction() consults
    // it first to decide whether to join a foreign frame.
    expect(bObservedOpen).toBe(0);
    expect(bObservedInTransaction).toBe(false);
    expect(bObservedCurrentTxJoinable).toBe(false);
  });

  // Skipped at E3: AsyncContext filter removed; pool-backed isolation lands at E5.
  it.skip("currentTransaction() returns null for a chain outside any withinNewTransaction", async () => {
    const adapter = (await primaryAdapter()) as unknown as LeasedTestAdapter;
    // Pool-leased adapters return NullTransaction (not null) when no transaction
    // is open — NullTransaction is the Rails-correct sentinel for "no transaction".
    expect(adapter.openTransactions).toBe(0);
    expect(adapter.inTransaction).toBe(false);
    expect(adapter.currentTransaction()).toBeInstanceOf(NullTransaction);
  });
});

describe("the DDL recording window arms around a test's DDL", () => {
  fixtures([]);

  it("runs DDL through the wrapped method", async () => {
    const conn = Base.connection;
    await conn.addIndex("computers", "system", { name: "idx_own_property_restore" });
    await conn.removeIndex("computers", { name: "idx_own_property_restore" });
  });
});

describe("the DDL recording window leaves no own property behind", () => {
  // The `beforeAll` is the only point after the previous block's teardown and
  // before this block's window is armed.
  let ownAddIndex = true;
  const spied: string[] = [];

  beforeAll(async () => {
    const conn = Base.connection as unknown as Record<string, unknown>;
    ownAddIndex = Object.prototype.hasOwnProperty.call(conn, "addIndex");

    const proto = Object.getPrototypeOf(Base.connection) as Record<string, unknown>;
    const original = proto.addIndex;
    proto.addIndex = function (this: unknown, ...args: unknown[]) {
      spied.push(String(args[0]));
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
    try {
      await Base.connection.addIndex("computers", "system", { name: "idx_proto_spy" });
      await Base.connection.removeIndex("computers", { name: "idx_proto_spy" });
    } finally {
      proto.addIndex = original;
    }
  });

  fixtures([]);

  it("restored addIndex by deleting it, not by assigning it back", () => {
    expect(ownAddIndex).toBe(false);
  });

  it("lets a prototype-level spy installed afterwards fire", () => {
    expect(spied).toEqual(["computers"]);
  });
});
