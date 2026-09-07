import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { throwAbort, LoadInterlockAwareMonitor } from "@blazetrails/activesupport";
import { Base, transaction, registerModel } from "./index.js";
import { NullTransaction } from "./connection-adapters/abstract/transaction.js";
import { fixtures } from "./test-fixtures.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import { WrongReply } from "./test-helpers/models/reply.js";
import { CpkBook, CpkOrder, CpkAuthor, CpkChapter } from "./test-helpers/models/cpk.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";

type StartTransactionState = { level: number; attributes: unknown } | null;
interface TxRecordInternals {
  _newRecord: boolean;
  changesApplied(): void;
  writeAttribute(name: string, value: unknown): void;
  readAttribute(name: string): unknown;
  _startTransactionState: StartTransactionState;
  isChanged: boolean;
  changes: Record<string, unknown>;
  attributeChanged(name: string): boolean;
  attributeWas(name: string): unknown;
}

interface CpkRestoreView {
  restoreTransactionRecordState(forceRestoreState?: boolean): void;
}

interface AdapterTxView {
  currentTransaction?(): unknown;
}

for (const klass of [CpkBook, CpkOrder, CpkAuthor, CpkChapter]) {
  registerModel(klass as unknown as typeof Base);
}

const openAdapters: SQLite3Adapter[] = [];

async function makeSQLiteTopic() {
  const adp = new BetterSQLite3Adapter(":memory:");
  openAdapters.push(adp);
  await adp.execute(
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
      await a.execute("DROP TABLE IF EXISTS topics");
    } catch {}
    await a.close();
  }
});

describe("TransactionTest", () => {
  fixtures({}, { useTransactionalTests: false });

  it("block-arg tx.afterCommit fires after the transaction commits", async () => {
    const log: string[] = [];

    await transaction(CanonicalTopic, async (tx) => {
      await tx.afterCommit(() => {
        log.push("committed");
      });
      await CanonicalTopic.create({ title: "Alice" });
    });

    expect(log).toEqual(["committed"]);
  });

  describe("after_failure_actions on PreparedStatementCacheExpired", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("calls clearCacheBang and re-raises when the body throws the expired error", async () => {
      const { PreparedStatementCacheExpired } = await import("./errors.js");
      const spy = vi.spyOn(AbstractAdapter.prototype, "clearCacheBang");
      await expect(
        transaction(CanonicalTopic, async () => {
          throw new PreparedStatementCacheExpired("cached plan expired");
        }),
      ).rejects.toBeInstanceOf(PreparedStatementCacheExpired);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("does not call clearCacheBang for unrelated errors", async () => {
      const spy = vi.spyOn(AbstractAdapter.prototype, "clearCacheBang");
      await expect(
        transaction(CanonicalTopic, async () => {
          throw new Error("unrelated");
        }),
      ).rejects.toThrow("unrelated");
      expect(spy).not.toHaveBeenCalled();
    });

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
        active: () => true,
        lock: new LoadInterlockAwareMonitor(),
      };
      const tm = new TransactionManager(conn as never);
      await expect(
        tm.withinNewTransaction({}, () => {
          throw new PreparedStatementCacheExpired("cached plan expired");
        }),
      ).rejects.toBeInstanceOf(PreparedStatementCacheExpired);
      expect(clearCacheBang).toHaveBeenCalledTimes(1);
    });

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
        active: () => true,
        lock: new LoadInterlockAwareMonitor(),
      };
      const tm = new TransactionManager(conn as never);
      await expect(
        tm.withinNewTransaction({ joinable: false }, async () => {
          await tm.withinNewTransaction({}, () => {
            throw new PreparedStatementCacheExpired("inner savepoint plan miss");
          });
        }),
      ).rejects.toBeInstanceOf(PreparedStatementCacheExpired);
      expect(clearCacheBang).toHaveBeenCalledTimes(1);
    });
  });
});

