import { getCrypto } from "@blazetrails/activesupport";
import { Transaction as InternalTransaction } from "./connection-adapters/abstract/transaction.js";

/**
 * Represents the current transaction state for application-level interaction.
 *
 * It can either map to an actual transaction/savepoint, or represent the
 * absence of a transaction.
 *
 * Mirrors: ActiveRecord::Transaction
 */
export class ActiveRecordTransaction {
  private _internalTransaction: InternalTransaction | null;
  private _uuid: string | null = null;

  constructor(internalTransaction: InternalTransaction | null) {
    this._internalTransaction = internalTransaction;
  }

  /**
   * Registers a block to be called after the transaction is fully committed.
   * If there is no currently open transaction, the block is called immediately.
   *
   * Mirrors: ActiveRecord::Transaction#after_commit
   */
  afterCommit(fn: () => void | Promise<void>): void | Promise<void> {
    if (this.isClosed()) {
      // No open transaction — execute immediately (matches Rails behavior)
      return fn();
    }
    this._internalTransaction!.afterCommit(fn);
  }

  /**
   * Registers a block to be called after the transaction is rolled back.
   * If there is no currently open transaction, the block is not called.
   *
   * Mirrors: ActiveRecord::Transaction#after_rollback
   */
  afterRollback(fn: () => void | Promise<void>): void {
    if (this.isClosed()) return;
    this._internalTransaction!.afterRollback(fn);
  }

  /**
   * Returns true if the transaction exists and isn't finalized yet.
   *
   * Mirrors: ActiveRecord::Transaction#open?
   */
  isOpen(): boolean {
    return !this.isClosed();
  }

  /**
   * Returns true if the transaction doesn't exist or is finalized.
   *
   * Mirrors: ActiveRecord::Transaction#closed?
   */
  isClosed(): boolean {
    return this._internalTransaction == null || this._internalTransaction.state.finalized;
  }

  /**
   * Returns true if the transaction doesn't exist or is finalized.
   * Alias for isClosed.
   *
   * Mirrors: ActiveRecord::Transaction#blank?
   */
  isBlank(): boolean {
    return this.isClosed();
  }

  /**
   * Returns a UUID for this transaction or null if no transaction is open.
   *
   * Mirrors: ActiveRecord::Transaction#uuid
   */
  uuid(): string | null {
    if (this.isClosed()) return null;
    if (!this._uuid) {
      this._uuid = getCrypto().randomUUID();
    }
    return this._uuid;
  }

  static readonly NULL_TRANSACTION = new ActiveRecordTransaction(null);
}
