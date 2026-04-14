import type { Base } from "./base.js";

import { ArgumentError } from "@blazetrails/activemodel";
import { getAsyncContext, type AsyncContext } from "@blazetrails/activesupport";
import { Rollback, TransactionIsolationError } from "./errors.js";
export { Rollback };
import { Transaction } from "./connection-adapters/abstract/transaction.js";
import { transaction as dbTransaction } from "./connection-adapters/abstract/database-statements.js";

type TransactionAction = "create" | "update" | "destroy";

// Per-async-context transaction tracking via activesupport's adapter
// (uses AsyncLocalStorage in Node, fallback in browsers).
let _transactionStorage: AsyncContext<Transaction | null> | null = null;
let _transactionStorageAdapter: ReturnType<typeof getAsyncContext> | null = null;

function getTransactionStorage(): AsyncContext<Transaction | null> {
  const asyncContext = getAsyncContext();
  if (!_transactionStorage || _transactionStorageAdapter !== asyncContext) {
    _transactionStorage = asyncContext.create<Transaction | null>();
    _transactionStorageAdapter = asyncContext;
  }
  return _transactionStorage;
}

// Per-adapter mutex: serializes outermost transactions for the fallback path.
// Matches Rails where each thread gets its own connection.
const _adapterLocks = new WeakMap<object, Promise<void>>();

async function acquireAdapterLock(adapter: object): Promise<() => void> {
  while (_adapterLocks.has(adapter)) {
    await _adapterLocks.get(adapter);
  }
  let release!: () => void;
  const lock = new Promise<void>((resolve) => {
    release = () => {
      _adapterLocks.delete(adapter);
      resolve();
    };
  });
  _adapterLocks.set(adapter, lock);
  return release;
}

let _savepointCounter = 0;

/**
 * Get the currently active transaction, if any.
 */
export function currentTransaction(): Transaction | null {
  return getTransactionStorage().getStore() ?? null;
}

/**
 * Execute a block within a database transaction.
 *
 * Mirrors: ActiveRecord::Base.transaction
 *
 * When the adapter has a TransactionManager (via withinNewTransaction),
 * delegates through the database-statements transaction function which
 * routes through TransactionManager for proper Rails-style transaction
 * lifecycle. Falls back to direct adapter calls for simple adapters.
 */
export async function transaction<T>(
  modelClass: typeof Base,
  fn: (tx: Transaction) => Promise<T>,
  options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
): Promise<T | undefined> {
  const adapter = modelClass.adapter;

  // If the adapter supports the full TransactionManager path, use it.
  // Also check adapter.inTransaction to detect external transactions
  // (e.g., fixtures) that TransactionManager doesn't know about — fall
  // through to the fallback which handles nesting via savepoints.
  if (
    typeof (adapter as any).withinNewTransaction === "function" &&
    !(currentTransaction() === null && adapter.inTransaction)
  ) {
    // No per-adapter lock needed: TransactionManager's join-or-savepoint
    // logic handles concurrent callers. The second caller either joins the
    // existing transaction (if joinable) or creates a SavepointTransaction.
    // Locking here would deadlock because withinNewTransaction runs
    // commit/rollback callbacks before returning.
    const result = await dbTransaction.call(
      adapter as any,
      async (userTx?: unknown) => {
        let internalTx: Transaction;
        if (userTx instanceof Transaction) {
          internalTx = userTx;
        } else if (userTx && (userTx as any)._internalTransaction instanceof Transaction) {
          internalTx = (userTx as any)._internalTransaction;
        } else {
          const tmCurrent = (adapter as any).currentTransaction?.();
          internalTx = tmCurrent instanceof Transaction ? tmCurrent : new Transaction(adapter);
        }
        return getTransactionStorage().run(internalTx, () => fn(internalTx));
      },
      {
        requiresNew: options?.requiresNew,
        isolation: options?.isolation,
        joinable: options?.joinable,
      },
    );
    return result as T | undefined;
  }

  // Fallback for simple adapters without TransactionManager:
  // manage transaction lifecycle and callbacks directly.
  return _transactionFallback(adapter, fn, options);
}

