import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
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
import { ActiveRecord } from "../../ar-config.js";

/** @internal */
export const CURRENT_TRANSACTION_KEY = Symbol.for("ar_current_transaction");

/** @internal */
interface CandidateLookup {
  get(record: unknown): unknown;
}

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
    this.name = "InstrumentationNotStartedError";
  }
}

export class InstrumentationAlreadyStartedError extends ActiveRecordError {
  constructor(message = "Called start on an already started transaction") {
    super(message);
    this.name = "InstrumentationAlreadyStartedError";
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

export type TransactionConnection = DatabaseAdapter & {
  beginDbTransaction?(): void | Promise<void>;
  beginIsolatedDbTransaction?(isolation: string): void | Promise<void>;
  beginDeferredTransaction?(isolation?: string | null): void | Promise<void>;
  commitDbTransaction?(): void | Promise<void>;
  rollbackDbTransaction?(): void | Promise<void>;
  restartDbTransaction?(): void | Promise<void>;
  resetIsolationLevel?(): void | Promise<void>;
  supportsLazyTransactions?(): boolean;
  supportsRestartDbTransaction?(): Promise<boolean>;
  addTransactionRecord?(record: unknown): void;
  lock?: MonitorMixin;
  active?(): boolean | Promise<boolean>;
  currentTransaction?(): Transaction | NullTransaction;
  throwAwayBang?(): void;
};

export class Transaction {
  readonly state = new TransactionState();
  readonly savepointName: string | null = null;
  private _callbacks: TransactionCallback[] | null = null;
  private _records: unknown[] | null = null;
  private _lazyEnrollmentRecords: Map<unknown, unknown> | null = null;
  private _connection: TransactionConnection;
  private _joinable: boolean;
  readonly isolationLevel: string | null;
  protected _materialized = false;
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
      const ite = this.uniqueRecords();
      const instancesToRunCallbacksOn = this.prepareInstancesToRunCallbacksOn(ite);

      try {
        await this.runActionOnRecords(
          ite,
          instancesToRunCallbacksOn,
          async (record, shouldRunCallbacks) => {
            if (typeof (record as any).rolledbackBang === "function") {
              await (record as any).rolledbackBang({
                forceRestoreState: this.isFullRollback(),
                shouldRunCallbacks,
              });
            }
          },
        );
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
        if (ActiveRecord.beforeCommittedOnAllRecords) {
          const ite = this.uniqueRecords();

          const entries: Array<[unknown, unknown]> = [];
          const find = (rec: unknown): [unknown, unknown] | undefined =>
            entries.find((e) => this.recordsEqual(rec, e[0]));
          for (const record of recs) {
            const entry = find(record);
            if (entry) entry[1] = record;
            else entries.push([record, record]);
          }
          const instancesToRunCallbacksOn: CandidateLookup = { get: (rec) => find(rec)?.[1] };

          await this.runActionOnRecords(
            ite,
            instancesToRunCallbacksOn,
            async (record, shouldRunCallbacks) => {
              if (shouldRunCallbacks && typeof (record as any).beforeCommittedBang === "function") {
                await (record as any).beforeCommittedBang();
              }
            },
          );
        } else {
          for (const record of this.uniqueRecordsByEquality(recs)) {
            if (typeof (record as any).beforeCommittedBang === "function") {
              await (record as any).beforeCommittedBang();
            }
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
      const ite = this.uniqueRecords();

      if (this._runCommitCallbacks) {
        const instancesToRunCallbacksOn = this.prepareInstancesToRunCallbacksOn(ite);

        try {
          await this.runActionOnRecords(
            ite,
            instancesToRunCallbacksOn,
            async (record, shouldRunCallbacks) => {
              if (typeof (record as any).committedBang === "function") {
                await (record as any).committedBang({ shouldRunCallbacks });
              }
            },
          );
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

  async restart(): Promise<void> {}

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
  private uniqueRecords(): unknown[] {
    const seen = new Set<unknown>();
    const result: unknown[] = [];
    for (const record of this.records ?? []) {
      if (!seen.has(record)) {
        seen.add(record);
        result.push(record);
      }
    }
    return result;
  }

  /** @internal */
  private uniqueRecordsByEquality(recs: unknown[]): unknown[] {
    const result: unknown[] = [];
    for (const record of recs) {
      if (!result.some((kept) => this.recordsEqual(record, kept))) result.push(record);
    }
    return result;
  }

  /** @internal */
  private recordsEqual(a: unknown, b: unknown): boolean {
    return (
      a === b ||
      (typeof (a as any)?.equals === "function" && (a as any).equals(b)) ||
      (typeof (b as any)?.equals === "function" && (b as any).equals(a))
    );
  }

  /** @internal */
  private async runActionOnRecords(
    records: unknown[],
    instancesToRunCallbacksOn: CandidateLookup,
    callback: (record: unknown, shouldRunCallbacks: boolean) => Promise<void> | void,
  ): Promise<void> {
    while (records.length > 0) {
      const record = records.shift()!;
      const shouldRunCallbacks = instancesToRunCallbacksOn.get(record) === record;
      await callback(record, shouldRunCallbacks);
    }
  }

  /** @internal */
  private prepareInstancesToRunCallbacksOn(records: unknown[]): CandidateLookup {
    const entries: Array<[unknown, unknown]> = [];
    const find = (rec: unknown): [unknown, unknown] | undefined =>
      entries.find((e) => this.recordsEqual(rec, e[0]));

    for (const record of records) {
      if (
        typeof (record as any).isTriggerTransactionalCallbacks !== "function" ||
        !(record as any).isTriggerTransactionalCallbacks()
      ) {
        continue;
      }

      const entry = find(record);
      const earlier = entry?.[1];

      if (
        earlier &&
        (record as any).constructor?.runCommitCallbacksOnFirstSavedInstancesInTransaction
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

      if (entry) entry[1] = record;
      else entries.push([record, record]);
    }

    return { get: (rec) => find(rec)?.[1] };
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

  override incompleteBang(): void {}

  override async restoreBang(): Promise<void> {}

  override isFullRollback(): boolean {
    return false;
  }
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
  private _stack: (Transaction | NullTransaction)[] = [];
  private _connection: TransactionConnection;
  private _hasUnmaterializedTransactions = false;
  private _lazyTransactionsEnabled = true;
  /** @internal */
  private _materializingTransactions = false;

  static readonly NULL_TRANSACTION = Object.freeze(new NullTransaction());

  constructor(connection: TransactionConnection) {
    this._connection = connection;
  }

  /** @missingRailsCall last — PERMANENT */
  get currentTransaction(): Transaction | NullTransaction {
    return this._stack.length > 0
      ? this._stack[this._stack.length - 1]
      : TransactionManager.NULL_TRANSACTION;
  }

  /** @missingRailsCall size — PERMANENT */
  get openTransactions(): number {
    return this._stack.length;
  }

  /**
   * @missingRailsCall empty? — PERMANENT
   * @missingRailsCall size — PERMANENT
   */
  async beginTransaction(
    options: { isolation?: string | null; joinable?: boolean; _lazy?: boolean } = {},
  ): Promise<Transaction> {
    return await this._connection.lock.synchronize(() => this._beginTransactionInner(options));
  }

  /** @internal */
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
        !isolation
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

  /** @missingRailsCall last — PERMANENT */
  async commitTransaction(): Promise<void> {
    await this._connection.lock.synchronize(() => this._commitTransactionInner());
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

  /** @missingRailsCall last — PERMANENT */
  async rollbackTransaction(transaction?: Transaction): Promise<void> {
    await this._connection.lock.synchronize(() => this._rollbackTransactionInner(transaction));
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

  /** @internal */
  private afterFailureActions(transaction: unknown, error: unknown): void | Promise<void> {
    if (!(transaction instanceof RealTransaction)) return;
    if (!(error instanceof PreparedStatementCacheExpired)) return;
    return this._connection.clearCacheBang?.();
  }

  async withinNewTransaction<T>(
    options: { isolation?: string | null; joinable?: boolean },
    fn: (tx: UserTransaction) => Promise<T> | T,
  ): Promise<T> {
    return await this._connection.lock.synchronize(() =>
      this._withinNewTransactionBody(options, fn),
    );
  }

  /** @internal */
  private async _withinNewTransactionBody<T>(
    options: { isolation?: string | null; joinable?: boolean },
    fn: (tx: UserTransaction) => Promise<T> | T,
  ): Promise<T> {
    let transaction: Transaction | undefined;
    try {
      transaction = await this.beginTransaction({
        isolation: options.isolation,
        joinable: options.joinable,
      });
      let result: T;
      try {
        result = await fn(transaction.userTransaction);
      } catch (e) {
        await this.rollbackTransaction();
        await this.afterFailureActions(transaction, e);
        throw e;
      }

      try {
        await this.commitTransaction();
      } catch (commitError) {
        if (commitError instanceof ConnectionFailed) {
          if (!transaction.state.isCompleted()) {
            transaction.invalidateBang();
          }
        } else if (!transaction.state.isCompleted()) {
          await this.rollbackTransaction(transaction);
        }
        throw commitError;
      }

      return result;
    } finally {
      if (!transaction || !transaction.state.isCompleted()) {
        this._connection.throwAwayBang?.();
        transaction?.incompleteBang();
      }
    }
  }
}

/** @internal */
function appendCallbacks(callbacks: any): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/abstract/transaction.rb:331 cluster=transactions
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::Transaction#append_callbacks is not implemented",
  );
}
