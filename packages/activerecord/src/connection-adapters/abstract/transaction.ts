import type { DatabaseAdapter } from "../../adapter.js";
import { Transaction as UserTransaction } from "../../transaction.js";
import {
  ActiveRecordError,
  PreparedStatementCacheExpired,
  NotImplementedError,
  TransactionIsolationError,
} from "../../errors.js";
import {
  Notifications,
  NotificationEvent,
  getAsyncContext,
  type AsyncContext,
} from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::TransactionState
 */
export class TransactionState {
  private _state:
    | "committed"
    | "fully_committed"
    | "rolledback"
    | "fully_rolledback"
    | "invalidated"
    | null = null;
  private _children: TransactionState[] | null = null;

  constructor(state: TransactionState["_state"] = null) {
    this._state = state;
  }

  addChild(state: TransactionState): void {
    if (!this._children) this._children = [];
    this._children.push(state);
  }

  get finalized(): boolean {
    return this._state !== null;
  }

  get committed(): boolean {
    return this._state === "committed" || this._state === "fully_committed";
  }

  isCommitted(): boolean {
    return this.committed;
  }

  get fullyCommitted(): boolean {
    return this._state === "fully_committed";
  }

  isFullyCommitted(): boolean {
    return this.fullyCommitted;
  }

  isRolledback(): boolean {
    return this._state === "rolledback" || this._state === "fully_rolledback";
  }

  get rolledBack(): boolean {
    return this.isRolledback();
  }

  isFullyRolledback(): boolean {
    return this._state === "fully_rolledback";
  }

  get fullyRolledBack(): boolean {
    return this.isFullyRolledback();
  }

  isInvalidated(): boolean {
    return this._state === "invalidated";
  }

  isCompleted(): boolean {
    return this.committed || this.isRolledback();
  }

  get fullyCompleted(): boolean {
    return this.isCompleted();
  }

  rollbackBang(): void {
    this._children?.forEach((c) => c.rollbackBang());
    this._state = "rolledback";
  }

  fullRollbackBang(): void {
    this._children?.forEach((c) => c.rollbackBang());
    this._state = "fully_rolledback";
  }

  invalidateBang(): void {
    this._children?.forEach((c) => c.invalidateBang());
    this._state = "invalidated";
  }

  commitBang(): void {
    this._state = "committed";
  }

  fullCommitBang(): void {
    this._state = "fully_committed";
  }

