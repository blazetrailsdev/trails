/**
 * trails-specific transaction invariants with no Rails counterpart.
 *
 * These guard behaviour that exists only in the trails port — the
 * TransactionManager#after_failure_actions PreparedStatementCacheExpired
 * handling, the SchemaAdapter→TM delegation path, and the
 * rememberTransactionRecordState / restoreTransactionRecordState identity
 * machinery. They were relocated verbatim out of transactions.test.ts (which
 * mirrors transactions_test.rb) so the convention file tracks Rails 1:1.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Base, transaction } from "./index.js";
import { NullTransaction } from "./connection-adapters/abstract/transaction.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { AbstractSQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";
import { AbstractAdapter } from "./index.js";

// Internal record state poked by the rememberTransactionRecordState /
// rolledbackBang guards below; not part of Base's public surface.
type StartTransactionState = { level: number; attributes: unknown } | null;
interface TxRecordInternals {
  _newRecord: boolean;
  changesApplied(): void;
  writeAttribute(name: string, value: unknown): void;
  readAttribute(name: string): unknown;
  _startTransactionState: StartTransactionState;
  _dirty: {
    changed: boolean;
    mutationsFromDatabase: Record<string, unknown>;
    attributeChanged(name: string): boolean;
    attributeWas(name: string): unknown;
  };
}

// The wrapper adapter exposes currentTransaction() at runtime but not on the
// public DatabaseAdapter type; narrow to just the member these guards read.
interface AdapterTxView {
  currentTransaction?(): unknown;
}

const openAdapters: AbstractSQLite3Adapter[] = [];

function makeSQLiteTopic() {
  const adp = new BetterSQLite3Adapter(":memory:");
  openAdapters.push(adp);
  adp.exec(
    "CREATE TABLE topics (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, approved INTEGER DEFAULT 0)",
  );
  class Topic extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("title", "string");
      this.attribute("approved", "boolean");
      this.adapter = adp;
    }
  }
  return { Topic, adapter: adp };
}

afterEach(async () => {
  for (const a of openAdapters.splice(0)) {
    try {
      await a.exec("DROP TABLE IF EXISTS topics");
    } catch {
      /* adapter may already be closed */
    }
    a.close();
  }
});

