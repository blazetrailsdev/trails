import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createTestAdapter,
  shouldSkipGlobalReset,
  type TestDatabaseAdapter,
} from "../test-adapter.js";
import { SQLite3Adapter } from "../connection-adapters/sqlite3-adapter.js";
import { defineSchema } from "./define-schema.js";
import { withTransactionalFixtures } from "./with-transactional-fixtures.js";

interface AdapterWithExec {
  exec(sql: string): Promise<void>;
  execute(sql: string): Promise<unknown[]>;
  innerAdapter: {
    transactionManager: {
      beginTransaction(opts: Record<string, unknown>): Promise<unknown>;
      commitTransaction(): Promise<void>;
    };
  };
}

describe("withTransactionalFixtures", () => {
  let adapter: TestDatabaseAdapter;
  const a = (): AdapterWithExec => adapter as unknown as AdapterWithExec;

  beforeAll(async () => {
    adapter = createTestAdapter();
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

  it("nested user transaction becomes a savepoint and still rolls back at teardown", async () => {
    await a().innerAdapter.transactionManager.beginTransaction({});
    await a().exec(`INSERT INTO fixture_users (id, name) VALUES (2, 'bob')`);
    await a().innerAdapter.transactionManager.commitTransaction();
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(1);
  });

  it("nested transaction commit was a savepoint release, outer still rolls back", async () => {
    const rows = await a().execute(`SELECT * FROM fixture_users`);
    expect(rows).toHaveLength(0);
  });
});

// Mirrors Rails' per-class `self.use_transactional_tests = false`
// (test_fixtures.rb:34, 108): when the flag is false, transactional
// fixtures deactivate and the file falls back to the legacy global reset.
describe("withTransactionalFixtures (useTransactionalTests=false opt-out)", () => {
  let adapter: TestDatabaseAdapter;
  const a = (): AdapterWithExec => adapter as unknown as AdapterWithExec;

  // Exercises the supported integration: defineSchema(..., { useTransactionalTests: false })
  // sets the per-adapter flag, then withTransactionalFixtures reads it in
  // its beforeAll (registered next, so user's beforeAll runs first).
  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(
      adapter,
      { optout_marker: { name: "string" } },
      { useTransactionalTests: false },
    );
  });

  withTransactionalFixtures(() => adapter);

  // The helper is inactive — it must not open a transaction in beforeEach.
  // If the helper were active, its beforeEach would have opened the outer
  // tx and our manual beginTransaction would nest as a savepoint
  // (openTransactions==2); when inactive, openTransactions==1 after our
  // manual begin.
  it("does not open a transaction in beforeEach when opted out", async () => {
    const tm = a().innerAdapter.transactionManager as unknown as {
      openTransactions: number;
      beginTransaction(opts: Record<string, unknown>): Promise<unknown>;
      rollbackTransaction(): Promise<void>;
    };
    expect(tm.openTransactions).toBe(0);
    await tm.beginTransaction({});
    expect(tm.openTransactions).toBe(1);
    await tm.rollbackTransaction();
  });

  it("does not push the global-reset skip when opted out", () => {
    // When useTransactionalTests=false, the helper must not call
    // pushSkipGlobalReset — otherwise opted-out files would silently
    // bypass the global resetTestAdapterState beforeEach they rely on.
    expect(shouldSkipGlobalReset()).toBe(false);
  });
});

// DDL executed inside an it() body populates the adapter's SchemaCache.
// The outer-transaction rollback reverts the DDL at the DB level, but the
// cache entries it produced would otherwise survive into the next test —
// reporting columns that no longer exist. The helper's afterEach calls
// schemaCache.clear() after rollback to keep that in-memory reflection in
// sync with the rolled-back DB.
describe("withTransactionalFixtures (schema-cache invalidation)", () => {
  let adapter: SQLite3Adapter;

  beforeAll(async () => {
    adapter = new SQLite3Adapter(":memory:");
    await defineSchema(adapter, { cache_inval_users: { name: "string" } });
  });

  afterAll(async () => {
    await adapter.close();
  });

  withTransactionalFixtures(() => adapter);

  it("addColumn inside a test populates the schema cache", async () => {
    await adapter.addColumn("cache_inval_users", "extra", "string");
    const cols = await adapter.columns("cache_inval_users");
    expect(cols.map((c) => c.name)).toContain("extra");
  });

  it("next test does not see the rolled-back column in the cache", async () => {
    const cols = await adapter.columns("cache_inval_users");
    expect(cols.map((c) => c.name)).not.toContain("extra");
  });
});

