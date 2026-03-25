import type { Base } from "./base.js";
import type { DatabaseAdapter } from "./adapter.js";

/**
 * Throw inside a transaction block to trigger a rollback without
 * re-raising the error to the caller.
 *
 * Mirrors: ActiveRecord::Rollback
 */
export class Rollback extends Error {
  constructor() {
    super("Rollback");
    this.name = "Rollback";
  }
}

// Track the currently-active transaction (if any) for after_commit/after_rollback callbacks
let _currentTransaction: Transaction | null = null;

/**
 * Get the currently active transaction, if any.
 */
export function currentTransaction(): Transaction | null {
  return _currentTransaction;
}

/**
 * Transaction — wraps adapter transactions with callbacks.
 *
 * Mirrors: ActiveRecord::Transactions
 */
export class Transaction {
  private adapter: DatabaseAdapter;
  private _afterCommitCallbacks: Array<() => void | Promise<void>> = [];
  private _afterRollbackCallbacks: Array<() => void | Promise<void>> = [];

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  /**
   * Register an after_commit callback.
   */
  afterCommit(fn: () => void | Promise<void>): void {
    this._afterCommitCallbacks.push(fn);
  }

  /**
   * Register an after_rollback callback.
   */
  afterRollback(fn: () => void | Promise<void>): void {
    this._afterRollbackCallbacks.push(fn);
  }

  /**
   * Execute the after_commit callbacks.
   */
  async runAfterCommitCallbacks(): Promise<void> {
    for (const fn of this._afterCommitCallbacks) {
      await fn();
    }
  }

  /**
   * Execute the after_rollback callbacks.
   */
  async runAfterRollbackCallbacks(): Promise<void> {
    for (const fn of this._afterRollbackCallbacks) {
      await fn();
    }
  }
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
): Promise<T | undefined> {
  const adapter = modelClass.adapter;
  const tx = new Transaction(adapter);
  const previousTx = _currentTransaction;
  _currentTransaction = tx;

  // If already in a transaction (module-level tracker),
  // use a savepoint for nesting.
  const nested = previousTx !== null;
  const spName = nested ? `sp_${++_savepointCounter}` : null;

  if (nested && spName) {
    await adapter.createSavepoint(spName);
  } else {
    await adapter.beginTransaction();
  }

  let result: T;
  try {
    result = await fn(tx);
    if (nested && spName) {
      await adapter.releaseSavepoint(spName);
    } else {
      await adapter.commit();
    }
  } catch (error) {
    if (nested && spName) {
      await adapter.rollbackToSavepoint(spName);
    } else {
      await adapter.rollback();
    }
    _currentTransaction = previousTx;
    await tx.runAfterRollbackCallbacks();
    if (error instanceof Rollback) {
      return undefined;
    }
    throw error;
  }
  _currentTransaction = previousTx;
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