async function _transactionFallback<T>(
  adapter: import("./adapter.js").DatabaseAdapter,
  fn: (tx: Transaction) => Promise<T>,
  options?: { isolation?: string },
): Promise<T | undefined> {
  if (options?.isolation) {
    throw new TransactionIsolationError(
      `Transaction isolation level '${options.isolation}' is not yet supported`,
    );
  }

  const tx = new Transaction(adapter);
  const nested = currentTransaction() !== null || adapter.inTransaction;
  let releaseLock = nested ? null : await acquireAdapterLock(adapter);

  let result: T;
  try {
    if (nested) {
      const spName = `active_record_${++_savepointCounter}`;
      await adapter.createSavepoint(spName);
      try {
        result = await getTransactionStorage().run(tx, () => fn(tx));
        await adapter.releaseSavepoint(spName);
      } catch (error) {
        try {
          await adapter.rollbackToSavepoint(spName);
        } catch {}
        releaseLock?.();
        releaseLock = null;
        await tx.rollback();
        await tx.runAfterRollbackCallbacks();
        if (error instanceof Rollback) return undefined;
        throw error;
      }
    } else {
      await adapter.beginTransaction();
      try {
        result = await getTransactionStorage().run(tx, () => fn(tx));
        await adapter.commit();
      } catch (error) {
        try {
          await adapter.rollback();
        } catch {}
        releaseLock?.();
        releaseLock = null;
        await tx.rollback();
        await tx.runAfterRollbackCallbacks();
        if (error instanceof Rollback) return undefined;
        throw error;
      }
    }
    await tx.commit();
    releaseLock?.();
    releaseLock = null;
    await tx.runAfterCommitCallbacks();
    return result;
  } catch (error) {
    if (error instanceof Rollback) return undefined;
    throw error;
  } finally {
    releaseLock?.();
  }
}

/**
 * Execute a block within a savepoint (nested transaction).
 * The name parameter is accepted for backward compatibility but
 * savepoint names are auto-generated by the TransactionManager
 * (matching Rails' `active_record_N` naming).
 *
 * Mirrors: ActiveRecord::Base.transaction(requires_new: true)
 */
export async function savepoint<T>(
  modelClass: typeof Base,
  _name: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  return transaction(modelClass, async () => fn(), { requiresNew: true });
}

// ---------------------------------------------------------------------------
// ClassMethods — mirrors ActiveRecord::Transactions::ClassMethods
// These are standalone functions that take the model class as first arg,
// following the codebase mixin pattern.
// ---------------------------------------------------------------------------

type CallbackFn = (...args: any[]) => any;
type CallbackOptions = {
  on?: TransactionAction | TransactionAction[];
  if?: CallbackFn | CallbackFn[];
  unless?: CallbackFn | CallbackFn[];
  prepend?: boolean;
};

/**
 * Mirrors: ActiveRecord::Transactions::ClassMethods#before_commit
 * Registers directly on the model callback chain (ActiveModel does not
 * provide a `beforeCommit` class helper).
 */
export function beforeCommit(
  modelClass: typeof Base,
  fn: CallbackFn,
  options?: CallbackOptions,
): void {
  if (options?.on !== undefined) {
    const actions = Array.isArray(options.on) ? options.on : [options.on];
    for (const action of actions) {
      if (action !== "create" && action !== "update" && action !== "destroy") {
        throw new ArgumentError(
          `:on conditions for after_commit and after_rollback callbacks have to be one of [:create, :destroy, :update]`,
        );
      }
    }
  }
  (modelClass as any)._ensureOwnCallbacks();
  (modelClass as any)._callbackChain.register("before", "commit", fn, options);
}

/**
 * Mirrors: ActiveRecord::Transactions::ClassMethods#after_commit
 */
export function afterCommit(
  modelClass: typeof Base,
  fn: CallbackFn,
  options?: CallbackOptions,
): void {
  (modelClass as any).afterCommit(fn, options);
}

/**
 * Mirrors: ActiveRecord::Transactions::ClassMethods#after_save_commit
 */