describe("savepoint statements dirty the current transaction (trails ensure relocation)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createSavepoint dirties the current (parent) transaction frame", async () => {
    const { adapter } = await makeSQLiteTopic();
    const tm = adapter.transactionManager;
    await tm.withinNewTransaction({}, async () => {
      await tm.materializeTransactions();
      expect(tm.isRestorable()).toBe(true);
      await adapter.createSavepoint("sp1");
      expect(tm.isRestorable()).toBe(false);
    });
  });

  it("a savepoint statement failing mid-flight still dirties the parent (ensure fires on the error path)", async () => {
    const { adapter } = await makeSQLiteTopic();
    const tm = adapter.transactionManager;
    await tm.withinNewTransaction({}, async () => {
      await tm.materializeTransactions();
      expect(tm.isRestorable()).toBe(true);
      const driver = (
        adapter as unknown as { _rawConnection: { exec: (s: string) => Promise<unknown> } }
      )._rawConnection;
      vi.spyOn(driver, "exec").mockRejectedValueOnce(
        new Error("server closed the connection unexpectedly"),
      );
      await expect(adapter.rollbackToSavepoint("sp_x")).rejects.toThrow();
      expect(tm.isRestorable()).toBe(false);
    });
  });
});

describe("rememberTransactionRecordState / restoreTransactionRecordState (Story K)", () => {
  it("rememberTransactionRecordState populates _startTransactionState with level and attributes", async () => {
    const { rememberTransactionRecordState } = await import("./transactions.js");
    const { Topic } = await makeSQLiteTopic();
    const topic = new Topic({ title: "before" });
    const internals = topic as unknown as TxRecordInternals;
    internals._newRecord = false;

    rememberTransactionRecordState.call(topic);

    const state = internals._startTransactionState;
    expect(state).not.toBeNull();
    expect(state?.level).toBe(1);
    expect(state?.attributes).toBeDefined();
    rememberTransactionRecordState.call(topic);
    expect(internals._startTransactionState?.level).toBe(2);
  });

  it("rolledbackBang restores identity and clears mutation tracking", async () => {
    const { rolledbackBang, rememberTransactionRecordState } = await import("./transactions.js");
    const { Topic } = await makeSQLiteTopic();
    const topic = new Topic({ title: "original" });
    const internals = topic as unknown as TxRecordInternals;
    internals._newRecord = false;
    internals.changesApplied();

    rememberTransactionRecordState.call(topic);
    internals.writeAttribute("title", "changed-during-tx");

    await rolledbackBang.call(topic, {
      forceRestoreState: true,
      shouldRunCallbacks: false,
    });

    expect(internals._startTransactionState).toBeNull();
    expect(internals.readAttribute("title")).toBe("changed-during-tx");
    expect(internals.changes).toEqual({
      title: ["original", "changed-during-tx"],
    });
  });
});

describe("restoreTransactionRecordState composite primary key arm", () => {
  fixtures({}, { useTransactionalTests: false });

  it("restores the snapshotted id tuple on a composite-primary-key model", async () => {
    const { rememberTransactionRecordState } = await import("./transactions.js");
    const book = await CpkBook.createBang({ id: [1, 2], title: "Tender Is the Night" });
    try {
      rememberTransactionRecordState.call(book);
      book.id = [42, 42];
      expect(book.id).toEqual([42, 42]);

      (book as unknown as CpkRestoreView).restoreTransactionRecordState(true);

      expect(book.id).toEqual([1, 2]);
    } finally {
      await CpkBook.deleteAll();
    }
  });
});

