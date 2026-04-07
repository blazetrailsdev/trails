import type { DatabaseAdapter } from "../../adapter.js";
import { Notifications } from "@blazetrails/activesupport";

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::TransactionState
 */
export class TransactionState {
  private _state: "committed" | "rolledBack" | "nullified" | null = null;

  get finalized(): boolean {
    return this._state !== null;
  }

  get committed(): boolean {
    return this._state === "committed";
  }

  get rolledBack(): boolean {
    return this._state === "rolledBack";
  }

  get nullified(): boolean {
    return this._state === "nullified";
  }

  get fullyCommitted(): boolean {
    return this._state === "committed";
  }

  get fullyRolledBack(): boolean {
    return this._state === "rolledBack";
  }

  get fullyCompleted(): boolean {
    return this.fullyCommitted || this.fullyRolledBack;
  }

  setCommitted(): void {
    this._state = "committed";
  }

  setRolledBack(): void {
    this._state = "rolledBack";
  }

  setNullified(): void {
    this._state = "nullified";
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationNotStartedError
 */
export class InstrumentationNotStartedError extends Error {
  constructor(message = "Instrumentation has not been started") {
    super(message);
    this.name = "InstrumentationNotStartedError";
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::TransactionInstrumenter::InstrumentationAlreadyStartedError
 */
export class InstrumentationAlreadyStartedError extends Error {
  constructor(message = "Instrumentation has already been started") {
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
  private _startTime?: number;

  start(): void {
    if (this._started) {
      throw new InstrumentationAlreadyStartedError();
    }
    this._started = true;
    this._startTime = Date.now();
    Notifications.instrument("start_transaction.active_record", {});
  }

  finish(): number {
    if (!this._started) {
      throw new InstrumentationNotStartedError();
    }
    this._started = false;
    const duration = Date.now() - this._startTime!;
    this._startTime = undefined;
    return duration;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::NullTransaction
 */
export class NullTransaction {
  readonly state = new TransactionState();

  get open(): boolean {
    return false;
  }

  get closed(): boolean {
    return true;
  }

  get joinable(): boolean {
    return false;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Transaction::Callback
 */
export class TransactionCallback {
  constructor(
    readonly event: "commit" | "rollback",
    readonly fn: () => void | Promise<void>,
  ) {}
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Transaction
 */
export class Transaction {
  readonly state = new TransactionState();
  private _callbacks: TransactionCallback[] = [];
  private _adapter: DatabaseAdapter;
  private _joinable: boolean;
  private _open = true;

  static readonly Callback = TransactionCallback;

  constructor(adapter: DatabaseAdapter, options: { joinable?: boolean } = {}) {
    this._adapter = adapter;
    this._joinable = options.joinable ?? true;
  }

  get open(): boolean {
    return this._open;
  }

  get closed(): boolean {
    return !this._open;
  }

  get joinable(): boolean {
    return this._joinable;
  }

  get connection(): DatabaseAdapter {
    return this._adapter;
  }

  afterCommit(fn: () => void | Promise<void>): void {
    this._callbacks.push(new TransactionCallback("commit", fn));
  }

  afterRollback(fn: () => void | Promise<void>): void {
    this._callbacks.push(new TransactionCallback("rollback", fn));
  }

  async commit(): Promise<void> {
    this.state.setCommitted();
    this._open = false;
  }

  async rollback(): Promise<void> {
    this.state.setRolledBack();
    this._open = false;
  }

  async runAfterCommitCallbacks(): Promise<void> {
    for (const cb of this._callbacks) {
      if (cb.event === "commit") await cb.fn();
    }
  }

  async runAfterRollbackCallbacks(): Promise<void> {
    for (const cb of this._callbacks) {
      if (cb.event === "rollback") await cb.fn();
    }
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::RestartParentTransaction
 */
export class RestartParentTransaction extends Transaction {
  constructor(adapter: DatabaseAdapter, options: { joinable?: boolean } = {}) {
    super(adapter, options);
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SavepointTransaction
 */
export class SavepointTransaction extends Transaction {
  readonly savepointName: string;

  constructor(
    adapter: DatabaseAdapter,
    savepointName: string,
    options: { joinable?: boolean } = {},
  ) {
    super(adapter, options);
    this.savepointName = savepointName;
  }

  async commit(): Promise<void> {
    await this.connection.releaseSavepoint(this.savepointName);
    await super.commit();
  }

  async rollback(): Promise<void> {
    await this.connection.rollbackToSavepoint(this.savepointName);
    await super.rollback();
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::RealTransaction
 */
export class RealTransaction extends Transaction {
  async commit(): Promise<void> {
    await this.connection.commit();
    await super.commit();
  }

  async rollback(): Promise<void> {
    await this.connection.rollback();
    await super.rollback();
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::TransactionManager
 */
export class TransactionManager {
  private _stack: (Transaction | NullTransaction)[] = [];
  private _adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
  }

  get currentTransaction(): Transaction | NullTransaction {
    return this._stack.length > 0 ? this._stack[this._stack.length - 1] : new NullTransaction();
  }

  get openTransactions(): number {
    return this._stack.filter((t) => t.open).length;
  }

  get withinNewTransaction(): boolean {
    return this._stack.length > 0;
  }

  async beginTransaction(options: { joinable?: boolean } = {}): Promise<Transaction> {
    let transaction: Transaction;

    if (this._stack.length === 0) {
      await this._adapter.beginTransaction();
      transaction = new RealTransaction(this._adapter, options);
    } else {
      const savepointName = `active_record_${this._stack.length}`;
      await this._adapter.createSavepoint(savepointName);
      transaction = new SavepointTransaction(this._adapter, savepointName, options);
    }

    this._stack.push(transaction);
    return transaction;
  }

  async commitTransaction(): Promise<void> {
    const transaction = this._stack.pop();
    if (transaction && transaction instanceof Transaction) {
      await transaction.commit();
      await transaction.runAfterCommitCallbacks();
    }
  }

  async rollbackTransaction(): Promise<void> {
    const transaction = this._stack.pop();
    if (transaction && transaction instanceof Transaction) {
      await transaction.rollback();
      await transaction.runAfterRollbackCallbacks();
    }
  }
}
