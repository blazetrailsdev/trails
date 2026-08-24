import type { Base } from "./base.js";

import {
  ArgumentError,
  Model,
  type AttributeSet,
  type CallbackObject,
} from "@blazetrails/activemodel";
import {
  IsolatedExecutionState,
  defineCallbacks,
  extractOptionsBang,
  included,
  kernelArray,
  peekCallbackChain as asPeekCallbackChain,
  runCallbacks,
  type FilterListEntry,
} from "@blazetrails/activesupport";
import { ActiveRecord } from "./ar-config.js";
import { Rollback } from "./errors.js";
export { Rollback };
import { threadedConnectionFor } from "./connection-handling.js";

import { Transaction } from "./connection-adapters/abstract/transaction.js";
import { Transaction as PublicTransaction } from "./transaction.js";
import { transaction as dbTransaction } from "./connection-adapters/abstract/database-statements.js";

type TransactionAction = "create" | "update" | "destroy";

const CURRENT_TRANSACTION_KEY = Symbol.for("ar_current_transaction");

/**
 * Get the currently active transaction, if any.
 */
export function currentTransaction(): Transaction | null {
  return IsolatedExecutionState.get<Transaction | null>(CURRENT_TRANSACTION_KEY) ?? null;
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
 *
 * Mirrors: ActiveRecord.after_all_transactions_commit (active_record.rb:527),
 * which collects `all_open_transactions` (active_record.rb:553) — only
 * transactions that are `open? && joinable? && !state.invalidated?` — and
 * yields immediately when none are open. A *finalized* or *invalidated*
 * transaction is therefore not "open" here and the block runs immediately; this
 * deliberately does NOT route through the per-transaction
 * `Transaction#afterCommit`, which (per transaction.rb:85) raises on a finalized
 * transaction.
 */
export function afterAllTransactionsCommit(fn: () => void | Promise<void>): void | Promise<void> {
  const tx = currentTransactionPublic();
  if (tx.isClosed()) {
    return fn();
  }
  return tx.afterCommit(fn);
}

/**
 * Execute a block within a database transaction.
 *
 * Mirrors: ActiveRecord::Base.transaction
 *
 * Delegates through the database-statements transaction function which
 * routes through TransactionManager for proper Rails-style transaction
 * lifecycle. Every trails adapter routes transactions through TM
 * (post TM Phase 3 unification).
 */
export async function transaction<T>(
  modelClass: typeof Base,
  fn: (tx: PublicTransaction) => Promise<T>,
  options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
): Promise<T | undefined> {
  if (options) {
    for (const key of Object.keys(options)) {
      if (key !== "isolation" && key !== "requiresNew" && key !== "joinable") {
        throw new ArgumentError(`unknown keyword: :${key}`);
      }
    }
  }

  // Mirrors Rails `ActiveRecord::Transactions::ClassMethods#transaction`, which
  // runs inside `with_connection { |c| c.transaction(...) }` and threads the
  // yielded connection. Taking the yielded connection (the block parameter
  // connection) instead of the deprecated `.connection` getter keeps the build/
  // callback path from flipping the lease permanent under
  // `permanent_connection_checkout = :deprecated | :disallowed`, so the pool
  // releases the connection once the transaction completes.
  return modelClass.withConnection(async (adapter) => {
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
        return IsolatedExecutionState.scope(CURRENT_TRANSACTION_KEY, internalTx, () => {
          const publicTx =
            userTx instanceof PublicTransaction ? userTx : internalTx.userTransaction;
          return fn(publicTx);
        });
      },
      {
        requiresNew: options?.requiresNew,
        isolation: options?.isolation,
        joinable: options?.joinable,
      },
    );
    return result as T | undefined;
  });
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
// `this`-typed functions assigned to Base, so `this` is the model class the
// way `self` is in the Ruby ClassMethods module.
// ---------------------------------------------------------------------------

type CallbackFn = (...args: any[]) => any;

/**
 * What the `ClassMethods` transaction macros take as a filter. Rails' `*args`
 * reaches `set_callback`, so a Symbol method name is accepted alongside a
 * block — and a Ruby Symbol is a colon-prefixed string in trails.
 */
type TransactionCallbackFilter<T extends typeof Model> =
  | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
  | CallbackObject
  | string;
type CallbackOptions = {
  // Rails takes any Symbol here and rejects a bad one at runtime, in
  // `assert_valid_transaction_action` (transactions.rb:344-348) — so the type
  // must stay wide enough for that raise to be reachable.
  on?: string | string[];
  if?: CallbackFn | CallbackFn[];
  unless?: CallbackFn | CallbackFn[];
  prepend?: boolean;
};

