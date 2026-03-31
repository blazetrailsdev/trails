import type { Base } from "./base.js";

import { Rollback, TransactionIsolationError } from "./errors.js";
export { Rollback };
import { Transaction } from "./connection-adapters/abstract/transaction.js";

// Track the currently-active transaction (if any) for after_commit/after_rollback callbacks
let _currentTransaction: Transaction | null = null;

/**
 * Get the currently active transaction, if any.
 */
export function currentTransaction(): Transaction | null {
  return _currentTransaction;
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
  options?: { isolation?: string },
): Promise<T | undefined> {
  const adapter = modelClass.adapter;

  if (options?.isolation) {
    const previousTx = _currentTransaction;
    if (previousTx !== null) {
      throw new TransactionIsolationError(
        "Setting transaction isolation level is not supported inside a nested transaction",
      );
    }
    throw new TransactionIsolationError(
      `Transaction isolation level '${options.isolation}' is not yet supported`,
    );
  }

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
