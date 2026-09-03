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

async function primaryAdapter(): Promise<TestDatabaseAdapter> {
  return Base.connection;
}

interface AdapterWithExec {
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
    await a().execute(`DROP TABLE IF EXISTS fixture_users`);
    await a().execute(`CREATE TABLE fixture_users (id INTEGER PRIMARY KEY, name TEXT)`);
  });

  withTransactionalFixtures(() => adapter);

  it("inserts a row (first run)", async () => {
    await a().execute(`INSERT INTO fixture_users (id, name) VALUES (1, 'alice')`);
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(1);
  });

  it("sees zero rows because the previous insert rolled back", async () => {
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(0);
  });

  it("pins a connection pool established inside the test body", async () => {
    const pool = Base.connectionHandler.establishConnection(
      { adapter: "sqlite3", database: ":memory:" },
      { ownerName: "MidTestPool" },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect((pool as unknown as { _fixturePin: unknown })._fixturePin).not.toBeNull();
    Base.connectionHandler.removeConnectionPool("MidTestPool");
  });

  it("nested user transaction becomes a savepoint and still rolls back at teardown", async () => {
    const tm = ((await primaryAdapter()) as unknown as TmHandle).transactionManager;
    await tm.beginTransaction({});
    await a().execute(`INSERT INTO fixture_users (id, name) VALUES (2, 'bob')`);
    await tm.commitTransaction();
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(1);
  });

  it("nested transaction commit was a savepoint release, outer still rolls back", async () => {
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(0);
  });
});

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

describe("withTransactionalFixtures (pooled adapter)", () => {
  let adapter: LeasedTestAdapter;
  const exec = (sql: string) => adapter.execute(sql);
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

describe("concurrency isolation: two concurrent transaction chains stay independent", () => {
  it.skip("chain B sees openTransactions=0 while chain A is mid-transaction", async () => {
    const chainA = (await primaryAdapter()) as unknown as LeasedTestAdapter;
    const chainB = (await primaryAdapter()) as unknown as LeasedTestAdapter;

    let signalBReady!: () => void;
    let signalADone!: () => void;
    const bReady = new Promise<void>((r) => {
      signalBReady = r;
    });
    const aDone = new Promise<void>((r) => {
      signalADone = r;
    });

    let bObservedOpen = -1;
    let bObservedTransactionOpen = true;
    let bObservedCurrentTxJoinable = true;

    await Promise.all([
      chainA.withinNewTransaction({ joinable: false }, async () => {
        expect(chainA.openTransactions()).toBeGreaterThan(0);
        signalBReady();
        await aDone;
      }),
      (async () => {
        await bReady;
        try {
          bObservedOpen = chainB.openTransactions();
          bObservedTransactionOpen = chainB.isTransactionOpen();
          const ct = chainB.currentTransaction() as { joinable?: boolean } | null;
          bObservedCurrentTxJoinable = ct?.joinable ?? false;
        } finally {
          signalADone();
        }
      })(),
    ]);

    expect(bObservedOpen).toBe(0);
    expect(bObservedTransactionOpen).toBe(false);
    expect(bObservedCurrentTxJoinable).toBe(false);
  });

  it.skip("currentTransaction() returns null for a chain outside any withinNewTransaction", async () => {
    const adapter = (await primaryAdapter()) as unknown as LeasedTestAdapter;
    expect(adapter.openTransactions()).toBe(0);
    expect(adapter.isTransactionOpen()).toBe(false);
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