/**
 * Mirrors: ActiveRecord::Transactions' `included do ... end` (transactions.rb:10-14).
 */
export const InstanceMethods = {
  [included](base: typeof Model): void {
    for (const name of ["commit", "rollback", "before_commit"]) {
      defineCallbacks(base.prototype, name, { scope: ["kind", "name"] });
    }
  },
};

/** Mirrors: ActiveRecord::Transactions::ClassMethods#before_commit */
export function beforeCommit<T extends typeof Base>(
  this: T,
  fn: TransactionCallbackFilter<T>,
  options?: CallbackOptions,
): void {
  const args = setOptionsForCallbacksBang(options as Record<string, unknown> | undefined);
  setCallback.call(this, "before_commit", "before", fn, args);
}

/** Mirrors: ActiveRecord::Transactions::ClassMethods#after_commit */
export function afterCommit<T extends typeof Model>(
  this: T,
  fn: TransactionCallbackFilter<T>,
  options?: CallbackOptions,
): void {
  const args = setOptionsForCallbacksBang(
    options as Record<string, unknown> | undefined,
    prependOption(),
  );
  setCallback.call(this, "commit", "after", fn, args);
}

/** Mirrors: ActiveRecord::Transactions::ClassMethods#after_save_commit */
export function afterSaveCommit<T extends typeof Base>(
  this: T,
  fn: TransactionCallbackFilter<T>,
  options?: CallbackOptions,
): void {
  const args = setOptionsForCallbacksBang(options as Record<string, unknown> | undefined, {
    on: ["create", "update"],
    ...prependOption(),
  });
  setCallback.call(this, "commit", "after", fn, args);
}

/** Mirrors: ActiveRecord::Transactions::ClassMethods#after_create_commit */
export function afterCreateCommit<T extends typeof Base>(
  this: T,
  fn: TransactionCallbackFilter<T>,
  options?: CallbackOptions,
): void {
  const args = setOptionsForCallbacksBang(options as Record<string, unknown> | undefined, {
    on: "create",
    ...prependOption(),
  });
  setCallback.call(this, "commit", "after", fn, args);
}

/** Mirrors: ActiveRecord::Transactions::ClassMethods#after_update_commit */
export function afterUpdateCommit<T extends typeof Base>(
  this: T,
  fn: TransactionCallbackFilter<T>,
  options?: CallbackOptions,
): void {
  const args = setOptionsForCallbacksBang(options as Record<string, unknown> | undefined, {
    on: "update",
    ...prependOption(),
  });
  setCallback.call(this, "commit", "after", fn, args);
}

/** Mirrors: ActiveRecord::Transactions::ClassMethods#after_destroy_commit */
export function afterDestroyCommit<T extends typeof Base>(
  this: T,
  fn: TransactionCallbackFilter<T>,
  options?: CallbackOptions,
): void {
  const args = setOptionsForCallbacksBang(options as Record<string, unknown> | undefined, {
    on: "destroy",
    ...prependOption(),
  });
  setCallback.call(this, "commit", "after", fn, args);
}

/** Mirrors: ActiveRecord::Transactions::ClassMethods#after_rollback */
export function afterRollback<T extends typeof Model>(
  this: T,
  fn: TransactionCallbackFilter<T>,
  options?: CallbackOptions,
): void {
  const args = setOptionsForCallbacksBang(
    options as Record<string, unknown> | undefined,
    prependOption(),
  );
  setCallback.call(this, "rollback", "after", fn, args);
}

/**
 * Mirrors: ActiveRecord::Transactions::ClassMethods#set_callback (transactions.rb:304-318).
 *
 * Rails' `super` is ActiveSupport::Callbacks' `set_callback`, reached here as
 * ActiveModel's `Model.setCallback` — a `this`-typed function assigned to a
 * class cannot spell `super`, so the inherited implementation is named.
 *
 * `*filter_list` is untyped in Ruby and stays open here so the macros above can
 * forward their own `TransactionCallbackFilter<T>` through it. Rails leaves
 * `:on` in the Hash it hands to `super`, where an unknown key is ignored;
 * trails' `assertValidKeys` rejects it, so it comes off first.
 */
