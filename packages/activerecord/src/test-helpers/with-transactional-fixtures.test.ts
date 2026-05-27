import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  adapterType,
  createPooledTestAdapter,
  createSidecarTestAdapter,
  createTestAdapter,
  _resetPooledTestAdapterForTests,
  type SidecarAdapter,
  type TestDatabaseAdapter,
} from "../test-adapter.js";
import { snapshotDdlTrackers } from "./ddl-tracker.js";
import { shouldSkipGlobalReset } from "./skip-global-reset.js";
import { SQLite3Adapter } from "../connection-adapters/sqlite3-adapter.js";
import { defineSchema } from "./define-schema.js";
import { withTransactionalFixtures } from "./with-transactional-fixtures.js";

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
    const tm = (createSidecarTestAdapter().adapter as unknown as TmHandle).transactionManager;
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
    const tm = (createSidecarTestAdapter().adapter as unknown as TmHandle).transactionManager;
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

  // Direct-adapter reads (`adapter.columns(...)`) bypass SchemaCache —
  // SQLite3Adapter#columns runs PRAGMA against the live DB. To actually
  // exercise `schemaCache.clear()`, populate the cache directly via
  // `setColumns` (simulating how Model.loadSchema warms it in real
  // adapter use) and then assert `isColumnsHashCached` flips false
  // after rollback.
  it("warming the schema cache inside a test leaves it populated", async () => {
    await adapter.addColumn("cache_inval_users", "extra", "string");
    const cols = await adapter.columns("cache_inval_users");
    adapter.schemaCache.setColumns("cache_inval_users", cols);
    expect(adapter.schemaCache.isColumnsHashCached(adapter.pool, "cache_inval_users")).toBe(true);
  });

  it("next test sees an empty schema cache because afterEach cleared it", async () => {
    // Without `schemaCache.clear()` in the helper, this would be true —
    // the cached hash from the previous test would still report the
    // rolled-back `extra` column.
    expect(adapter.schemaCache.isColumnsHashCached(adapter.pool, "cache_inval_users")).toBe(false);
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
    // short-circuit on the cached signature without recreating the
    // table. On SQLite `adapter.columns()` against a missing table
    // returns `[]` (PRAGMA table_info on an unknown name yields no
    // rows), so the bug would surface as an empty column list — not a
    // throw.
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

// DDL inside an it() body updates the module-level `_createdTables` /
// `_createdColumns` trackers (via `recordDdlTracking` in the
// `SchemaAdapter` wrapper). The outer transaction rolls back the DDL on
// the DB side; the helper restores the trackers to their pre-test
// snapshot so a follow-up `defineSchema` call can correctly recreate the
// rolled-back table.
//
// Skipped on MySQL/MariaDB: the helper's docs flag DDL inside `it()` as
// undefined behavior there (DDL implicitly commits and escapes the
// wrap). Running this describe against MySQL would leak the table into
// the live schema. SQLite + PG (which do transactional DDL) cover the
// behavior under test.
describe.skipIf(adapterType === "mysql")(
  "withTransactionalFixtures (DDL tracker invalidation)",
  () => {
    let adapter: TestDatabaseAdapter;
    let outerTables: Set<string>;

    beforeAll(async () => {
      adapter = createTestAdapter();
      // Register an outer-scope table so the snapshot has at least one
      // entry to preserve across rollback — without this, the
      // preservation assertion below would be vacuous.
      await defineSchema(adapter, { ddl_tracker_outer: { name: "string" } });
      outerTables = snapshotDdlTrackers().tables;
      expect(outerTables.has("ddl_tracker_outer")).toBe(true);
    });

    withTransactionalFixtures(() => adapter);

    it("createTable inside a test populates the tables tracker", async () => {
      await (adapter as unknown as AdapterWithExec).exec(
        `CREATE TABLE ddl_tracker_inner (id INTEGER PRIMARY KEY)`,
      );
      const tables = snapshotDdlTrackers().tables;
      expect(tables.has("ddl_tracker_inner")).toBe(true);
      expect(tables.has("ddl_tracker_outer")).toBe(true);
    });

    it("next test sees the inner tracker reset but outer entries preserved", () => {
      const tables = snapshotDdlTrackers().tables;
      expect(tables.has("ddl_tracker_inner")).toBe(false);
      expect(tables.has("ddl_tracker_outer")).toBe(true);
      for (const t of outerTables) expect(tables.has(t)).toBe(true);
    });
  },
);

// When `invalidateSchemaCache: false`, the helper skips `schemaCache.clear()`
// in afterEach. Cached column reflection survives across tests — pay this
// cost only when the file does pure DML.
describe("withTransactionalFixtures (invalidateSchemaCache: false)", () => {
  let adapter: SQLite3Adapter;

  beforeAll(async () => {
    adapter = new SQLite3Adapter(":memory:");
    await defineSchema(adapter, { opt_out_cache_users: { name: "string" } });
  });

  afterAll(async () => {
    await adapter.close();
  });

  withTransactionalFixtures(() => adapter, { invalidateSchemaCache: false });

  it("warming the schema cache leaves it populated", async () => {
    const cols = await adapter.columns("opt_out_cache_users");
    adapter.schemaCache.setColumns("opt_out_cache_users", cols);
    expect(adapter.schemaCache.isColumnsHashCached(adapter.pool, "opt_out_cache_users")).toBe(true);
  });

  it("next test still sees the cached columns because the opt-out skipped clear()", () => {
    expect(adapter.schemaCache.isColumnsHashCached(adapter.pool, "opt_out_cache_users")).toBe(true);
  });
});

// Phase C: when the adapter was leased from a real ConnectionPool (i.e.
// produced by `createPooledTestAdapter()`), the helper detects the `.pool`
// back-reference and routes setup/teardown through `pinConnectionBang(false)`
// / `unpinConnectionBang()` rather than the wrapper-direct TM begin/rollback.
// This mirrors Rails test_fixtures.rb:177-184's pin/lease lifecycle exactly.
describe("withTransactionalFixtures (pooled adapter)", () => {
  let adapter: SidecarAdapter;
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
// Today this passes because SidecarFixtures._txVisible() gates
// currentTransaction()/inTransaction/openTransactions behind the AsyncContext
// flag set by withinNewTransaction(). E2/E3 delete that filter; E5 rewires
// createSidecarTestAdapter() through the pool so each chain's checkout
// provides natural isolation. This test must remain green through E2–E5 in
// sequence: E2/E3 without E5 would break it (shared adapter, no filter).
//
// The test documents the invariant so regressions are caught immediately.
describe("concurrency isolation: two concurrent transaction chains stay independent", () => {
  it("chain B sees openTransactions=0 while chain A is mid-transaction", async () => {
    const { fixtures: sidecarA } = createSidecarTestAdapter();
    const { fixtures: sidecarB } = createSidecarTestAdapter();

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
      sidecarA.withinNewTransaction({ joinable: false }, async () => {
        // Verify chain A genuinely has an open transaction before signalling B,
        // so a vacuous pass (e.g. lazy open) is caught immediately.
        expect(sidecarA.adapter.openTransactions).toBeGreaterThan(0);
        // Transaction is open. Signal chain B to read.
        signalBReady!();
        // Hold the transaction open until chain B has read.
        await aDone;
      }),
      (async () => {
        // Wait until chain A is inside a live transaction before reading.
        await bReady;
        try {
          bObservedOpen = sidecarB.openTransactions;
          bObservedInTransaction = sidecarB.inTransaction;
          // currentTransaction() returns null (current filter) or NullTransaction
          // (pool isolation, post-E2/E3). Both have joinable===false. Asserting on
          // joinable rather than identity keeps this green through E2–E5.
          const ct = sidecarB.currentTransaction() as { joinable?: boolean } | null;
          bObservedCurrentTxJoinable = ct?.joinable ?? false;
        } finally {
          // Always unblock chain A so the test fails rather than hangs.
          signalADone!();
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

  it("currentTransaction() returns null for a chain outside any withinNewTransaction", () => {
    const { fixtures } = createSidecarTestAdapter();
    expect(fixtures.currentTransaction()).toBeNull();
  });
});