export function afterSaveCommit(modelClass: typeof Base, fn: CallbackFn): void {
  (modelClass as any).afterSaveCommit(fn);
}

/**
 * Mirrors: ActiveRecord::Transactions::ClassMethods#after_create_commit
 */
export function afterCreateCommit(modelClass: typeof Base, fn: CallbackFn): void {
  (modelClass as any).afterCreateCommit(fn);
}

/**
 * Mirrors: ActiveRecord::Transactions::ClassMethods#after_update_commit
 */
export function afterUpdateCommit(modelClass: typeof Base, fn: CallbackFn): void {
  (modelClass as any).afterUpdateCommit(fn);
}

/**
 * Mirrors: ActiveRecord::Transactions::ClassMethods#after_destroy_commit
 */
export function afterDestroyCommit(modelClass: typeof Base, fn: CallbackFn): void {
  (modelClass as any).afterDestroyCommit(fn);
}

/**
 * Mirrors: ActiveRecord::Transactions::ClassMethods#after_rollback
 */
export function afterRollback(
  modelClass: typeof Base,
  fn: CallbackFn,
  options?: CallbackOptions,
): void {
  (modelClass as any).afterRollback(fn, options);
}

/**
 * Mirrors: ActiveRecord::Transactions::ClassMethods#set_callback
 */
export function setCallback(
  modelClass: typeof Base,
  name: "commit" | "rollback" | "before_commit",
  fn: CallbackFn,
  options?: CallbackOptions,
): void {
  if (name === "commit") {
    afterCommit(modelClass, fn, options);
  } else if (name === "rollback") {
    afterRollback(modelClass, fn, options);
  } else if (name === "before_commit") {
    beforeCommit(modelClass, fn, options);
  }
}

// ---------------------------------------------------------------------------
// Instance methods — mirrors ActiveRecord::Transactions instance methods
// These are standalone functions that take the record as first arg.
// ---------------------------------------------------------------------------

/**
 * Run before_commit callbacks on the record.
 *
 * Mirrors: ActiveRecord::Transactions#before_committed!
 */
export async function beforeCommittedBang(record: Base): Promise<void> {
  const ctor = record.constructor as typeof Base;
  await (ctor as any)._callbackChain?.runBefore?.("commit", record);
}

/**
 * Run after_commit callbacks on the record.
 *
 * Mirrors: ActiveRecord::Transactions#committed!
 */
export async function committedBang(record: Base): Promise<void> {
  if (!isTriggerTransactionalCallbacks(record)) return;
  const ctor = record.constructor as typeof Base;
  await (ctor as any)._callbackChain?.runAfter?.("commit", record);
}

/**
 * Run after_rollback callbacks on the record.
 *
 * Mirrors: ActiveRecord::Transactions#rolledback!
 */
export async function rolledbackBang(record: Base): Promise<void> {
  if (!isTriggerTransactionalCallbacks(record)) return;
  const ctor = record.constructor as typeof Base;
  await (ctor as any)._callbackChain?.runAfter?.("rollback", record);
}

/**
 * Snapshot record state before the transaction so it can be restored on
 * rollback.
 *
 * Mirrors: ActiveRecord::Transactions#remember_transaction_record_state
 */
/**
 * Record identity state snapshot — only captures fields that define what
 * the record IS (new? destroyed? id?), not what happened to it during the
 * transaction (tracking flags are set by save/destroy and read by
 * trigger_transactional_callbacks?).
 */
interface TransactionRecordSnapshot {
  newRecord: boolean;
  destroyed: boolean;
  frozen: boolean;
  id: unknown;
  previouslyNewRecord: boolean;
}

function rememberTransactionRecordState(record: Base): TransactionRecordSnapshot {
  const r = record as any;
  return {
    newRecord: r._newRecord,
    destroyed: r._destroyed,
    frozen: r._frozen,
    id: record.id,
    previouslyNewRecord: r._previouslyNewRecord,
  };
}

