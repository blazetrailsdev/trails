import type { DatabaseAdapter } from "../../adapter.js";

/**
 * Transaction — wraps adapter transactions with callbacks.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Transaction
 */
export class Transaction {
  private adapter: DatabaseAdapter;
  private _afterCommitCallbacks: Array<() => void | Promise<void>> = [];
  private _afterRollbackCallbacks: Array<() => void | Promise<void>> = [];

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  afterCommit(fn: () => void | Promise<void>): void {
    this._afterCommitCallbacks.push(fn);
  }

  afterRollback(fn: () => void | Promise<void>): void {
    this._afterRollbackCallbacks.push(fn);
  }

  async runAfterCommitCallbacks(): Promise<void> {
    for (const fn of this._afterCommitCallbacks) {
      await fn();
    }
  }

  async runAfterRollbackCallbacks(): Promise<void> {
    for (const fn of this._afterRollbackCallbacks) {
      await fn();
    }
  }
}
