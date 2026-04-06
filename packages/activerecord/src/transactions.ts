import type { Base } from "./base.js";

import { ArgumentError } from "@blazetrails/activemodel";
import { getAsyncContext, type AsyncContext } from "@blazetrails/activesupport";
import { Rollback, TransactionIsolationError } from "./errors.js";
export { Rollback };
import { Transaction } from "./connection-adapters/abstract/transaction.js";

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

// Per-adapter mutex: serializes beginTransaction so concurrent callers wait
// for the first BEGIN to complete before checking nesting state.
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
 */
let _savepointCounter = 0;

export async function transaction<T>(
  modelClass: typeof Base,
  fn: (tx: Transaction) => Promise<T>,
  options?: { isolation?: string },
): Promise<T | undefined> {
  const adapter = modelClass.adapter;
  const previousTx = currentTransaction();

  if (options?.isolation) {
    if (previousTx !== null) {
      throw new TransactionIsolationError(
        "Setting transaction isolation level is not supported inside a nested transaction",
      );
    }
    throw new TransactionIsolationError(
      `Transaction isolation level '${options.isolation}' is not yet supported`,
    );
  }

  const tx = new Transaction(adapter);

  // Check nesting: prefer AsyncLocalStorage (tracks our own transaction() calls).
  // Fall back to adapter.inTransaction for DB transactions started outside our
  // transaction() function (e.g. test fixtures). The per-adapter mutex serializes
  // outermost transactions, so unrelated async flows cannot race here.
  const nested = previousTx !== null || adapter.inTransaction;
  const spName = nested ? `sp_${++_savepointCounter}` : null;

  // For outermost transactions, serialize on the adapter. This matches Rails
  // where each thread gets its own connection — concurrent callers queue.
  // Nested transactions (savepoints) skip the lock since they run inside
  // the outer transaction's locked scope.
  let releaseLock = nested ? null : await acquireAdapterLock(adapter);

  let result: T;
  try {
    if (nested && spName) {
      await adapter.createSavepoint(spName);
    } else {
      await adapter.beginTransaction();
    }

    result = await getTransactionStorage().run(tx, () => fn(tx));
    if (nested && spName) {
      await adapter.releaseSavepoint(spName);
    } else {
      await adapter.commit();
    }
    await tx.commit();
  } catch (error) {
    try {
      if (nested && spName) {
        await adapter.rollbackToSavepoint(spName);
      } else {
        await adapter.rollback();
      }
      await tx.rollback();
    } catch {
      // Swallow rollback errors — the original error is more important
    }
    // Release lock before callbacks to prevent deadlocks if a callback
    // starts a new outermost transaction on the same adapter.
    releaseLock?.();
    releaseLock = null;
    await tx.runAfterRollbackCallbacks();
    if (error instanceof Rollback) {
      return undefined;
    }
    throw error;
  } finally {
    // Guarantee lock release even if commit/rollback/callbacks throw
    releaseLock?.();
  }
  await tx.runAfterCommitCallbacks();
  return result;
}

/**
 * Execute a block within a savepoint (nested transaction).
 *
 * Mirrors: ActiveRecord::Base.transaction(requires_new: true)
 */
export async function savepoint<T>(
  modelClass: typeof Base,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const adapter = modelClass.adapter;

  await adapter.createSavepoint(name);

  try {
    const result = await fn();
    await adapter.releaseSavepoint(name);
    return result;
  } catch (error) {
    await adapter.rollbackToSavepoint(name);
    throw error;
  }
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
  r._newRecordBeforeLastCommit = false;
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
