import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import type { Base } from "../../base.js";
import { Transaction as UserTransaction } from "../../transaction.js";
import {
  ActiveRecordError,
  ConnectionFailed,
  PreparedStatementCacheExpired,
  NotImplementedError,
  TransactionIsolationError,
} from "../../errors.js";
import {
  Notifications,
  type MonitorMixin,
  type NotificationHandle,
} from "@blazetrails/activesupport";
import { Hash, isEmpty, Thread, uniq } from "@blazetrails/ruby-compat";
import { beforeCommittedOnAllRecords } from "../../active-record.js";

/** @internal */
interface TransactionRecord {
  _newRecordBeforeLastCommit?: unknown;
  beforeCommittedBang(): Promise<void>;
  committedBang(options?: { shouldRunCallbacks?: boolean }): Promise<void>;
  isDestroyed(): boolean;
  isTriggerTransactionalCallbacks(): boolean;
  rolledbackBang(options?: {
    forceRestoreState?: boolean;
    shouldRunCallbacks?: boolean;
  }): Promise<void>;
}

/** @internal */
export const CURRENT_TRANSACTION_KEY = Symbol.for("ar_current_transaction");

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
    this._children ??= [];
    this._children.push(state);
  }

  get finalized(): boolean {
    return this._state !== null;
  }

  isCommitted(): boolean {
    return this.committed;
  }

  get committed(): boolean {
    return this._state === "committed" || this._state === "fully_committed";
  }

  isFullyCommitted(): boolean {
    return this.fullyCommitted;
  }

  get fullyCommitted(): boolean {
    return this._state === "fully_committed";
  }

  isRolledback(): boolean {
    return this._state === "rolledback" || this._state === "fully_rolledback";
  }

  isFullyRolledback(): boolean {
    return this._state === "fully_rolledback";
  }

  isInvalidated(): boolean {
    return this._state === "invalidated";
  }

  get fullyCompleted(): boolean {
    return this.isCompleted();
  }

  isCompleted(): boolean {
    return this.committed || this.isRolledback();
  }

  rollbackBang(): "rolledback" {
    this._children?.forEach((c) => c.rollbackBang());
    this._state = "rolledback";
    return "rolledback";
  }

  fullRollbackBang(): "fully_rolledback" {
    this._children?.forEach((c) => c.rollbackBang());
    this._state = "fully_rolledback";
    return "fully_rolledback";
  }

  invalidateBang(): "invalidated" {
    this._children?.forEach((c) => c.invalidateBang());
    this._state = "invalidated";
    return "invalidated";
  }

  commitBang(): "committed" {
    this._state = "committed";
    return "committed";
  }

  fullCommitBang(): "fully_committed" {
    this._state = "fully_committed";
    return "fully_committed";
  }

  nullifyBang(): null {
    this._state = null;
    return null;
  }
}

export class InstrumentationNotStartedError extends ActiveRecordError {
  constructor(message = "Called finish on a transaction that hasn't started") {
    super(message);
    this.name =
      "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationNotStartedError";
  }
}

export class InstrumentationAlreadyStartedError extends ActiveRecordError {
  constructor(message = "Called start on an already started transaction") {
    super(message);
    this.name =
      "ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationAlreadyStartedError";
  }
}

export class TransactionInstrumenter {
  static readonly InstrumentationNotStartedError = InstrumentationNotStartedError;
  static readonly InstrumentationAlreadyStartedError = InstrumentationAlreadyStartedError;

  private _started = false;
  private _basePayload: Record<string, unknown>;
  private _payload: Record<string, unknown> | null = null;
  private _handle: NotificationHandle | null = null;

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
    this._handle = Notifications.instrumenter.buildHandle(
      "transaction.active_record",
      this._payload,
    );
    this._handle.start();
  }

  finish(outcome: string): void {
    if (!this._started) {
      throw new InstrumentationNotStartedError();
    }
    this._started = false;

    if (this._payload) {
      this._payload.outcome = outcome;
    }
    if (this._handle) {
      this._handle.finish();
    }
  }
}

export class NullTransaction {
  state: TransactionState | undefined = undefined;
  readonly savepointName: string | null = null;

  get closed(): boolean {
    return true;
  }

  get open(): boolean {
    return false;
  }

  get joinable(): boolean {
    return false;
  }