describe("restore_transaction_record_state after rollback (Story K-followup)", () => {
  it("rollback preserves in-TX user edits as dirty", async () => {
    const { rememberTransactionRecordState, rolledbackBang } = await import("./transactions.js");
    const { Topic } = await makeSQLiteTopic();
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

    expect(internals.readAttribute("title")).toBe("tx-edit");
    expect(internals.attributeChanged("title")).toBe(true);
    expect(internals.attributeWas("title")).toBe("original");
    expect(internals.changes).toEqual({
      title: ["original", "tx-edit"],
    });
  });

  it("rollback leaves clean attributes unchanged (no spurious dirty)", async () => {
    const { rememberTransactionRecordState, rolledbackBang } = await import("./transactions.js");
    const { Topic } = await makeSQLiteTopic();
    const topic = new Topic({ title: "original" });
    const internals = topic as unknown as TxRecordInternals;
    internals._newRecord = false;
    internals.changesApplied();

    rememberTransactionRecordState.call(topic);

    await rolledbackBang.call(topic, {
      forceRestoreState: true,
      shouldRunCallbacks: false,
    });

    expect(internals.isChanged).toBe(false);
    expect(internals.changes).toEqual({});
  });
});

describe("SchemaAdapter TM delegation", () => {
  fixtures({}, { useTransactionalTests: false });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await Base.connection.executeMutation("DELETE FROM items");
  });

  it("transaction() routes SchemaAdapter through TM (spy on inner.withinNewTransaction)", async () => {
    const testAdapter = Base.connection;
    const spy = vi.spyOn(testAdapter, "withinNewTransaction");
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

    expect(outerType).toBe(RealTransaction.name);
    expect(innerType).toBe(SavepointTransaction.name);
  });

  it.skip("concurrent Promise.all top-level transactions are serialized (no shared TM frame)", async () => {
    const testAdapter = Base.connection;
    class Item extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = testAdapter;
      }
    }
    await Item.create({ name: "prime" });

    const observed: Array<{ inside: unknown }> = [];
    let active = 0;
    let maxActive = 0;
    await Promise.all(
      Array.from({ length: 6 }, (_v, i) =>
        transaction(Item, async () => {
          active++;
          if (active > maxActive) maxActive = active;
          try {
            await Item.create({ name: `concurrent-${i}` });
            const inside = (testAdapter as unknown as AdapterTxView).currentTransaction?.();
            observed.push({ inside });
          } finally {
            active--;
          }
        }),
      ),
    );

    expect((testAdapter as unknown as AdapterTxView).currentTransaction?.()).toBeInstanceOf(
      NullTransaction,
    );
    expect(maxActive).toBe(1);
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
    class Item extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = testAdapter;
      }
    }
    await Item.create({ name: "prime" });

    expect(testAdapter.isTransactionOpen()).toBe(false);
    expect(testAdapter.openTransactions()).toBe(0);
    expect((testAdapter as unknown as AdapterTxView).currentTransaction?.()).toBeInstanceOf(
      NullTransaction,
    );

    await testAdapter.beginTransaction({ _lazy: false });
    expect(testAdapter.isTransactionOpen()).toBe(true);
    expect(testAdapter.openTransactions()).toBeGreaterThan(0);

    await testAdapter.commitTransaction();
    expect(testAdapter.isTransactionOpen()).toBe(false);
    expect(testAdapter.openTransactions()).toBe(0);

    await testAdapter.beginTransaction({ _lazy: false });
    expect(testAdapter.isTransactionOpen()).toBe(true);
    await testAdapter.rollbackTransaction();
    expect(testAdapter.isTransactionOpen()).toBe(false);
  });
});

describe("aborting before_validation halts before the validators run", () => {
  fixtures({});

  const newInvalidReply = () =>
    WrongReply.new({ title: "a reply", content: "" }) as unknown as {
      save(): Promise<boolean | undefined>;
      errors: { any: boolean };
      beforeValidationForTransaction: () => Promise<void>;
    };

  it("records the validation error when nothing aborts", async () => {
    const reply = newInvalidReply();

    expect(await reply.save()).toBeFalsy();
    expect(reply.errors.any).toBe(true);
  });

  it("leaves no errors when a record is also invalid", async () => {
    const reply = newInvalidReply();
    reply.beforeValidationForTransaction = async () => {
      await Promise.resolve();
      throwAbort();
    };

    expect(await reply.save()).toBeFalsy();
    expect(reply.errors.any).toBe(false);
  });
});