/**
 * Restore record identity state from a snapshot after a transaction rollback.
 * Does NOT restore tracking flags — those reflect what happened during the
 * transaction and are needed by trigger_transactional_callbacks?.
 *
 * Mirrors: ActiveRecord::Transactions#restore_transaction_record_state
 */
function restoreTransactionRecordState(record: Base, snapshot: TransactionRecordSnapshot): void {
  const r = record as any;
  r._newRecord = snapshot.newRecord;
  r._destroyed = snapshot.destroyed;
  r._frozen = snapshot.frozen;
  r._previouslyNewRecord = snapshot.previouslyNewRecord;

  // Restore the primary key if it was auto-assigned during insert
  if (snapshot.newRecord && !Array.isArray(record.id)) {
    const ctor = record.constructor as typeof Base;
    r._attributes.set(ctor.primaryKey as string, snapshot.id);
  }
}

/**
 * Execute a block within a transaction and capture its return value as a
 * status flag. If the status is falsy (false/null/undefined), the transaction
 * is rolled back. Handles record state snapshotting/restore and callback
 * scheduling.
 *
 * Mirrors: ActiveRecord::Transactions#with_transaction_returning_status
 */
export async function withTransactionReturningStatus<T>(
  record: Base,
  fn: () => Promise<T>,
): Promise<T> {
  const modelClass = record.constructor as typeof Base;

  // Mirrors: remember_transaction_record_state — snapshot before transaction
  const snapshot = rememberTransactionRecordState(record);

  // Reset transaction tracking flags (the block will set them if the
  // operation succeeds).
  const r = record as any;
  r._transactionAction = undefined;
  r._newRecordBeforeLastCommit = r._newRecord ?? record.isNewRecord?.() ?? false;
  r._triggerUpdateCallback = false;
  r._triggerDestroyCallback = false;

  let status: T;
  let rolledBack = false;

  await transaction(modelClass, async (tx) => {
    // Mirrors: add_to_transaction — register for state restoration on rollback.
    // Actual committedBang/rolledbackBang callbacks are scheduled after
    // the transaction returns, on the outer transaction or fired immediately.
    tx.afterRollback(async () => {
      restoreTransactionRecordState(record, snapshot);
    });

    status = await fn();
    // Ruby truthiness: only false/nil trigger rollback (0, "" are truthy in Ruby)
    if (status === false || status == null) {
      rolledBack = true;
      throw new Rollback();
    }
    return status;
  });

  // Schedule commit/rollback callbacks. If inside an outer transaction,
  // defer to it. If the inner transaction rolled back, fire rolledbackBang
  // immediately (state was already restored by the afterRollback above).
  if (!rolledBack) {
    const outerTx = currentTransaction();
    if (outerTx) {
      outerTx.afterCommit(async () => await committedBang(record));
      outerTx.afterRollback(async () => {
        // Fire callbacks before restoring state — rolledbackBang needs
        // isPersisted()/isDestroyed() to reflect what happened during the
        // transaction, not the pre-transaction state. Matches Rails where
        // rolledback! fires during rollback, restore runs in ensure.
        await rolledbackBang(record);
        restoreTransactionRecordState(record, snapshot);
      });
    } else {
      await committedBang(record);
    }
  } else {
    await rolledbackBang(record);
  }

  return status!;
}

/**
 * Mirrors: ActiveRecord::Transactions#_new_record_before_last_commit (attr_accessor)
 */
export function _newRecordBeforeLastCommit(record: Base): boolean {
  return (record as any)._newRecordBeforeLastCommit ?? false;
}

/**
 * Returns whether the record should trigger transactional callbacks.
 *
 * Mirrors: ActiveRecord::Transactions#trigger_transactional_callbacks?
 */
export function isTriggerTransactionalCallbacks(record: Base): boolean {
  const r = record as any;
  const newBeforeLastCommit = r._newRecordBeforeLastCommit ?? false;
  const triggerUpdate = r._triggerUpdateCallback ?? false;
  const triggerDestroy = r._triggerDestroyCallback ?? false;
  return (
    ((newBeforeLastCommit || triggerUpdate) && record.isPersisted()) ||
    (triggerDestroy && record.isDestroyed())
  );
}