// Parallel to schemaCache: defineSchema maintains its own per-adapter
// signature WeakMap so repeated `defineSchema(adapter, sameSpec)` is a
// no-op. If a test runs `defineSchema(...)` inside an `it()` body, the
// rolled-back table at the DB would otherwise be paired with a stale
// signature entry — the next test's `defineSchema` would think the table
// still exists and skip recreating it.
describe("withTransactionalFixtures (defineSchema signature cache invalidation)", () => {
  let adapter: SQLite3Adapter;

  beforeAll(async () => {
    adapter = new SQLite3Adapter(":memory:");
  });

  afterAll(async () => {
    await adapter.close();
  });

  withTransactionalFixtures(() => adapter);

  it("defineSchema inside a test populates the signature cache", async () => {
    await defineSchema(adapter, { defsig_table: { name: "string" } });
    const cols = await adapter.columns("defsig_table");
    expect(cols.map((c) => c.name).sort()).toEqual(["id", "name"]);
  });

  it("next test re-runs defineSchema and the rolled-back table is recreated", async () => {
    // If the signature cache hadn't been cleared, `defineSchema` would
    // short-circuit on the cached signature and `columns()` below would
    // throw because the table was rolled back at the DB.
    await defineSchema(adapter, { defsig_table: { name: "string" } });
    const cols = await adapter.columns("defsig_table");
    expect(cols.map((c) => c.name).sort()).toEqual(["id", "name"]);
  });
});

// The signature-cache invalidation must NOT discard entries created
// outside the rolled-back test transaction (e.g. tables registered in
// `beforeAll`). For raw adapters, defineSchema treats a missing
// signature as "table doesn't exist" — wiping the whole map would cause
// a follow-up `defineSchema(adapter, sameSpec)` to CREATE TABLE over
// the still-existing beforeAll table and fail.
describe("withTransactionalFixtures (preserves beforeAll signatures across rollback)", () => {
  let adapter: SQLite3Adapter;

  beforeAll(async () => {
    adapter = new SQLite3Adapter(":memory:");
    // Outer-transaction table — must survive rollback in afterEach.
    await defineSchema(adapter, { outer_table: { name: "string" } });
  });

  afterAll(async () => {
    await adapter.close();
  });

  withTransactionalFixtures(() => adapter);

  it("test adds an inner table via defineSchema", async () => {
    await defineSchema(adapter, {
      outer_table: { name: "string" },
      inner_table: { label: "string" },
    });
  });

  it("next test re-calls defineSchema with the same beforeAll spec — must be a no-op", async () => {
    // If the signature cache were fully wiped, this call would treat
    // outer_table as new and try to CREATE TABLE over the live table.
    await defineSchema(adapter, { outer_table: { name: "string" } });
    const cols = await adapter.columns("outer_table");
    expect(cols.map((c) => c.name).sort()).toEqual(["id", "name"]);
  });
});

// Adapter-cluster files (adapters/postgresql/*.test.ts, etc.) construct a
// raw DatabaseAdapter directly instead of going through createTestAdapter().
// The helper must accept that shape — `transactionManager` lives on the
// adapter itself via AbstractAdapter, not behind an `innerAdapter` wrapper.
describe("withTransactionalFixtures (raw adapter)", () => {
  let adapter: SQLite3Adapter;
  const exec = (sql: string) => adapter.exec(sql);
  const query = (sql: string) => adapter.execute(sql);

  beforeAll(async () => {
    adapter = new SQLite3Adapter(":memory:");
    await defineSchema(adapter, { raw_fixture_users: { name: "string" } });
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