  nullifyBang(): void {
    this._state = null;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationNotStartedError
 */
export class InstrumentationNotStartedError extends ActiveRecordError {
  constructor(message = "Called finish on a transaction that hasn't started") {
    super(message);
    this.name = "InstrumentationNotStartedError";
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationAlreadyStartedError
 */
export class InstrumentationAlreadyStartedError extends ActiveRecordError {
  constructor(message = "Called start on an already started transaction") {
    super(message);
    this.name = "InstrumentationAlreadyStartedError";
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::TransactionInstrumenter
 */
export class TransactionInstrumenter {
  static readonly InstrumentationNotStartedError = InstrumentationNotStartedError;
  static readonly InstrumentationAlreadyStartedError = InstrumentationAlreadyStartedError;

  private _started = false;
  private _basePayload: Record<string, unknown>;
  private _payload: Record<string, unknown> | null = null;
  private _event: NotificationEvent | null = null;

  constructor(payload: Record<string, unknown> = {}) {
    this._basePayload = payload;
  }

  start(): void {
    if (this._started) {
      throw new InstrumentationAlreadyStartedError();
    }
    this._started = true;

    Notifications.instrument("start_transaction.active_record", this._basePayload);

    this._payload = { ...this._basePayload };
    this._event = new NotificationEvent(
      "transaction.active_record",
      Temporal.Now.instant(),
      this._payload,
    );
  }

  finish(outcome: string): void {
    if (!this._started) {
      throw new InstrumentationNotStartedError();
    }
    this._started = false;

    if (this._payload) {
      this._payload.outcome = outcome;
    }
    if (this._event) {
      this._event.finish();
      // Publish with the finished event's payload including timing and outcome.
      // Ideally we'd publish the Event instance directly (like Rails' handle.finish),
      // but Notifications.publish creates a new Event. The payload carries the
      // outcome; duration can be derived from the event's time/end if needed.
      Notifications.publish("transaction.active_record", {
        ...this._event.payload,
        duration: this._event.duration,
      });
    }
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::NullTransaction
 */
export class NullTransaction {
  state: TransactionState | undefined = undefined;

  get open(): boolean {
    return false;
  }

  get closed(): boolean {
    return true;
  }

  get joinable(): boolean {
    return false;
  }

  isRestartable(): boolean {
    return false;
  }

  isDirty(): boolean {
    return false;
  }

  dirtyBang(): void {}

  isInvalidated(): boolean {
    return false;
  }

  invalidateBang(): void {}

  isMaterialized(): boolean {
    return false;
  }

  addRecord(_record: unknown, _ensureFinalize = true): void {}

  beforeCommit(fn?: () => void | Promise<void>): void | Promise<void> {
    if (fn) return fn();
  }

  afterCommit(fn?: () => void | Promise<void>): void | Promise<void> {
    if (fn) return fn();
  }

  afterRollback(_fn?: () => void | Promise<void>): void {}

  get userTransaction(): UserTransaction {
    return UserTransaction.NULL_TRANSACTION;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Transaction::Callback
 */
export class TransactionCallback {
  private _event: "before_commit" | "after_commit" | "after_rollback";
  private _callback: () => void | Promise<void>;

  constructor(
    event: "before_commit" | "after_commit" | "after_rollback",
    callback: () => void | Promise<void>,
  ) {
    this._event = event;
    this._callback = callback;
  }

  beforeCommit(): void | Promise<void> {
    if (this._event === "before_commit") return this._callback();
  }

  afterCommit(): void | Promise<void> {
    if (this._event === "after_commit") return this._callback();
  }

  afterRollback(): void | Promise<void> {
    if (this._event === "after_rollback") return this._callback();
  }
}

/**
 * Connection interface used by Transaction classes.
 * Extends DatabaseAdapter with the DatabaseStatements methods that
 * Transaction classes call. This avoids `as any` casts throughout.
 */
export interface TransactionConnection extends DatabaseAdapter {
  beginDbTransaction?(): void | Promise<void>;
  beginIsolatedDbTransaction?(isolation: string): void | Promise<void>;
  beginDeferredTransaction?(isolation?: string | null): void | Promise<void>;
  commitDbTransaction?(): void | Promise<void>;
  rollbackDbTransaction?(): void | Promise<void>;
  restartDbTransaction?(): void | Promise<void>;
  resetIsolationLevel?(): void | Promise<void>;
  supportsLazyTransactions?(): boolean;
  supportsRestartDbTransaction?(): boolean;
  addTransactionRecord?(record: unknown): void;
  active?: boolean;
  currentTransaction?(): Transaction | NullTransaction;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Transaction
 */
export class Transaction {
  readonly state = new TransactionState();
  private _callbacks: TransactionCallback[] | null = null;
  private _records: unknown[] | null = null;
  private _lazyEnrollmentRecords: Map<unknown, unknown> | null = null;
  private _connection: TransactionConnection;
  private _joinable: boolean;
  readonly isolationLevel: string | null;
  private _materialized = false;
  private _runCommitCallbacks: boolean;
  private _dirty = false;
  written = false;
  readonly userTransaction: UserTransaction;
  protected _instrumenter: TransactionInstrumenter;

  static readonly Callback = TransactionCallback;

  constructor(
    connection: TransactionConnection,
    options: {
      isolation?: string | null;
      joinable?: boolean;
      runCommitCallbacks?: boolean;
    } = {},
  ) {
    this._connection = connection;
    this._joinable = options.joinable ?? true;
    this.isolationLevel = options.isolation ?? null;
    this._runCommitCallbacks = options.runCommitCallbacks ?? false;
    this.userTransaction = this._joinable
      ? new UserTransaction(this)
      : UserTransaction.NULL_TRANSACTION;
    this._instrumenter = new TransactionInstrumenter({
      connection,
      transaction: this.userTransaction,
    });
  }

  get connection(): TransactionConnection {
    return this._connection;
  }

  get open(): boolean {
    return true;
  }

  get closed(): boolean {
    return false;
  }

  get joinable(): boolean {
    return this._joinable;
  }

  invalidateBang(): void {
    this.state.invalidateBang();
  }

  isInvalidated(): boolean {
    return this.state.isInvalidated();
  }

  dirtyBang(): void {
    this._dirty = true;
  }

  isDirty(): boolean {
    return this._dirty;
  }

  isRestartable(): boolean {
    return this.joinable && !this.isDirty();
  }

  isMaterialized(): boolean {
    return this._materialized;
  }

  async materializeBang(): Promise<void> {
    this._materialized = true;
    this._instrumenter.start();
  }

  incompleteBang(): void {
    if (this.isMaterialized()) {
      this._instrumenter.finish("incomplete");
    }
  }

  async restoreBang(): Promise<void> {
    if (this.isMaterialized()) {
      this.incompleteBang();
      this._materialized = false;
      await this.materializeBang();
    }
  }

  addRecord(record: unknown, ensureFinalize = true): void {
    if (!this._records) this._records = [];
    if (ensureFinalize) {
      this._records.push(record);
    } else {
      if (!this._lazyEnrollmentRecords) this._lazyEnrollmentRecords = new Map();
      this._lazyEnrollmentRecords.set(record, record);
    }
  }

  get records(): unknown[] | null {
    if (this._lazyEnrollmentRecords) {
      if (!this._records) this._records = [];
      for (const value of this._lazyEnrollmentRecords.values()) {
        this._records.push(value);
      }
      this._lazyEnrollmentRecords = null;
    }
    return this._records;
  }

  beforeCommit(fn: () => void | Promise<void>): void {
    if (this.state.finalized) {
      throw new Error("Cannot register callbacks on a finalized transaction");
    }
    if (!this._callbacks) this._callbacks = [];
    this._callbacks.push(new TransactionCallback("before_commit", fn));
  }

  afterCommit(fn: () => void | Promise<void>): void {
    if (this.state.finalized) {
      throw new Error("Cannot register callbacks on a finalized transaction");
    }
    if (!this._callbacks) this._callbacks = [];
    this._callbacks.push(new TransactionCallback("after_commit", fn));
  }

  afterRollback(fn: () => void | Promise<void>): void {
    if (this.state.finalized) {
      throw new Error("Cannot register callbacks on a finalized transaction");
    }
    if (!this._callbacks) this._callbacks = [];
    this._callbacks.push(new TransactionCallback("after_rollback", fn));
  }

  async rollbackRecords(): Promise<void> {
    const recs = this.records;
    if (recs) {
      const ite = this.uniqueRecords(recs);
      const instanceMap = this.prepareInstancesToRunCallbacksOn(ite);

      try {
        await this.runActionOnRecords(ite, instanceMap, async (record, shouldRunCallbacks) => {
          if (typeof (record as any).rolledbackBang === "function") {
            await (record as any).rolledbackBang({
              forceRestoreState: this.isFullRollback(),
              shouldRunCallbacks,
            });
          }
        });
      } finally {
        for (const i of ite) {
          if (typeof (i as any).rolledbackBang === "function") {
            await (i as any).rolledbackBang({
              forceRestoreState: this.isFullRollback(),
              shouldRunCallbacks: false,
            });
          }
        }
      }
    }

    if (this._callbacks) {
      for (const cb of this._callbacks) {
        await cb.afterRollback();
      }
    }
  }

  async beforeCommitRecords(): Promise<void> {
    if (this._runCommitCallbacks) {
      const recs = this.records;
      if (recs) {
        const unique = this.uniqueRecords(recs);
        for (const record of unique) {
          if (typeof (record as any).beforeCommittedBang === "function") {
            await (record as any).beforeCommittedBang();
          }
        }
      }
      if (this._callbacks) {
        for (const cb of this._callbacks) {
          await cb.beforeCommit();
        }
      }
    }
  }

  async commitRecords(): Promise<void> {
    const recs = this.records;
    if (recs) {
      const ite = this.uniqueRecords(recs);

      if (this._runCommitCallbacks) {
        const instanceMap = this.prepareInstancesToRunCallbacksOn(ite);

        try {
          await this.runActionOnRecords(ite, instanceMap, async (record, shouldRunCallbacks) => {
            if (typeof (record as any).committedBang === "function") {
              await (record as any).committedBang({ shouldRunCallbacks });
            }
          });
        } finally {
          for (const i of ite) {
            if (typeof (i as any).committedBang === "function") {
              await (i as any).committedBang({ shouldRunCallbacks: false });
            }
          }
        }
      } else {
        for (const record of ite) {
          this._connection.addTransactionRecord?.(record);
        }
      }
    }

    if (this._runCommitCallbacks) {
      if (this._callbacks) {
        for (const cb of this._callbacks) {
          await cb.afterCommit();
        }
      }
    } else if (this._callbacks) {
      const current = this._connection.currentTransaction?.();
      if (current instanceof Transaction) {
        current.appendCallbacks(this._callbacks);
      }
    }
  }

  async restart(): Promise<void> {
    // No-op: subclasses (RealTransaction, SavepointTransaction) override with actual restart logic
  }

  isFullRollback(): boolean {
    return true;
  }

  /** @internal */
  appendCallbacks(callbacks: TransactionCallback[]): void {
    if (!this._callbacks) this._callbacks = [];
    this._callbacks.push(...callbacks);
  }

  async commit(): Promise<void> {
    this.state.commitBang();
  }

  async rollback(): Promise<void> {
    this.state.rollbackBang();
  }

  async runAfterCommitCallbacks(): Promise<void> {
    if (!this._callbacks) return;
    for (const cb of this._callbacks) {
      await cb.afterCommit();
    }
  }

  async runAfterRollbackCallbacks(): Promise<void> {
    if (!this._callbacks) return;
    for (const cb of this._callbacks) {
      await cb.afterRollback();
    }
  }

  /** @internal */
  private uniqueRecords(recs: unknown[]): unknown[] {
    const seen = new Set<unknown>();
    const result: unknown[] = [];
    for (const record of recs) {
      if (!seen.has(record)) {
        seen.add(record);
        result.push(record);
      }
    }
    return result;
  }

  /** @internal */
  private async runActionOnRecords(
    records: unknown[],
    instancesToRunCallbacksOn: Map<unknown, unknown>,
    action: (record: unknown, shouldRunCallbacks: boolean) => Promise<void> | void,
  ): Promise<void> {
    while (records.length > 0) {
      const record = records.shift()!;
      const shouldRunCallbacks = instancesToRunCallbacksOn.get(record) === record;
      await action(record, shouldRunCallbacks);
    }
  }

  /** @internal */
  private prepareInstancesToRunCallbacksOn(records: unknown[]): Map<unknown, unknown> {
    const candidates = new Map<unknown, unknown>();
    for (const record of records) {
      if (
        typeof (record as any).isTriggerTransactionalCallbacks !== "function" ||
        !(record as any).isTriggerTransactionalCallbacks()
      ) {
        continue;
      }

      const earlier = candidates.get(record);
      if (
        earlier &&
        typeof (record as any).constructor?.runCommitCallbacksOnFirstSavedInstancesInTransaction !==
          "undefined" &&
        (record as any).constructor.runCommitCallbacksOnFirstSavedInstancesInTransaction
      ) {
        continue;
      }

      if (
        earlier &&
        typeof (earlier as any).isDestroyed === "function" &&
        (earlier as any).isDestroyed() &&
        (typeof (record as any).isDestroyed !== "function" || !(record as any).isDestroyed())
      ) {
        continue;
      }

      if (
        earlier &&
        typeof (earlier as any)._newRecordBeforeLastCommit !== "undefined" &&
        (earlier as any)._newRecordBeforeLastCommit
      ) {
        (record as any)._newRecordBeforeLastCommit = true;
      }

      candidates.set(record, record);
    }
    return candidates;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::RestartParentTransaction
 */
export class RestartParentTransaction extends Transaction {
  private _parent: Transaction;

  constructor(
    connection: TransactionConnection,
    parentTransaction: Transaction,
    options: { isolation?: string | null; joinable?: boolean; runCommitCallbacks?: boolean } = {},
  ) {
    super(connection, options);

    this._parent = parentTransaction;

    if (this.isolationLevel) {
      throw new TransactionIsolationError(
        "cannot set transaction isolation in a nested transaction",
      );
    }

    parentTransaction.state.addChild(this.state);
  }

  override async materializeBang(): Promise<void> {
    await this._parent.materializeBang();
  }

  override isMaterialized(): boolean {
    return this._parent.isMaterialized();
  }

  async restart(): Promise<void> {
    await this._parent.restart();
  }

  override async rollback(): Promise<void> {
    this.state.rollbackBang();
    await this._parent.restart();
  }

  override async commit(): Promise<void> {
    this.state.commitBang();
  }

  /** @internal */
  override incompleteBang(): void {
    // RestartParentTransaction has no own instrumentation lifecycle —
    // materializeBang() delegates to parent, so _instrumenter is never started.
  }

  /** @internal */
  override async restoreBang(): Promise<void> {
    // No-op: RestartParentTransaction delegates materializeBang() to the parent.
    // The base restoreBang() calls materializeBang() after clearing _materialized,
    // which would invoke the parent's _instrumenter.start() a second time while it
    // is already running — raising InstrumentationAlreadyStartedError during
    // retry-on-deadlock.
  }

  override isFullRollback(): boolean {
    return false;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SavepointTransaction
 */
export class SavepointTransaction extends Transaction {
  readonly savepointName: string;

  constructor(
    connection: TransactionConnection,
    savepointName: string,
    parentTransaction: Transaction,
    options: { isolation?: string | null; joinable?: boolean; runCommitCallbacks?: boolean } = {},
  ) {
    super(connection, options);

    parentTransaction.state.addChild(this.state);

    if (this.isolationLevel) {
      throw new TransactionIsolationError(
        "cannot set transaction isolation in a nested transaction",
      );
    }

    this.savepointName = savepointName;
  }

  override async materializeBang(): Promise<void> {
    await this.connection.createSavepoint(this.savepointName);
    await super.materializeBang();
  }

  async restart(): Promise<void> {
    if (!this.isMaterialized()) return;

    this._instrumenter.finish("restart");
    this._instrumenter.start();

    await this.connection.rollbackToSavepoint(this.savepointName);
  }

  override async rollback(): Promise<void> {
    if (!this.state.isInvalidated()) {
      const conn = this.connection;
      if (this.isMaterialized() && conn.active !== false) {
        await conn.rollbackToSavepoint(this.savepointName);
      }
    }
    this.state.rollbackBang();
    if (this.isMaterialized()) {
      this._instrumenter.finish("rollback");
    }
  }

  override async commit(): Promise<void> {
    if (this.isMaterialized()) {
      await this.connection.releaseSavepoint(this.savepointName);
    }
    this.state.commitBang();
    if (this.isMaterialized()) {
      this._instrumenter.finish("commit");
    }
  }

  override isFullRollback(): boolean {
    return false;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::RealTransaction
 */
export class RealTransaction extends Transaction {
  override async materializeBang(): Promise<void> {
    if (this.joinable) {
      if (this.isolationLevel) {
        await this.connection.beginIsolatedDbTransaction?.(this.isolationLevel);
      } else {
        await this.connection.beginDbTransaction?.();
      }
    } else {
      await this.connection.beginDeferredTransaction?.(this.isolationLevel);
    }
    await super.materializeBang();
  }

  async restart(): Promise<void> {
    if (!this.isMaterialized()) return;

    this._instrumenter.finish("restart");

    if (this.connection.supportsRestartDbTransaction?.()) {
      this._instrumenter.start();
      await this.connection.restartDbTransaction?.();
    } else {
      await this.connection.rollbackDbTransaction?.();
      await this.materializeBang();
    }
  }

  override async rollback(): Promise<void> {
    if (this.isMaterialized()) {
      await this.connection.rollbackDbTransaction?.();
      if (this.isolationLevel) {
        await this.connection.resetIsolationLevel?.();
      }
    }
    this.state.fullRollbackBang();
    if (this.isMaterialized()) {
      this._instrumenter.finish("rollback");
    }
  }

  override async commit(): Promise<void> {
    if (this.isMaterialized()) {
      await this.connection.commitDbTransaction?.();
      if (this.isolationLevel) {
        await this.connection.resetIsolationLevel?.();
      }
    }
    this.state.fullCommitBang();
    if (this.isMaterialized()) {
      this._instrumenter.finish("commit");
    }
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::TransactionManager
 */
export class TransactionManager {
  private _stack: (Transaction | NullTransaction)[] = [];
  private _connection: TransactionConnection;
  private _hasUnmaterializedTransactions = false;
  private _lazyTransactionsEnabled = true;
  /** @internal AsyncContext carrying the per-acquisition lock-owner token. */
  private _lockOwner: AsyncContext<symbol> | null = null;
  /** @internal Cached AsyncContext adapter (refresh on swap, like other call sites). */
  private _lockOwnerAdapter: ReturnType<typeof getAsyncContext> | null = null;
  /** @internal Token identifying the chain that currently holds the lock. */
  private _currentLockOwner: symbol | null = null;
  /** @internal Outermost-call mutex; non-null while a foreign chain holds it. */
  private _lockChain: Promise<void> | null = null;
  /** @internal AsyncContext carrying the per-materialization owner token. */
  private _materializingOwner: AsyncContext<symbol> | null = null;
  /** @internal Cached AsyncContext adapter for the materialize owner. */
  private _materializingOwnerAdapter: ReturnType<typeof getAsyncContext> | null = null;
  /** @internal Token identifying the chain currently materializing. */
  private _currentMaterializingOwner: symbol | null = null;

  static readonly NULL_TRANSACTION = Object.freeze(new NullTransaction());

  constructor(connection: TransactionConnection) {
    this._connection = connection;
  }

  get currentTransaction(): Transaction | NullTransaction {
    return this._stack.length > 0
      ? this._stack[this._stack.length - 1]
      : TransactionManager.NULL_TRANSACTION;
  }

  get openTransactions(): number {
    return this._stack.length;
  }

  async beginTransaction(
    options: { isolation?: string | null; joinable?: boolean; _lazy?: boolean } = {},
  ): Promise<Transaction> {
    return await this.synchronize(() => this._beginTransactionInner(options));
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::TransactionManager#begin_transaction
   * inner body (the part inside `@connection.lock.synchronize`,
   * `abstract/transaction.rb:507`).
   * @internal
   */
  private async _beginTransactionInner(options: {
    isolation?: string | null;
    joinable?: boolean;
    _lazy?: boolean;
  }): Promise<Transaction> {
    const { isolation = null, joinable = true, _lazy = true } = options;
    const current = this.currentTransaction;
    const runCommitCallbacks = current instanceof Transaction ? !current.joinable : true;

    let transaction: Transaction;

    if (this._stack.length === 0) {
      transaction = new RealTransaction(this._connection, {
        isolation,
        joinable,
        runCommitCallbacks,
      });
    } else if (current instanceof Transaction && current.isRestartable()) {
      transaction = new RestartParentTransaction(this._connection, current, {
        isolation,
        joinable,
        runCommitCallbacks,
      });
    } else {
      const parentTransaction = current as Transaction;
      transaction = new SavepointTransaction(
        this._connection,
        `active_record_${this._stack.length}`,
        parentTransaction,
        { isolation, joinable, runCommitCallbacks },
      );
    }

    if (!transaction.isMaterialized()) {
      if (
        this._connection.supportsLazyTransactions?.() &&
        this.isLazyTransactionsEnabled() &&
        _lazy &&
        !isolation // isolated transactions must materialize eagerly so the
        // snapshot is taken before the first read (mirrors Rails' per-query
        // materialize_transactions call in with_raw_connection)
      ) {
        this._hasUnmaterializedTransactions = true;
      } else {
        await transaction.materializeBang();
      }
    }

    this._stack.push(transaction);
    return transaction;
  }

  async disableLazyTransactionsBang(): Promise<void> {
    await this.materializeTransactions();
    this._lazyTransactionsEnabled = false;
  }

  enableLazyTransactionsBang(): void {
    this._lazyTransactionsEnabled = true;
  }

  isLazyTransactionsEnabled(): boolean {
    return this._lazyTransactionsEnabled;
  }

  dirtyCurrentTransaction(): void {
    const current = this.currentTransaction;
    if (current instanceof Transaction) {
      current.dirtyBang();
    }
  }

  async restoreTransactions(): Promise<boolean> {
    if (!this.isRestorable()) return false;
    for (const t of this._stack) {
      if (t instanceof Transaction) {
        await t.restoreBang();
      }
    }
    return true;
  }

  isRestorable(): boolean {
    return this._stack.every((t) => {
      if (t instanceof Transaction) return !t.isDirty();
      return true;
    });
  }

  /** @internal */
  private _materializingStorage(): AsyncContext<symbol> {
    const asyncContext = getAsyncContext();
    if (!this._materializingOwner || this._materializingOwnerAdapter !== asyncContext) {
      this._materializingOwner = asyncContext.create<symbol>();
      this._materializingOwnerAdapter = asyncContext;
    }
    return this._materializingOwner;
  }

  async materializeTransactions(): Promise<void> {
    // Re-entrant call from inside an in-progress materializeBang on the same
    // chain — skip to avoid infinite recursion (queries issued by
    // materializeBang itself call back into here).
    const storage = this._materializingStorage();
    if (this._currentMaterializingOwner && storage.getStore() === this._currentMaterializingOwner) {
      return;
    }
    // Mirrors Rails (`abstract/transaction.rb:577-591`): the pass runs under
    // the per-connection lock. Foreign chains block here; once they enter,
    // an earlier holder will have flipped `_hasUnmaterializedTransactions`
    // off and they no-op. `beginTransaction` is wrapped in the same lock
    // (mirroring Rails line 507) so `_hasUnmaterializedTransactions` cannot
    // flip back to true mid-pass — making the unconditional clear at the
    // end of the loop safe by exclusion.
    await this.synchronize(async () => {
      if (!this._hasUnmaterializedTransactions) return;
      const owner = Symbol("tm.materialize");
      this._currentMaterializingOwner = owner;
      try {
        await storage.run(owner, async () => {
          for (const t of this._stack) {
            if (t instanceof Transaction && !t.isMaterialized()) {
              await t.materializeBang();
            }
          }
        });
        this._hasUnmaterializedTransactions = false;
      } finally {
        this._currentMaterializingOwner = null;
      }
    });
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::TransactionManager#commit_transaction
   * (`abstract/transaction.rb:593`). Wrapped in `synchronize` so direct
   * callers (manual TM use outside `within_new_transaction`) get the same
   * exclusion the body-internal callers already have. Reentrant for the
   * common case where this is called from inside `_withinNewTransactionBody`.
   */
  async commitTransaction(): Promise<void> {
    await this.synchronize(() => this._commitTransactionInner());
  }

  /** @internal */
  private async _commitTransactionInner(): Promise<void> {
    const transaction = this._stack[this._stack.length - 1];
    if (!(transaction instanceof Transaction)) return;

    try {
      await transaction.beforeCommitRecords();
    } finally {
      this._stack.pop();
    }

    if (transaction.isDirty()) {
      this.dirtyCurrentTransaction();
    }

    await transaction.commit();
    await transaction.commitRecords();
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::TransactionManager#rollback_transaction
   * (`abstract/transaction.rb:610`). Wrapped in `synchronize` for the same
   * reason as {@link commitTransaction}.
   */
  async rollbackTransaction(transaction?: Transaction): Promise<void> {
    await this.synchronize(() => this._rollbackTransactionInner(transaction));
  }

  /** @internal */
  private async _rollbackTransactionInner(transaction?: Transaction): Promise<void> {
    const txn = transaction || this._stack[this._stack.length - 1];

    if (!(txn instanceof Transaction)) return;

    try {
      await txn.rollback();
    } finally {
      if (this._stack[this._stack.length - 1] === txn) {
        this._stack.pop();
      }
    }
    await txn.rollbackRecords();
  }

  /**
   * Clear the connection's prepared-statement cache after a failed
   * (now rolled-back) transaction. The exact effect is adapter-defined
   * (PG fires DEALLOCATE per entry on a held client; on a released
   * client it drops the local map only — see `clearCacheBang` docs).
   * Runs only when the rolled-back frame is a `RealTransaction` and
   * the error is `PreparedStatementCacheExpired` — Savepoint frames
   * don't drop the underlying connection's cached plans, and other
   * errors aren't related to plan invalidation.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::TransactionManager
   *   #after_failure_actions (abstract/transaction.rb:669-673):
   *
   *     return unless transaction.is_a?(RealTransaction)
   *     return unless error.is_a?(ActiveRecord::PreparedStatementCacheExpired)
   *     @connection.clear_cache!
   */
  /** @internal */
  private afterFailureActions(transaction: unknown, error: unknown): void {
    if (!(transaction instanceof RealTransaction)) return;
    if (!(error instanceof PreparedStatementCacheExpired)) return;
    this._connection.clearCacheBang?.();
  }

  /**
   * Async-chain-aware mutex storage. Mirrors Rails'
   * `@connection.lock.synchronize` (`abstract/transaction.rb:622`): outermost
   * `within_new_transaction` calls on the same connection serialize, but a
   * recursive call from inside the body (e.g. `after_commit` re-entry) skips
   * re-acquisition to avoid self-deadlock.
   *
   * Token-based ownership: each acquisition mints a fresh symbol stored both
   * in the AsyncContext and in `_currentLockOwner`. Reentry requires both to
   * match — so a detached task that inherits the AsyncContext but outlives
   * the holder's release (token cleared) correctly re-acquires the lock.
   *
   * @internal
   */
  private _lockStorage(): AsyncContext<symbol> {
    const asyncContext = getAsyncContext();
    if (!this._lockOwner || this._lockOwnerAdapter !== asyncContext) {
      this._lockOwner = asyncContext.create<symbol>();
      this._lockOwnerAdapter = asyncContext;
    }
    return this._lockOwner;
  }

  /**
   * Run `fn` under the per-connection lock that serializes
   * {@link withinNewTransaction}. Mirrors Rails'
   * `@connection.lock.synchronize do … end` so callers can extend the lock
   * scope across pre-/post-transaction work (e.g. DDL setup) without
   * starting a transaction. Same reentrance rules as
   * {@link withinNewTransaction}.
   */
  async synchronize<T>(fn: () => Promise<T> | T): Promise<T> {
    const storage = this._lockStorage();
    if (this._currentLockOwner && storage.getStore() === this._currentLockOwner) {
      return await fn();
    }
    while (this._lockChain) {
      await this._lockChain;
    }
    const owner = Symbol("tm.lock");
    let release!: () => void;
    this._lockChain = new Promise<void>((r) => {
      release = () => {
        this._lockChain = null;
        this._currentLockOwner = null;
        r();
      };
    });
    this._currentLockOwner = owner;
    try {
      return await storage.run(owner, () => fn());
    } finally {
      release();
    }
  }

  async withinNewTransaction<T>(
    options: { isolation?: string | null; joinable?: boolean },
    fn: (tx: UserTransaction) => Promise<T> | T,
  ): Promise<T> {
    return await this.synchronize(() => this._withinNewTransactionBody(options, fn));
  }

  /** @internal */
  private async _withinNewTransactionBody<T>(
    options: { isolation?: string | null; joinable?: boolean },
    fn: (tx: UserTransaction) => Promise<T> | T,
  ): Promise<T> {
    const transaction = await this.beginTransaction({
      isolation: options.isolation,
      joinable: options.joinable,
    });
    let result: T;
    try {
      result = await fn(transaction.userTransaction);
    } catch (e) {
      await this.rollbackTransaction();
      // Rails' ordering (abstract/transaction.rb:627-631):
      // `after_failure_actions` runs AFTER `rollback_transaction` so
      // the ROLLBACK isn't delayed behind DEALLOCATE traffic on the
      // same client (PG StatementPool fires DEALLOCATE per entry via
      // `.clear()`), and so the server is in a non-aborted state when
      // cache-clear work runs. PG's adapter retains a WeakRef to the
      // just-released txn client so the post-rollback `clearCacheBang`
      // can still reach the StatementPool (see `_lastReleasedTxnClient`).
      this.afterFailureActions(transaction, e);
      if (!transaction.state.isCompleted()) {
        transaction.incompleteBang();
      }
      throw e;
    }

    try {
      await this.commitTransaction();
    } catch (commitError) {
      if (!transaction.state.isCompleted()) {
        await this.rollbackTransaction(transaction);
      }
      if (!transaction.state.isCompleted()) {
        transaction.incompleteBang();
      }
      throw commitError;
    }

    if (!transaction.state.isCompleted()) {
      transaction.incompleteBang();
    }
    return result;
  }
}

/** @internal */
function appendCallbacks(callbacks: any): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/abstract/transaction.rb:331 cluster=transactions
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::Transaction#append_callbacks is not implemented",
  );
}
