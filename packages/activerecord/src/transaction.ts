import { getCrypto } from "@blazetrails/activesupport";
import { Transaction as InternalTransaction } from "./connection-adapters/abstract/transaction.js";

export class Transaction {
  private _internalTransaction: InternalTransaction | null;
  private _uuid: string | null = null;

  constructor(internalTransaction: InternalTransaction | null) {
    this._internalTransaction = internalTransaction;
  }

  afterCommit(fn: () => void | Promise<void>): void | Promise<void> {
    if (this._internalTransaction == null) {
      return fn();
    }
    this._internalTransaction.afterCommit(fn);
  }

  afterRollback(fn: () => void | Promise<void>): void {
    this._internalTransaction?.afterRollback(fn);
  }

  isOpen(): boolean {
    return !this.isClosed();
  }

  isClosed(): boolean {
    return this._internalTransaction == null || this._internalTransaction.state.finalized;
  }

  isBlank(): boolean {
    return this.isClosed();
  }

  uuid(): string | null {
    if (this.isClosed()) return null;
    if (!this._uuid) {
      this._uuid = getCrypto().randomUUID();
    }
    return this._uuid;
  }

  static readonly NULL_TRANSACTION = new Transaction(null);
}