  addRecord(_record: unknown, _ = true): void {}

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

export class Callback {
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

export type TransactionConnection = DatabaseAdapter & {
  beginDbTransaction?(): void | Promise<void>;
  beginIsolatedDbTransaction?(isolation: string): void | Promise<void>;
  beginDeferredTransaction?(isolation?: string | null): void | Promise<void>;
  commitDbTransaction?(): void | Promise<void>;
  rollbackDbTransaction?(): void | Promise<void>;
  restartDbTransaction?(): void | Promise<void>;
  resetIsolationLevel?(): void | Promise<void>;
  supportsLazyTransactions(): boolean;
  supportsRestartDbTransaction?(): Promise<boolean>;
  addTransactionRecord(record: TransactionRecord): void;
  lock?: MonitorMixin;
  active?(): boolean | Promise<boolean>;
  throwAwayBang?(): void | Promise<void>;
};

export class Transaction {
  readonly state = new TransactionState();
  readonly savepointName: string | null = null;
  private _callbacks: Callback[] | null = null;
  private _records: TransactionRecord[] | null = null;
  private _lazyEnrollmentRecords: Map<TransactionRecord, TransactionRecord> | null = null;
  private _connection: TransactionConnection;
  private _joinable: boolean;
  readonly isolationLevel: string | null;
  protected _materialized = false;
  private _runCommitCallbacks: boolean;
  private _dirty = false;
  written = false;
  readonly userTransaction: UserTransaction;
  protected _instrumenter: TransactionInstrumenter;

  static readonly Callback = Callback;

  get connection(): TransactionConnection {
    return this._connection;
  }

  invalidateBang(): void {
    this.state.invalidateBang();
  }

  isInvalidated(): boolean {
    return this.state.isInvalidated();
  }

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

  dirtyBang(): void {
    this._dirty = true;
  }

  isDirty(): boolean {
    return this._dirty;
  }

  get open(): boolean {
    return true;
  }

  get closed(): boolean {
    return false;
  }

  addRecord(record: TransactionRecord, ensureFinalize = true): void {
    this._records ??= [];
    if (ensureFinalize) {
      this._records.push(record);
    } else {
      this._lazyEnrollmentRecords ??= new Map();
      this._lazyEnrollmentRecords.set(record, record);
    }
  }

  beforeCommit(fn: () => void | Promise<void>): void {
    if (this.state.finalized) {
      throw new ActiveRecordError("Cannot register callbacks on a finalized transaction");
    }
    if (!this._callbacks) this._callbacks = [];
    this._callbacks.push(new Callback("before_commit", fn));
  }

  afterCommit(fn: () => void | Promise<void>): void {
    if (this.state.finalized) {
      throw new ActiveRecordError("Cannot register callbacks on a finalized transaction");
    }
    if (!this._callbacks) this._callbacks = [];
    this._callbacks.push(new Callback("after_commit", fn));
  }

  afterRollback(fn: () => void | Promise<void>): void {
    if (this.state.finalized) {
      throw new ActiveRecordError("Cannot register callbacks on a finalized transaction");
    }
    if (!this._callbacks) this._callbacks = [];
    this._callbacks.push(new Callback("after_rollback", fn));
  }

  get records(): TransactionRecord[] | null {
    if (this._lazyEnrollmentRecords) {
      for (const value of this._lazyEnrollmentRecords.values()) {
        this._records!.push(value);
      }
      this._lazyEnrollmentRecords = null;
    }
    return this._records;
  }

  isRestartable(): boolean {
    return this.joinable && !this.isDirty();
  }

  incompleteBang(): void {
    if (this.isMaterialized()) {
      this._instrumenter.finish("incomplete");
    }
  }

  async materializeBang(): Promise<void> {
    this._materialized = true;
    this._instrumenter.start();
  }

  isMaterialized(): boolean {
    return this._materialized;
  }

  async restoreBang(): Promise<void> {
    if (this.isMaterialized()) {
      this.incompleteBang();
      this._materialized = false;
      await this.materializeBang();
    }
  }

  async rollbackRecords(): Promise<void> {
    if (this.records) {
      let ite: TransactionRecord[] | undefined;
      try {
        ite = this.uniqueRecords();

        const instancesToRunCallbacksOn = this.prepareInstancesToRunCallbacksOn(ite);

        await this.runActionOnRecords(
          ite,
          instancesToRunCallbacksOn,
          async (record, shouldRunCallbacks) => {
            await record.rolledbackBang({
              forceRestoreState: this.isFullRollback(),
              shouldRunCallbacks,
            });
          },
        );
      } finally {
        for (const i of ite ?? []) {
          await i.rolledbackBang({
            forceRestoreState: this.isFullRollback(),
            shouldRunCallbacks: false,
          });
        }
      }
    }

    for (const callback of this._callbacks ?? []) await callback.afterRollback();
  }

