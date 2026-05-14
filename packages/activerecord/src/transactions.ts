import type { Base } from "./base.js";

import {
  ArgumentError,
  _registerCallbackOnProto,
  runBeforeCallbacksOnProto,
  runAfterCallbacksOnProto,
} from "@blazetrails/activemodel";
import { peekCallbackChain as asPeekCallbackChain } from "@blazetrails/activesupport";
import { getAsyncContext, type AsyncContext } from "@blazetrails/activesupport";
import { PreparedStatementCacheExpired, Rollback, TransactionIsolationError } from "./errors.js";
export { Rollback };

/**
 * Mirrors Rails' `TransactionManager#after_failure_actions`: when a
 * transaction fails with `PreparedStatementCacheExpired`, clear the
 * cached prepared statements on the current connection so subsequent
 * statements re-PREPARE. The error itself re-raises unchanged —
 * Rails does NOT retry the body.
 *
 * This helper is only used by the fallback transaction path below
 * (for adapters that don't route through TransactionManager, like
 * the test adapter). `TransactionManager` has its own
 * `_afterFailureActions` implementation in
 * `connection-adapters/abstract/transaction.ts`.
 *
 * Reference: activerecord/lib/active_record/connection_adapters/
 * abstract/transaction.rb `TransactionManager#after_failure_actions`.
 */
function _afterFailureActions(
  adapter: import("./adapter.js").DatabaseAdapter,
  error: unknown,
): void {
  if (error instanceof PreparedStatementCacheExpired) {
    adapter.clearCacheBang?.();
  }
}
import { Transaction } from "./connection-adapters/abstract/transaction.js";
import { Transaction as PublicTransaction } from "./transaction.js";
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
 * Returns the current transaction as the public Transaction wrapper, or
 * Transaction.NULL_TRANSACTION when no transaction is open.
 *
 * NULL_TRANSACTION fires afterCommit immediately and ignores afterRollback,
 * matching Rails' ActiveRecord::Transaction::NULL_TRANSACTION behavior.
 *
 * Mirrors: ActiveRecord::Base.current_transaction
 */
export function currentTransactionPublic(): PublicTransaction {
  const internalTx = currentTransaction();
  if (!internalTx) return PublicTransaction.NULL_TRANSACTION;
  // Use the existing userTransaction so callers get a stable identity (same
  // object per internal transaction, consistent uuid memoization).
  return (internalTx as any).userTransaction ?? new PublicTransaction(internalTx);
}

/**
 * Run a callback after all currently open transactions have committed.
 * If there is no open transaction, the callback is called immediately.
 * Delegates through currentTransactionPublic() so NULL_TRANSACTION semantics
 * (afterCommit runs immediately) apply consistently.
 *
 * Mirrors: ActiveRecord.after_all_transactions_commit
 */
