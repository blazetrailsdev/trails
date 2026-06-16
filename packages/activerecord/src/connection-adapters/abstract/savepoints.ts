/**
 * Savepoints — savepoint SQL generation and execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints
 */

function validateSavepointName(name: string | null): string {
  if (name == null || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid savepoint name: ${name}`);
  }
  return name;
}

export function createSavepointSql(name: string | null): string {
  return `SAVEPOINT ${validateSavepointName(name)}`;
}

export function execRollbackToSavepointSql(name: string | null): string {
  return `ROLLBACK TO SAVEPOINT ${validateSavepointName(name)}`;
}

export function releaseSavepointSql(name: string | null): string {
  return `RELEASE SAVEPOINT ${validateSavepointName(name)}`;
}

/**
 * Host interface for savepoint mixin methods.
 * Adapters that include Savepoints must provide internalExecute.
 */
export interface SavepointHost {
  internalExecute(
    sql: string,
    name: string,
    opts?: { materializeTransactions?: boolean },
  ): Promise<unknown>;
  currentSavepointName(): string | null;
}

/**
 * Host interface for {@link currentSavepointName}.
 * Adapters expose `currentTransaction()` via the TransactionManager.
 */
export interface CurrentSavepointNameHost {
  currentTransaction(): { savepointName: string | null };
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints#current_savepoint_name
 */
export function currentSavepointName(this: CurrentSavepointNameHost): string | null {
  return this.currentTransaction().savepointName;
}

/**
 * Create a savepoint. Uses current_savepoint_name by default.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints#create_savepoint
 */
export async function createSavepoint(this: SavepointHost, name?: string): Promise<void> {
  const spName = name ?? this.currentSavepointName();
  await this.internalExecute(createSavepointSql(spName), "TRANSACTION", {
    materializeTransactions: false,
  });
}

/**
 * Rollback to a savepoint. Uses current_savepoint_name by default.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints#exec_rollback_to_savepoint
 */
export async function execRollbackToSavepoint(this: SavepointHost, name?: string): Promise<void> {
  const spName = name ?? this.currentSavepointName();
  await this.internalExecute(execRollbackToSavepointSql(spName), "TRANSACTION", {
    materializeTransactions: false,
  });
}

/**
 * Release a savepoint. Uses current_savepoint_name by default.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints#release_savepoint
 */
export async function releaseSavepoint(this: SavepointHost, name?: string): Promise<void> {
  const spName = name ?? this.currentSavepointName();
  await this.internalExecute(releaseSavepointSql(spName), "TRANSACTION", {
    materializeTransactions: false,
  });
}

/**
 * Mixin object for AbstractAdapter: bundles Savepoints methods so
 * `include(AbstractAdapter, Savepoints)` credits them to the host class.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints (included in AbstractAdapter)
 */
export const Savepoints = {
  currentSavepointName,
  createSavepoint,
  execRollbackToSavepoint,
  releaseSavepoint,
};