  async beforeCommitRecords(): Promise<void> {
    if (this._runCommitCallbacks) {
      if (this.records) {
        if (beforeCommittedOnAllRecords()) {
          const ite = this.uniqueRecords();

          const instancesToRunCallbacksOn = new Hash<TransactionRecord, TransactionRecord>();
          for (const record of this.records) {
            instancesToRunCallbacksOn.set(record, record);
          }

          await this.runActionOnRecords(
            ite,
            instancesToRunCallbacksOn,
            async (record, shouldRunCallbacks) => {
              if (shouldRunCallbacks) await record.beforeCommittedBang();
            },
          );
        } else {
          for (const record of uniq(this.records)) await record.beforeCommittedBang();
        }
      }

      for (const callback of this._callbacks ?? []) await callback.beforeCommit();
    }
  }

  /** @missingRailsName callbacks — PERMANENT */
  async commitRecords(): Promise<void> {
    if (this.records) {
      let ite: TransactionRecord[] | undefined;
      try {
        ite = this.uniqueRecords();

        if (this._runCommitCallbacks) {
          const instancesToRunCallbacksOn = this.prepareInstancesToRunCallbacksOn(ite);

          await this.runActionOnRecords(
            ite,
            instancesToRunCallbacksOn,
            async (record, shouldRunCallbacks) => {
              await record.committedBang({ shouldRunCallbacks });
            },
          );
        } else {
          let record: TransactionRecord | undefined;
          while ((record = ite.shift())) {
            this.connection.addTransactionRecord(record);
          }
        }
      } finally {
        for (const i of ite ?? []) await i.committedBang({ shouldRunCallbacks: false });
      }
    }

    if (this._runCommitCallbacks) {
      for (const callback of this._callbacks ?? []) await callback.afterCommit();
    } else if (this._callbacks) {
      (this.connection.currentTransaction() as Transaction).appendCallbacks(this._callbacks);
    }
  }

  isFullRollback(): boolean {
    return true;
  }

  get joinable(): boolean {
    return this._joinable;
  }

  /** @internal */
  appendCallbacks(callbacks: Callback[]): void {
    (this._callbacks ??= []).push(...callbacks);
  }

  /** @internal */
  private uniqueRecords(): TransactionRecord[] {
    const seen = new Set<unknown>();
    const result: TransactionRecord[] = [];
    for (const record of this.records ?? []) {
      if (!seen.has(record)) {
        seen.add(record);
        result.push(record);
      }
    }
    return result;
  }

  /** @internal */
  private async runActionOnRecords(
    records: TransactionRecord[],
    instancesToRunCallbacksOn: Hash<TransactionRecord, TransactionRecord>,
    callback: (record: TransactionRecord, shouldRunCallbacks: boolean) => Promise<void> | void,
  ): Promise<void> {
    while (records.length > 0) {
      const record = records.shift()!;
      const shouldRunCallbacks = instancesToRunCallbacksOn.get(record) === record;
      await callback(record, shouldRunCallbacks);
    }
  }

  /** @internal */
  private prepareInstancesToRunCallbacksOn(
    records: TransactionRecord[],
  ): Hash<TransactionRecord, TransactionRecord> {
    const candidates = new Hash<TransactionRecord, TransactionRecord>();
    for (const record of records) {
      if (!record.isTriggerTransactionalCallbacks()) continue;

      const earlierSavedCandidate = candidates.get(record);

      if (
        earlierSavedCandidate &&
        (record.constructor as typeof Base).runCommitCallbacksOnFirstSavedInstancesInTransaction
      ) {
        continue;
      }

      if (earlierSavedCandidate?.isDestroyed() && !record.isDestroyed()) continue;

      if (earlierSavedCandidate?._newRecordBeforeLastCommit) {
        record._newRecordBeforeLastCommit = true;
      }

      candidates.set(record, record);
    }
    return candidates;
  }

  async restart(): Promise<void> {}

  async commit(): Promise<void> {
    this.state.commitBang();
  }

  async rollback(): Promise<void> {
    this.state.rollbackBang();
  }
}

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

  override isFullRollback(): boolean {
    return false;
  }

  override incompleteBang(): void {}