export function afterAllTransactionsCommit(fn: () => void | Promise<void>): void | Promise<void> {
  return currentTransactionPublic().afterCommit(fn);
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
  // Also check TM's openTransactions so lazy (unmaterialized) transactions are
  // detected even when adapter.inTransaction is still false.
  const nested =
    currentTransaction() !== null || (adapter.openTransactions ?? 0) > 0 || adapter.inTransaction;
  let releaseLock = nested ? null : await acquireAdapterLock(adapter);

  let result: T;
  try {
    if (nested) {
      const spName = `active_record_${++_savepointCounter}`;
      await adapter.materializeTransactions?.();
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
        _afterFailureActions(adapter, error);
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
        _afterFailureActions(adapter, error);
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
  _registerCallbackOnProto(
    (modelClass as unknown as { prototype: object }).prototype,
    "before",
    "commit",
    fn,
    synthOnCondition(options as Record<string, unknown>),
  );
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
  await runBeforeCallbacksOnProto((ctor as any).prototype, "commit", record);
}

/**
 * Run after_commit callbacks on the record.
 *
 * Mirrors: ActiveRecord::Transactions#committed!
 */
export async function committedBang(
  this: Base,
  { shouldRunCallbacks = true }: { shouldRunCallbacks?: boolean } = {},
): Promise<void> {
  const r = this as any;
  r._startTransactionState = null;
  try {
    if (shouldRunCallbacks && isTriggerTransactionalCallbacks.call(this)) {
      r._committedAlreadyCalled = true;
      const ctor = this.constructor as typeof Base;
      await runAfterCallbacksOnProto((ctor as any).prototype, "commit", this);
    }
  } finally {
    r._committedAlreadyCalled = false;
    r._triggerUpdateCallback = false;
    r._triggerDestroyCallback = false;
  }
}

/**
 * Run after_rollback callbacks on the record.
 *
 * Mirrors: ActiveRecord::Transactions#rolledback!
 */
export async function rolledbackBang(
  this: Base,
  {
    forceRestoreState = false,
    shouldRunCallbacks = true,
  }: { forceRestoreState?: boolean; shouldRunCallbacks?: boolean } = {},
): Promise<void> {
  try {
    if (shouldRunCallbacks && isTriggerTransactionalCallbacks.call(this)) {
      const ctor = this.constructor as typeof Base;
      await runAfterCallbacksOnProto((ctor as any).prototype, "rollback", this);
    }
  } finally {
    _restoreTransactionRecordState.call(this, forceRestoreState);
    clearTransactionRecordState.call(this);
    if (forceRestoreState) {
      // Force-null _startTransactionState on full outer rollback. Inner
      // savepoint commits move records to the parent via add_transaction_record
      // without calling committedBang — matching Rails' commit_records else branch
      // which skips committed! in the happy path. Level can therefore be > 1 here.
      // clearTransactionRecordState only decrements and would leave a stale
      // snapshot — null it unconditionally on forceRestore.
      (this as any)._startTransactionState = null;
      (this as any)._triggerUpdateCallback = false;
      (this as any)._triggerDestroyCallback = false;
    }
  }
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

/** @internal */
export function rememberTransactionRecordState(this: Base): TransactionRecordSnapshot {
  const r = this as any;
  // Initialize state once per outermost transaction, then increment level for
  // each savepoint. Mirrors Rails' @_start_transaction_state ||= {...}; level += 1.
  if (!r._startTransactionState) {
    r._startTransactionState = {
      newRecord: r._newRecord,
      destroyed: r._destroyed,
      frozen: r._attributes.isFrozen(),
      id: this.id,
      previouslyNewRecord: r._previouslyNewRecord,
      attributes: r._attributes.deepDup(),
      level: 0,
    };
  }
  r._startTransactionState.level += 1;

  // Mirrors Rails' _committed_already_called guard inside remember_transaction_record_state.
  if (r._committedAlreadyCalled) {
    r._newRecordBeforeLastCommit = false;
  } else {
    r._newRecordBeforeLastCommit = r._startTransactionState.newRecord;
  }

  // Return CURRENT identity state at this savepoint level — not the outermost
  // _startTransactionState snapshot. The returned snapshot is captured by
  // withTransactionReturningStatus's afterRollback hook and passed to
  // restoreTransactionRecordState. For nested savepoints, the record may have
  // already been modified (e.g. _newRecord flipped after an outer insert), so
  // restoring to the outermost state would be wrong.
  return {
    newRecord: r._newRecord,
    destroyed: r._destroyed,
    frozen: r._attributes.isFrozen(),
    id: this.id,
    previouslyNewRecord: r._previouslyNewRecord,
  };
}

/**
 * Restore record identity state from a snapshot after a transaction rollback.
 * Does NOT restore tracking flags — those reflect what happened during the
 * transaction and are needed by trigger_transactional_callbacks?.
 *
 * Mirrors: ActiveRecord::Transactions#restore_transaction_record_state
 *
 * @internal
 */
export function restoreTransactionRecordState(
  this: Base,
  snapshot: TransactionRecordSnapshot,
): void {
  const r = this as any;
  r._newRecord = snapshot.newRecord;
  r._destroyed = snapshot.destroyed;
  r._previouslyNewRecord = snapshot.previouslyNewRecord;

  // Unfreeze the attribute set while internal fields are restored so the
  // PK write below always succeeds — even when the snapshot itself was
  // frozen. Mirrors Rails' `restore_transaction_record_state`, which
  // unconditionally reassigns `@attributes` to a fresh mapped set.
  if (r._attributes.isFrozen()) {
    r._attributes = r._attributes.deepDup();
  }

  // Restore the primary key if it was auto-assigned during insert.
  // Guard prevents clobbering dirty-tracking state already established by
  // _restoreTransactionRecordState (which calls redetectChanges before this).
  if (snapshot.newRecord && !Array.isArray(this.id)) {
    const ctor = this.constructor as typeof Base;
    const pk = ctor.primaryKey as string;
    if (r._attributes.fetchValue(pk) !== snapshot.id) {
      r._attributes.set(pk, snapshot.id);
      r._dirty.redetectChanges(r._attributes);
    }
  }

  // Re-apply the snapshot's frozen state *after* any internal restores.
  if (snapshot.frozen && !r._attributes.isFrozen()) {
    r._attributes.freeze();
  }
}

/** @internal */
function _restoreTransactionRecordState(this: Base, forceRestoreState = false): void {
  const r = this as any;
  if (!r._startTransactionState) return;
  const state = r._startTransactionState;
  if (forceRestoreState || state.level <= 1) {
    r._newRecord = state.newRecord;
    r._destroyed = state.destroyed;
    r._previouslyNewRecord = state.previouslyNewRecord;

    // Mirrors Rails restore_transaction_record_state:
    //   @attributes = restore_state[:attributes].map { |attr|
    //     value = @attributes.fetch_value(attr.name)
    //     attr = attr.with_value_from_user(value) if attr.value != value
    //     attr }
    //
    // Rails keeps post-TX user edits in memory by reconstructing each attribute
    // with the post-TX value but the pre-TX attribute as the original_attribute.
    // Our DirtyTracker is external, so we achieve the same observable result by:
    //   1. Setting the dirty baseline to the pre-TX snapshot values
    //   2. Redetecting differences against the current (post-TX) r._attributes
    //
    // r._attributes is NOT replaced — post-TX values stay live in memory.
    // Only the PK is explicitly restored (it is auto-assigned by the DB and
    // is not a user edit worth preserving).

    // Unfreeze in place before writing the restored PK.
    if (r._attributes.isFrozen()) {
      r._attributes = r._attributes.deepDup();
    }

    // Restore primary key to the pre-TX value before redetect runs, so the
    // PK does not appear as a spurious pending change.
    const ctor = this.constructor as typeof Base;
    if (Array.isArray(ctor.primaryKey)) {
      const cols = ctor.primaryKey as string[];
      const savedId = state.id as unknown[];
      if (cols.some((col, i) => r._attributes.fetchValue(col) !== savedId[i])) {
        cols.forEach((col, i) => r._attributes.writeFromUser(col, savedId[i]));
      }
    } else if (r._attributes.fetchValue(ctor.primaryKey as string) !== state.id) {
      r._attributes.writeFromUser(ctor.primaryKey as string, state.id);
    }

    if (state.frozen && !r._attributes.isFrozen()) {
      r._attributes.freeze();
    }

    // Set pre-TX snapshot as the dirty baseline, redetect in-TX edits as dirty.
    // Mirrors Rails: @mutations_from_database = nil; @mutations_before_last_save = nil
    r._dirty.snapshot(state.attributes);
    r._dirty.clearChangesInformation();
    r._dirty.redetectChanges(r._attributes);
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
  this: Base,
  fn: () => Promise<T>,
): Promise<T> {
  const modelClass = this.constructor as typeof Base;

  // rememberTransactionRecordState also sets _newRecordBeforeLastCommit.
  const snapshot = rememberTransactionRecordState.call(this);

  // _triggerUpdateCallback/_triggerDestroyCallback are NOT reset here; Rails resets
  // those only in committed!/rolledback! ensure blocks.
  const r = this as any;
  r._transactionAction = undefined;

  let status: T;
  let rolledBack = false;

  // Mirrors Rails' `ensure_finalize = !connection.transaction_open?`.
  // inTransaction covers external transactions (e.g. fixtures) that
  // TransactionManager doesn't track — same condition used in transaction().
  const adapter = modelClass.adapter;
  const hadOuterTransaction = currentTransaction() !== null || adapter.inTransaction;
  // TransactionManager path is only active when withinNewTransaction exists AND
  // we're not in the external-transaction fallback (adapter.inTransaction &&
  // currentTransaction() === null causes transaction() to use the fallback).
  const hasTransactionManager =
    typeof (adapter as any).withinNewTransaction === "function" &&
    !(currentTransaction() === null && adapter.inTransaction);

  await transaction(modelClass, async (tx) => {
    // Enroll record with the TransactionManager so it fires committedBang/
    // rolledbackBang after the transaction commits or rolls back.
    if (hasTransactionManager) {
      await addToTransaction.call(
        this,
        !hadOuterTransaction || hasTransactionalCallbacks.call(this),
      );
    }

    tx.afterRollback(async () => {
      restoreTransactionRecordState.call(this, snapshot);
    });

    status = await fn();
    // Ruby truthiness: only false/nil trigger rollback (0, "" are truthy in Ruby)
    if (status === false || status == null) {
      rolledBack = true;
      throw new Rollback();
    }
    return status;
  });

  // For adapters without a TransactionManager, addToTransaction is a no-op,
  // so we must schedule callbacks manually.
  if (!hasTransactionManager) {
    if (!rolledBack) {
      const outerTx = currentTransaction();
      if (outerTx) {
        outerTx.afterCommit(async () => await committedBang.call(this));
        outerTx.afterRollback(async () => {
          // Fire callbacks before restoring state — rolledbackBang needs
          // isPersisted()/isDestroyed() to reflect what happened during the
          // transaction, not the pre-transaction state. Matches Rails where
          // rolledback! fires during rollback, restore runs in ensure.
          await rolledbackBang.call(this);
          restoreTransactionRecordState.call(this, snapshot);
        });
      } else {
        await committedBang.call(this);
      }
    } else {
      await rolledbackBang.call(this);
    }
  }

  return status!;
}

/**
 * Mirrors: ActiveRecord::Transactions#_new_record_before_last_commit (attr_accessor)
 */
export function _newRecordBeforeLastCommit(this: Base): boolean {
  return (this as any)._newRecordBeforeLastCommit ?? false;
}

/**
 * Returns whether the record should trigger transactional callbacks.
 *
 * Mirrors: ActiveRecord::Transactions#trigger_transactional_callbacks?
 */
export function isTriggerTransactionalCallbacks(this: Base): boolean {
  const r = this as any;
  // Use === true to avoid prototype method bleeding through as a truthy value.
  const newBeforeLastCommit = r._newRecordBeforeLastCommit === true;
  const triggerUpdate = r._triggerUpdateCallback === true;
  const triggerDestroy = r._triggerDestroyCallback === true;
  return (
    ((newBeforeLastCommit || triggerUpdate) && this.isPersisted()) ||
    (triggerDestroy && this.isDestroyed())
  );
}

// ---------------------------------------------------------------------------
// Private instance helpers — mirrors ActiveRecord::Transactions private block.
// Exported so base.ts can wire them into include(Base, {...}) for api:compare.
// ---------------------------------------------------------------------------

// Mirrors: attr_reader :_committed_already_called
/** @internal */
export function _committedAlreadyCalled(this: Base): boolean | null {
  return (this as any)._committedAlreadyCalled ?? null;
}

// Mirrors: attr_reader :_trigger_update_callback
/** @internal */
export function _triggerUpdateCallback(this: Base): boolean | null {
  return (this as any)._triggerUpdateCallback ?? null;
}

// Mirrors: attr_reader :_trigger_destroy_callback
/** @internal */
export function _triggerDestroyCallback(this: Base): boolean | null {
  return (this as any)._triggerDestroyCallback ?? null;
}

// Mirrors: ActiveRecord::Transactions#init_internals
/** @internal */
function initInternals(record: Base): void {
  const r = record as any;
  r._startTransactionState = null;
  r._committedAlreadyCalled = null;
  r._newRecordBeforeLastCommit = null;
}

// Mirrors: ActiveRecord::Transactions#clear_transaction_record_state
/** @internal */
export function clearTransactionRecordState(this: Base): void {
  const r = this as any;
  if (!r._startTransactionState) return;
  r._startTransactionState.level -= 1;
  if (r._startTransactionState.level < 1) r._startTransactionState = null;
}

// Mirrors: ActiveRecord::Transactions#transaction_include_any_action?
/** @internal */
export function isTransactionIncludeAnyAction(this: Base, actions: string[]): boolean {
  const r = this as any;
  return actions.some((action) => {
    switch (action) {
      case "create":
        return this.isPersisted() && r._newRecordBeforeLastCommit === true;
      case "update":
        return (
          !(r._newRecordBeforeLastCommit || this.isDestroyed()) && r._triggerUpdateCallback === true
        );
      case "destroy":
        return r._triggerDestroyCallback === true;
      default:
        return false;
    }
  });
}

// Mirrors: ActiveRecord::Transactions#add_to_transaction
/** @internal */
export async function addToTransaction(this: Base, ensureFinalize = true): Promise<void> {
  const ctor = this.constructor as any;
  // We're always called from within a transaction, so the adapter IS the
  // current connection — no need to go through withConnection.
  ctor.adapter?.addTransactionRecord?.(this, ensureFinalize);
}

// Mirrors: ActiveRecord::Transactions#has_transactional_callbacks?
/** @internal */
export function hasTransactionalCallbacks(this: Base): boolean {
  const proto = (this.constructor as any).prototype;
  const commit = asPeekCallbackChain(proto, "commit");
  if (commit && commit.entries.length > 0) return true;
  const rollback = asPeekCallbackChain(proto, "rollback");
  return !!(rollback && rollback.entries.length > 0);
}

// ---------------------------------------------------------------------------
// Private class helpers — mirrors ActiveRecord::Transactions::ClassMethods private block.
// ---------------------------------------------------------------------------

// Mirrors: ActiveRecord::Transactions::ClassMethods#prepend_option
/** @internal */
function prependOption(this: unknown): Record<string, unknown> {
  return {};
}

const VALID_TRANSACTION_ACTIONS = new Set(["create", "update", "destroy"]);

/**
 * Synthesize an `on:` option into an `if:` predicate before the conditions
 * reach the activemodel chain. Mirrors the transformation Rails performs in
 * `ActiveRecord::Transactions::ClassMethods#set_callback` (transactions.rb:308-315).
 *
 * Returns a new conditions object with `on:` removed and a synthesized `if:`
 * prepended, or the original conditions unchanged when `on:` is absent.
 *
 * @internal
 */
export function synthOnCondition(
  conditions: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!conditions || conditions.on === undefined) return conditions;
  const fireOn = (Array.isArray(conditions.on) ? conditions.on : [conditions.on]) as string[];
  assertValidTransactionAction(fireOn);
  const { on: _on, if: existingIf, ...rest } = conditions;
  const synthIf = (record: Base): boolean => isTransactionIncludeAnyAction.call(record, fireOn);
  return {
    ...rest,
    if: existingIf
      ? (record: Base) => synthIf(record) && (existingIf as CallbackFn)(record)
      : synthIf,
  };
}

// Mirrors: ActiveRecord::Transactions::ClassMethods#assert_valid_transaction_action
/** @internal */
function assertValidTransactionAction(actions: string[]): void {
  const invalid = actions.filter((a) => !VALID_TRANSACTION_ACTIONS.has(a));
  if (invalid.length > 0) {
    throw new ArgumentError(
      `:on conditions for after_commit and after_rollback callbacks have to be one of [:create, :destroy, :update]`,
    );
  }
}