describe("TransactionTest", () => {
  fixtures({}, { useTransactionalTests: false });

  beforeAll(async () => {
    // Re-lay the canonical `topics` on the handler connection (drop-and-recreate,
    // mirroring schema.rb's `create_table :topics`) so this file's signature
    // cache is primed and a bespoke `topics` left behind by a sibling file can't
    // shadow the CanonicalTopic model's shape. `topics` is boot-owned canonical,
    // so it is not torn down (the boot schema owns/restores its shape).

    await Base.connection.createTable("topics", { force: true }, (t) => {
      t.string("title", { limit: 250 });
      t.string("author_name");
      t.string("author_email_address");
      t.datetime("written_on");
      t.time("bonus_time");
      t.date("last_read");
      t.text("content");
      t.text("important");
      t.binary("binary_content");
      t.boolean("approved", { default: true });
      t.integer("replies_count", { default: 0 });
      t.integer("unique_replies_count", { default: 0 });
      t.integer("parent_id");
      t.string("parent_title");
      t.string("type");
      t.string("group");
      t.timestamps({ null: true });
      t.index(["author_name", "title"]);
    });
  });

  // trails-extra: a block-arg `tx.afterCommit(...)` registered on the explicit
  // `transaction(Model, (tx) => ...)` handle fires once the transaction commits.
  // No Rails counterpart (Rails registers commit callbacks on the model, not the
  // transaction handle); guards the standalone block-arg callback wiring — the
  // rollback twin is covered in transaction-callbacks.test.ts.
  it("block-arg tx.afterCommit fires after the transaction commits", async () => {
    const log: string[] = [];

    await transaction(CanonicalTopic, async (tx) => {
      tx.afterCommit(() => {
        log.push("committed");
      });
      await CanonicalTopic.create({ title: "Alice" });
    });

    expect(log).toEqual(["committed"]);
  });

  describe("after_failure_actions on PreparedStatementCacheExpired", () => {
    // Mirrors Rails' TransactionManager#after_failure_actions: when a
    // transaction fails with PreparedStatementCacheExpired we must drop
    // cached prepared statements on the connection. The error itself
    // re-raises unchanged — Rails does NOT retry the body.
    // A shared afterEach restores spies so a mid-test throw can't leak
    // mocks into later tests.
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("calls clearCacheBang and re-raises when the body throws the expired error", async () => {
      const { PreparedStatementCacheExpired } = await import("./errors.js");
      // The TM's _connection is a pooled adapter instance; spy on the prototype
      // to catch any adapter call regardless of which pool slot is active.
      const spy = vi.spyOn(
        AbstractAdapter.prototype as unknown as Required<DatabaseAdapter>,
        "clearCacheBang",
      );
      await expect(
        transaction(CanonicalTopic, async () => {
          throw new PreparedStatementCacheExpired("cached plan expired");
        }),
      ).rejects.toBeInstanceOf(PreparedStatementCacheExpired);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("does not call clearCacheBang for unrelated errors", async () => {
      const spy = vi.spyOn(
        AbstractAdapter.prototype as unknown as Required<DatabaseAdapter>,
        "clearCacheBang",
      );
      await expect(
        transaction(CanonicalTopic, async () => {
          throw new Error("unrelated");
        }),
      ).rejects.toThrow("unrelated");
      expect(spy).not.toHaveBeenCalled();
    });

    // The "after_failure_actions" tests above run on the handler adapter (D-1),
    // which takes the TM path. They cover SchemaAdapter→TM delegation by
    // spying on AbstractAdapter.prototype.clearCacheBang. The test below covers
    // the pure-TM path directly, against a hand-rolled TransactionManager
    // with no SchemaAdapter wrapper — guards against TM-internal regressions
    // independently of the wrapper.
    it("calls clearCacheBang via TransactionManager.withinNewTransaction", async () => {
      const { PreparedStatementCacheExpired } = await import("./errors.js");
      const { TransactionManager } = await import("./connection-adapters/abstract/transaction.js");
      const clearCacheBang = vi.fn();
      const conn = {
        clearCacheBang,
        beginDbTransaction: vi.fn(),
        commitDbTransaction: vi.fn(),
        rollbackDbTransaction: vi.fn(),
        supportsLazyTransactions: () => false,
        supportsRestartDbTransaction: () => false,
        addTransactionRecord: vi.fn(),
        active: true,
      };
      const tm = new TransactionManager(conn as never);
      await expect(
        tm.withinNewTransaction({}, () => {
          throw new PreparedStatementCacheExpired("cached plan expired");
        }),
      ).rejects.toBeInstanceOf(PreparedStatementCacheExpired);
      expect(clearCacheBang).toHaveBeenCalledTimes(1);
    });

    // Rails-fidelity guard: TransactionManager#after_failure_actions only
    // fires for RealTransaction frames (abstract/transaction.rb:670 —
    // `return unless transaction.is_a?(RealTransaction)`). Savepoints
    // don't drop the underlying connection's cached plans, so clearing
    // them on a savepoint failure would be wasted work (and on PG would
    // pointlessly DEALLOCATE the outer-txn cache).
    it("does not call clearCacheBang for SavepointTransaction failures (RealTransaction-only guard)", async () => {
      const { PreparedStatementCacheExpired } = await import("./errors.js");
      const { TransactionManager } = await import("./connection-adapters/abstract/transaction.js");
      const clearCacheBang = vi.fn();
      const conn = {
        clearCacheBang,
        beginDbTransaction: vi.fn(),
        commitDbTransaction: vi.fn(),
        rollbackDbTransaction: vi.fn(),
        rollbackToSavepoint: vi.fn(),
        releaseSavepoint: vi.fn(),
        createSavepoint: vi.fn(),
        supportsLazyTransactions: () => false,
        supportsRestartDbTransaction: () => false,
        addTransactionRecord: vi.fn(),
        active: true,
      };
      const tm = new TransactionManager(conn as never);
      // Force inner frame to SavepointTransaction (not
      // RestartParentTransaction): outer must be non-restartable, which
      // requires `joinable: false`.
      await expect(
        tm.withinNewTransaction({ joinable: false }, async () => {
          await tm.withinNewTransaction({}, () => {
            throw new PreparedStatementCacheExpired("inner savepoint plan miss");
          });
        }),
      ).rejects.toBeInstanceOf(PreparedStatementCacheExpired);
      // Inner savepoint frame raised — guard skipped clear. Outer
      // frame also raised (PSCE bubbled), is a RealTransaction, so
      // clear fires exactly once for the outer.
      expect(clearCacheBang).toHaveBeenCalledTimes(1);
    });
  });
});

describe("savepoint statements dirty the current transaction (trails ensure relocation)", () => {
  // trails-specific: mysql2/PG/sqlite internalExecute run materializeTransactions
  // OUTSIDE withRawConnection, so Rails' `ensure dirty_current_transaction if
  // materialize_transactions` (abstract_adapter.rb:1046) is relocated to
  // internalExecute's own finally. A savepoint statement (materialize:true, per
  // savepoints.rb:11-20) therefore dirties the current transaction — the PARENT
  // frame for a RELEASE/ROLLBACK TO SAVEPOINT whose committing frame was already
  // popped — so isRestorable() refuses to restore a parent whose child savepoint
  // op may have partially executed after a reconnect. Exercised here on sqlite
  // (which shares the internalExecute finally); the mysql2/PG paths are the same.
  it("createSavepoint dirties the current (parent) transaction frame", async () => {
    const { adapter } = makeSQLiteTopic();
    const tm = adapter.transactionManager;
    await tm.withinNewTransaction({}, async () => {
      // BEGIN is emitted with materializeTransactions:false, so the frame is
      // materialized but clean.
      await tm.materializeTransactions();
      expect(tm.isRestorable()).toBe(true);
      await adapter.createSavepoint("sp1");
      expect(tm.isRestorable()).toBe(false);
    });
  });

  it("a savepoint statement failing mid-flight still dirties the parent (ensure fires on the error path)", async () => {
    const { adapter } = makeSQLiteTopic();
    const tm = adapter.transactionManager;
    await tm.withinNewTransaction({}, async () => {
      await tm.materializeTransactions();
      expect(tm.isRestorable()).toBe(true);
      // Simulate a reconnect/connection-loss mid savepoint op: the raw driver
      // rejects, the statement throws — and internalExecute's finally must still
      // dirty the parent, mirroring Rails' `ensure` firing on the raise path.
      const driver = (adapter as unknown as { driver: { exec: (s: string) => Promise<unknown> } })
        .driver;
      const spy = vi
        .spyOn(driver, "exec")
        .mockRejectedValueOnce(new Error("server closed the connection unexpectedly"));
      await expect(adapter.rollbackToSavepoint("sp_x")).rejects.toThrow();
      spy.mockRestore();
      expect(tm.isRestorable()).toBe(false);
    });
  });
});

describe("rememberTransactionRecordState / restoreTransactionRecordState (Story K)", () => {
  it("rememberTransactionRecordState populates _startTransactionState with level and attributes", async () => {
    const { rememberTransactionRecordState } = await import("./transactions.js");
    const { Topic } = makeSQLiteTopic();
    const topic = new Topic({ title: "before" });
    const internals = topic as unknown as TxRecordInternals;
    internals._newRecord = false;

    rememberTransactionRecordState.call(topic);

    const state = internals._startTransactionState;
    expect(state).not.toBeNull();
    expect(state?.level).toBe(1);
    expect(state?.attributes).toBeDefined();
    // Second call increments level, does not overwrite attributes snapshot
    rememberTransactionRecordState.call(topic);
    expect(internals._startTransactionState?.level).toBe(2);
  });

  it("rolledbackBang restores identity and clears mutation tracking", async () => {
    const { rolledbackBang, rememberTransactionRecordState } = await import("./transactions.js");
    const { Topic } = makeSQLiteTopic();
    const topic = new Topic({ title: "original" });
    const internals = topic as unknown as TxRecordInternals;
    internals._newRecord = false;
    // A new record is dirty against its defaults (Rails parity); persisting
    // clears that. Mark the constructed-as-persisted record clean so "original"
    // is the pre-TX baseline, not a construction-time change.
    internals.changesApplied();

    rememberTransactionRecordState.call(topic);
    internals.writeAttribute("title", "changed-during-tx");

    await rolledbackBang.call(topic, {
      forceRestoreState: true,
      shouldRunCallbacks: false,
    });

    expect(internals._startTransactionState).toBeNull();
    // In-TX user edit preserved: "changed-during-tx" stays live in memory,
    // "original" (pre-TX) is the dirty baseline. Mirrors Rails' attribute
    // reconstruction via attr.with_value_from_user(current_value).
    expect(internals.readAttribute("title")).toBe("changed-during-tx");
    expect(internals._dirty.mutationsFromDatabase).toEqual({
      title: ["original", "changed-during-tx"],
    });
  });
});

// ==========================================================================
// Story K-followup regression tests
// ==========================================================================
describe("DirtyTracker.redetectChanges after rollback (Story K-followup)", () => {
  it("rollback preserves in-TX user edits as dirty", async () => {
    const { rememberTransactionRecordState, rolledbackBang } = await import("./transactions.js");
    const { Topic } = makeSQLiteTopic();
    const topic = new Topic({ title: "original" });
    const internals = topic as unknown as TxRecordInternals;
    internals._newRecord = false;
    internals.changesApplied();

    rememberTransactionRecordState.call(topic);
    internals.writeAttribute("title", "tx-edit");

    await rolledbackBang.call(topic, {
      forceRestoreState: true,
      shouldRunCallbacks: false,
    });

    // Post-TX value stays live in memory; pre-TX value becomes the dirty baseline.
    // Mirrors Rails: attr.with_value_from_user keeps current value, pre-TX as original.
    expect(internals.readAttribute("title")).toBe("tx-edit");
    expect(internals._dirty.attributeChanged("title")).toBe(true);
    expect(internals._dirty.attributeWas("title")).toBe("original");
    expect(internals._dirty.mutationsFromDatabase).toEqual({
      title: ["original", "tx-edit"],
    });
  });

  it("rollback leaves clean attributes unchanged (no spurious dirty)", async () => {
    const { rememberTransactionRecordState, rolledbackBang } = await import("./transactions.js");
    const { Topic } = makeSQLiteTopic();
    const topic = new Topic({ title: "original" });
    const internals = topic as unknown as TxRecordInternals;
    internals._newRecord = false;
    internals.changesApplied();

    rememberTransactionRecordState.call(topic);
    // No attribute writes during TX

    await rolledbackBang.call(topic, {
      forceRestoreState: true,
      shouldRunCallbacks: false,
    });

    expect(internals._dirty.changed).toBe(false);
    expect(internals._dirty.mutationsFromDatabase).toEqual({});
  });
});

// ==========================================================================
// SchemaAdapter TM delegation regression test (Phase 1)
// ==========================================================================
describe("SchemaAdapter TM delegation", () => {
  // These tests read `Base.connection` directly (Rails' counterparts run under
  // ActiveRecord::TestCase, which has an established base connection before the
  // body calls lease_connection). This is a separate top-level describe from
  // TransactionTest, so bootstrap the handler here rather than depending on a
  // sibling describe having run first. Non-transactional: these tests commit
  // rows to `items` and clean up in afterAll (Rails `use_transactional_tests`
  // is not in play here).
  fixtures({}, { useTransactionalTests: false });
  // Tests here spy on `Base.connection`; without local restore, spies leak
  // into the next test in this file.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // These tests create rows in the shared `items` table (via `Base.connection`)
  // outside of any transactional rollback guard. In PG, adapters
  // pointing at the same database share the create-table signature cache, so a
  // later file's canonical schema load is a cache hit and does NOT drop the
  // table — leaving these rows visible to tests in other files (e.g. the
  // `EachTest > findEach yields each record` case in batches.test.ts which
  // expects an empty items table). Clean up unconditionally after all tests here.
  afterAll(async () => {
    await Base.connection.executeMutation("DELETE FROM items");
  });

  // SchemaAdapter.setup() calls execDdlWithSavepoint which issues
  // this.inner.createSavepoint directly — bypassing TM intentionally.
  // After Phase 1, TM may have an open frame when setup() fires inside a
  // test transaction. This test confirms that:
  //   1. SchemaAdapter routes transaction() through TM.
  //   2. setup() triggered inside a transaction (via DDL recovery) doesn't
  //      interfere with the enclosing SavepointTransaction: TM's commit()
  //      releases the SavepointTransaction's own savepoint name, not the
  //      already-released DDL savepoints.
  //
  // DDL savepoints are released eagerly (releaseSavepoint right after exec);
  // TM does not track them and never tries to release them again.
  it("transaction() routes SchemaAdapter through TM (spy on inner.withinNewTransaction)", async () => {
    // The model runs on `Base.connection`; spy on that same adapter — it's what
    // TM dispatches `withinNewTransaction` against.
    const testAdapter = Base.connection;
    // Re-lay canonical `items` (drop-and-recreate, mirroring schema.rb's
    // `create_table :items`) to prime the signature cache. `items` is a
    // boot-owned canonical table, so it is not torn down here (the describe's
    // afterAll clears rows; the boot schema owns/restores the shape).
    // eslint-disable-next-line blazetrails/require-table-teardown
    await testAdapter.createTable("items", { force: true }, (t) => {
      t.column("name", "string");
    });
    const realAdapter = Base.connection;
    const spy = vi.spyOn(realAdapter, "withinNewTransaction");
    class Item extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = testAdapter;
      }
    }
    await transaction(Item, async () => {
      await Item.create({ name: "tm-path" });
    });
    expect(spy).toHaveBeenCalled();
  });

  it("requiresNew nested transaction uses SavepointTransaction on top of outer RealTransaction", async () => {
    const { Transaction: TxBase } = await import("./connection-adapters/abstract/transaction.js");
    const { SavepointTransaction, RealTransaction } =
      await import("./connection-adapters/abstract/transaction.js");
    const testAdapter = Base.connection;
    // Re-lay canonical `items` (drop-and-recreate, mirroring
    // schema.rb's `create_table :items`) to prime the signature cache.
    // `items` is a boot-owned canonical table, so it is not torn down here (the
    // describe's afterAll clears rows; the boot schema owns/restores the shape).

    await testAdapter.createTable("items", { force: true }, (t) => {
      t.column("name", "string");
    });
    class Item extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = testAdapter;
      }
    }

    let outerType: string | undefined;
    let innerType: string | undefined;

    await transaction(Item, async () => {
      await Item.create({ name: "outer" });
      const cur = (testAdapter as unknown as AdapterTxView).currentTransaction?.();
      outerType = cur instanceof TxBase ? cur.constructor.name : String(cur);

      await transaction(
        Item,
        async () => {
          await Item.create({ name: "inner" });
          const curIn = (testAdapter as unknown as AdapterTxView).currentTransaction?.();
          innerType = curIn instanceof TxBase ? curIn.constructor.name : String(curIn);
        },
        { requiresNew: true },
      );
    });

    // Outer must be a real DB transaction frame; inner must be a Savepoint
    // (NOT RestartParent or NullTransaction). This guards against TM joining
    // the parent instead of opening a savepoint.
    expect(outerType).toBe(RealTransaction.name);
    expect(innerType).toBe(SavepointTransaction.name);
  });

  it.skip("concurrent Promise.all top-level transactions are serialized (no shared TM frame)", async () => {
    // E2: tests AsyncContext chain-isolation on the wrapper, which was deleted
    // in favour of pool-per-connection isolation (tested by the E1 safety-net
    // in with-transactional-fixtures.test.ts). Wrapper deleted entirely in E4.
    const testAdapter = Base.connection;
    // Re-lay canonical `items` (drop-and-recreate, mirroring
    // schema.rb's `create_table :items`) to prime the signature cache.
    // `items` is a boot-owned canonical table, so it is not torn down here (the
    // describe's afterAll clears rows; the boot schema owns/restores the shape).

    await testAdapter.createTable("items", { force: true }, (t) => {
      t.column("name", "string");
    });
    class Item extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = testAdapter;
      }
    }
    // Force a defineSchema-like priming so concurrent creates don't race on DDL.
    await Item.create({ name: "prime" });

    const observed: Array<{ inside: unknown }> = [];
    // Track concurrent execution: increment on entry, decrement on exit.
    // The mutex should keep this at 1 for the entire run.
    let active = 0;
    let maxActive = 0;
    await Promise.all(
      Array.from({ length: 6 }, (_v, i) =>
        transaction(Item, async () => {
          active++;
          if (active > maxActive) maxActive = active;
          try {
            // Each chain must see its own frame inside. If foreign chains
            // were leaking, two concurrent callers would observe the SAME
            // frame here.
            await Item.create({ name: `concurrent-${i}` });
            const inside = (testAdapter as unknown as AdapterTxView).currentTransaction?.();
            observed.push({ inside });
          } finally {
            active--;
          }
        }),
      ),
    );

    // After all transactions complete, the adapter's chain-aware view sees
    // no current transaction — NullTransaction is the Rails-correct sentinel.
    expect((testAdapter as unknown as AdapterTxView).currentTransaction?.()).toBeInstanceOf(
      NullTransaction,
    );
    // Mutex must have fully serialized — no two bodies ever overlapped.
    expect(maxActive).toBe(1);
    // Every chain must have seen a frame (no nulls/undefined) AND each frame
    // must be distinct — if the mutex degenerated to "join", or if a chain
    // saw the empty NULL_TRANSACTION, this would fail.
    expect(observed).toHaveLength(6);
    for (const o of observed) {
      expect(o.inside).toBeDefined();
      expect(o.inside).not.toBeNull();
    }
    const distinctFrames = new Set(observed.map((o) => o.inside)).size;
    expect(distinctFrames).toBe(observed.length);
    expect(await Item.count()).toBe(7);
  });

  it("manual beginTransaction/commit pair delegates inner state unconditionally", async () => {
    const testAdapter = Base.connection;
    // Re-lay canonical `items` (drop-and-recreate, mirroring
    // schema.rb's `create_table :items`) to prime the signature cache.
    // `items` is a boot-owned canonical table, so it is not torn down here (the
    // describe's afterAll clears rows; the boot schema owns/restores the shape).

    await testAdapter.createTable("items", { force: true }, (t) => {
      t.column("name", "string");
    });
    class Item extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = testAdapter;
      }
    }
    await Item.create({ name: "prime" });

    expect(testAdapter.inTransaction).toBe(false);
    expect(testAdapter.openTransactions).toBe(0);
    expect((testAdapter as unknown as AdapterTxView).currentTransaction?.()).toBeInstanceOf(
      NullTransaction,
    );

    await testAdapter.beginTransaction();
    expect(testAdapter.inTransaction).toBe(true);
    expect(testAdapter.openTransactions).toBeGreaterThan(0);

    await testAdapter.commit();
    expect(testAdapter.inTransaction).toBe(false);
    expect(testAdapter.openTransactions).toBe(0);

    await testAdapter.beginTransaction();
    expect(testAdapter.inTransaction).toBe(true);
    await testAdapter.rollback();
    expect(testAdapter.inTransaction).toBe(false);
  });
});