  override async restoreBang(): Promise<void> {}
}

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
      if (this.isMaterialized() && (await conn.active?.()) !== false) {
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

    if (await this.connection.supportsRestartDbTransaction?.()) {
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

export class TransactionManager {
  private _stack: Transaction[] = [];
  private _connection: TransactionConnection;
  private _hasUnmaterializedTransactions = false;
  private _lazyTransactionsEnabled = true;
  /** @internal */
  private _materializingTransactions = false;

  static readonly NULL_TRANSACTION = Object.freeze(new NullTransaction());

  constructor(connection: TransactionConnection) {
    this._connection = connection;
  }

  /**
   * @missingRailsName connection — PERMANENT
   * @missingRailsName stack — PERMANENT
   */
  async beginTransaction(
    options: { isolation?: string | null; joinable?: boolean; _lazy?: boolean } = {},
  ): Promise<Transaction> {
    const { isolation = null, joinable = true, _lazy = true } = options;
    return await this._connection.lock.synchronize(async () => {
      const runCommitCallbacks = !this.currentTransaction.joinable;
      let transaction: Transaction;
      if (isEmpty(this._stack)) {
        transaction = new RealTransaction(this._connection, {
          isolation,
          joinable,
          runCommitCallbacks,
        });
      } else if (this.currentTransaction.isRestartable()) {
        transaction = new RestartParentTransaction(
          this._connection,
          this.currentTransaction as Transaction,
          { isolation, joinable, runCommitCallbacks },
        );
      } else {
        transaction = new SavepointTransaction(
          this._connection,
          `active_record_${this._stack.length}`,
          this.currentTransaction as Transaction,
          { isolation, joinable, runCommitCallbacks },
        );
      }

      if (!transaction.isMaterialized()) {
        if (
          this._connection.supportsLazyTransactions() &&
          this.isLazyTransactionsEnabled() &&
          _lazy
        ) {
          this._hasUnmaterializedTransactions = true;
        } else {
          await transaction.materializeBang();
        }
      }
      this._stack.push(transaction);
      return transaction;
    });
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
    this.currentTransaction.dirtyBang();
  }

  async restoreTransactions(): Promise<boolean> {
    if (!this.isRestorable()) return false;
    for (const transaction of this._stack) await transaction.restoreBang();

    return true;
  }

  isRestorable(): boolean {
    return !this._stack.some((transaction) => transaction.isDirty());
  }

  async materializeTransactions(): Promise<void> {
    await this._connection.lock.synchronize(async () => {
      if (this._materializingTransactions) return;
      if (!this._hasUnmaterializedTransactions) return;
      try {
        this._materializingTransactions = true;
        for (const t of this._stack) {
          if (t instanceof Transaction && !t.isMaterialized()) {
            await t.materializeBang();
          }
        }
      } finally {
        this._materializingTransactions = false;
      }
      this._hasUnmaterializedTransactions = false;
    });
  }

  async commitTransaction(): Promise<void> {
    await this._connection.lock.synchronize(async () => {
      const transaction = this._stack.at(-1) as Transaction;

      try {
        await transaction.beforeCommitRecords();
      } finally {
        this._stack.pop();
      }

      if (transaction.isDirty()) this.dirtyCurrentTransaction();

      await transaction.commit();
      await transaction.commitRecords();
    });
  }

  async rollbackTransaction(transaction?: Transaction | null): Promise<void> {
    await this._connection.lock.synchronize(async () => {
      transaction ||= this._stack.at(-1) as Transaction;
      try {
        await transaction.rollback();
      } finally {
        if (this._stack.at(-1) === transaction) this._stack.pop();
      }
      await transaction.rollbackRecords();
    });
  }

  async withinNewTransaction<T>(
    options: { isolation?: string | null; joinable?: boolean },
    fn: (tx: UserTransaction) => Promise<T> | T,
  ): Promise<T> {
    return await this._connection.lock.synchronize(async () => {
      let transaction: Transaction | undefined;
      try {
        transaction = await this.beginTransaction({
          isolation: options.isolation,
          joinable: options.joinable,
        });
        let failed = false;
        let result: T;
        try {
          result = await fn(transaction.userTransaction);
        } catch (error) {
          failed = true;
          await this.rollbackTransaction();
          await this.afterFailureActions(transaction, error);

          throw error;
        }
        if (!failed) {
          if ((Thread.current().status as string) === "aborting") {
            await this.rollbackTransaction();
          } else {
            try {
              await this.commitTransaction();
            } catch (e) {
              if (e instanceof ConnectionFailed) {
                if (!transaction.state.isCompleted()) transaction.invalidateBang();
                throw e;
              } else {
                if (!transaction.state.isCompleted()) {
                  await this.rollbackTransaction(transaction);
                }
                throw e;
              }
            }
          }
        }
        return result;
      } finally {
        if (!transaction || !transaction.state.isCompleted()) {
          await this._connection.throwAwayBang?.();
          transaction?.incompleteBang();
        }
      }
    });
  }

  get openTransactions(): number {
    return this._stack.length;
  }

  get currentTransaction(): Transaction | NullTransaction {
    return this._stack.at(-1) ?? TransactionManager.NULL_TRANSACTION;
  }

  /** @internal */
  private afterFailureActions(transaction: unknown, error: unknown): void | Promise<void> {
    if (!(transaction instanceof RealTransaction)) return;
    if (!(error instanceof PreparedStatementCacheExpired)) return;
    return this._connection.clearCacheBang?.();
  }
}

/** @internal */
function appendCallbacks(callbacks: any): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/abstract/transaction.rb:331 cluster=transactions
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::Transaction#append_callbacks is not implemented",
  );
}