export function setCallback<T extends typeof Model>(
  this: T,
  name: string,
  ...filterList: FilterListEntry<any>[]
): void {
  const [rest, extracted] = extractOptionsBang(filterList);
  const options = { ...extracted } as Record<string, unknown>;

  if ((name === "commit" || name === "rollback") && options.on !== undefined) {
    const fireOn = kernelArray(options.on) as string[];
    assertValidTransactionAction(fireOn);
    options.if = [
      (record: Base): boolean => isTransactionIncludeAnyAction.call(record, fireOn),
      ...kernelArray(options.if),
    ];
    delete options.on;
  }

  (Model.setCallback as (this: T, name: string, ...args: unknown[]) => void).call(
    this,
    name,
    ...rest,
    options,
  );
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
  await runCallbacks(record, "before_commit");
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
      await runCallbacks(this, "commit");
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
      await runCallbacks(this, "rollback");
    }
  } finally {
    restoreTransactionRecordState.call(this, forceRestoreState);
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
/** @internal */
export function rememberTransactionRecordState(this: Base): void {
  const r = this as any;
  // Initialize state once per outermost transaction, then increment level for
  // each savepoint. Mirrors Rails' @_start_transaction_state ||= {...}; level += 1.
  if (!r._startTransactionState) {
    const snapshotAttrs = r._attributes.deepDup();
    // Revert any pre-TX dirty changes so the snapshot holds DB baseline values.
    // On rollback, _dirty.snapshot(state.attributes) will then establish the
    // correct original baseline, and redetectChanges will show the right diff.
    const dirtyChanges = r._dirty.changes as Record<string, [unknown, unknown]>;
    for (const [name, [original]] of Object.entries(dirtyChanges)) {
      snapshotAttrs.writeFromUser(name, original);
    }
    r._startTransactionState = {
      newRecord: r._newRecord,
      destroyed: r._destroyed,
      frozen: r._attributes.isFrozen(),
      id: this.id,
      previouslyNewRecord: r._previouslyNewRecord,
      attributes: snapshotAttrs,
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
}

/**
 * Restore the new record state and id of a record that was previously saved by
 * a call to save_record_state.
 *
 * Mirrors: ActiveRecord::Transactions#restore_transaction_record_state
 *
 * @internal
 */
export function restoreTransactionRecordState(this: Base, forceRestoreState = false): void {
  const r = this as any;
  const restoreState = r._startTransactionState;
  if (restoreState) {
    if (forceRestoreState || restoreState.level <= 1) {
      r._newRecord = restoreState.newRecord;
      r._previouslyNewRecord = restoreState.previouslyNewRecord;
      r._destroyed = restoreState.destroyed;
      r._attributes = (restoreState.attributes as AttributeSet).map((attr) => {
        const value = r._attributes.fetchValue(attr.name);
        if (attr.value !== value) attr = attr.withValueFromUser(value);
        return attr;
      });
      r._mutationsFromDatabase = null;
      r._mutationsBeforeLastSave = null;
      const ctor = this.constructor as typeof Base;
      const primaryKey = ctor.primaryKey;
      if (ctor.compositePrimaryKey) {
        const cols = primaryKey as string[];
        const savedId = restoreState.id as unknown[];
        if (cols.some((col, i) => r._attributes.fetchValue(col) !== savedId[i])) {
          cols.forEach((col, i) => {
            r._attributes.writeFromUser(col, savedId[i]);
          });
        }
      } else {
        if (r._attributes.fetchValue(primaryKey as string) !== restoreState.id) {
          r._attributes.writeFromUser(primaryKey as string, restoreState.id);
        }
      }

      // trails' dirty state lives in an external `DirtyTracker`, not in each
      // `Attribute`'s `original_attribute`, so the `map` above cannot by itself
      // move the changed-set the way nulling Rails' two mutation trackers does.
      // Seed the tracker from the pre-TX snapshot and re-derive the diff against
      // the rebuilt set to reach the same `changes()`. Order matters:
      // `redetectChanges` only sets entries, never deletes them, so the primary
      // key has to be restored (above) before it runs.
      r._dirty.snapshot(restoreState.attributes);
      r._dirty.clearChangesInformation();
      r._dirty.redetectChanges(r._attributes);

      if (restoreState.frozen) r._attributes.freeze();
    }
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

  // _triggerUpdateCallback/_triggerDestroyCallback are NOT reset here; Rails resets
  // those only in committed!/rolledback! ensure blocks.
  const r = this as any;
  r._transactionAction = undefined;

  let status: T;

  // Wrap in `with_connection` so the `ensure_finalize` connection probe and the
  // nested transaction don't permanently lease a connection under
  // `permanent_connection_checkout = :deprecated | :disallowed`. The yielded
  // connection is taken from the block parameter rather than re-read off the
  // deprecated `.connection` getter, matching Rails.
  await modelClass.withConnection(async (adapter) => {
    // Mirrors Rails' `ensure_finalize = !connection.transaction_open?`.
    const hadOuterTransaction = currentTransaction() !== null || adapter.inTransaction;

    await transaction(modelClass, async () => {
      // Enroll record with the TransactionManager so it fires committedBang/
      // rolledbackBang after the transaction commits or rolls back. The TM-driven
      // rolledbackBang path calls restoreTransactionRecordState which reads the
      // persistent _startTransactionState snapshot — matching Rails exactly. We
      // intentionally do NOT register a per-call tx.afterRollback hook here: the
      // closure would capture per-save state, and on multi-save rollbacks the
      // last-registered hook would overwrite the correct outermost snapshot.
      await addToTransaction.call(
        this,
        !hadOuterTransaction || hasTransactionalCallbacks.call(this),
      );
      rememberTransactionRecordState.call(this);

      status = await fn();
      // Ruby truthiness: only false/nil trigger rollback (0, "" are truthy in Ruby)
      if (status === false || status == null) {
        throw new Rollback();
      }
      return status;
    });
  });

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
// Exported so base.ts can wire them into include(Base, {...}) for parity:api.
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

// Mirrors: ActiveRecord::Transactions#init_internals (transactions.rb:432-437)
/** @internal */
export function initInternals(this: Base, super_: () => void): void {
  super_();
  const r = this as any;
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
  // current connection — use the threaded connection rather than the deprecated
  // `.connection` getter so we don't flip the lease permanent.
  const adapter = threadedConnectionFor(ctor) ?? ctor.connection;
  adapter?.addTransactionRecord?.(this, ensureFinalize);
}

// Mirrors: ActiveRecord::Transactions#has_transactional_callbacks?
/** @internal */
export function hasTransactionalCallbacks(this: Base): boolean {
  const proto = (this.constructor as any).prototype;
  const rollback = asPeekCallbackChain(proto, "rollback");
  const commit = asPeekCallbackChain(proto, "commit");
  const beforeCommitChain = asPeekCallbackChain(proto, "before_commit");
  return (
    !(rollback == null || rollback.isEmpty) ||
    !(commit == null || commit.isEmpty) ||
    !(beforeCommitChain == null || beforeCommitChain.isEmpty)
  );
}

// ---------------------------------------------------------------------------
// Private class helpers — mirrors ActiveRecord::Transactions::ClassMethods private block.
// ---------------------------------------------------------------------------

// Mirrors: ActiveRecord::Transactions::ClassMethods#prepend_option
/** @internal */
function prependOption(): Record<string, unknown> {
  if (ActiveRecord.runAfterTransactionCallbacksInOrderDefined) {
    return { prepend: true };
  } else {
    return {};
  }
}

const VALID_TRANSACTION_ACTIONS = new Set(["create", "update", "destroy"]);

/**
 * Mirrors: ActiveRecord::Transactions::ClassMethods#set_options_for_callbacks!
 *
 * Ruby mutates `args` in place; TS returns the merged option hash instead —
 * the callers bind it straight back into the `set_callback` call, so the
 * mutation is not observable. `on:` is dropped from the returned hash rather
 * than left in place as Ruby leaves it: ActiveModel's chain validates `on:`
 * itself and has no ActiveRecord `transaction_include_any_action?` to build,
 * so a surviving `on:` would be re-validated against the `before_commit`
 * event and rejected.
 *
 * @internal
 *
 * @missingRailsCall merge! — PERMANENT: Reviewed (RFC 0106 wave 4c): Ruby's
 *   `args.extract_options!.merge!(enforced_options)` mutates the extracted hash
 *   in place; TS returns a fresh merged object via spread because the caller
 *   binds the result straight into `set_callback`, so there is no in-place
 *   `merge!` to name.
 */
export function setOptionsForCallbacksBang(
  options: Record<string, unknown> | undefined,
  enforcedOptions: Record<string, unknown> = {},
): Record<string, unknown> {
  const merged = { ...options, ...enforcedOptions };

  if (merged.on !== undefined) {
    const fireOn = (Array.isArray(merged.on) ? merged.on : [merged.on]) as string[];
    assertValidTransactionAction(fireOn);
    const { on: _on, if: existingIf, ...rest } = merged;
    return {
      ...rest,
      if: [
        (record: Base): boolean => isTransactionIncludeAnyAction.call(record, fireOn),
        ...(existingIf === undefined ? [] : Array.isArray(existingIf) ? existingIf : [existingIf]),
      ],
    };
  }

  return merged;
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
