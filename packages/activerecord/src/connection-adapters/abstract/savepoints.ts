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
  // materializeTransactions defaults to true, matching Rails savepoints.rb:11-20
  // (internal_execute's default). The re-entrant materialize pass is a no-op —
  // createSavepoint runs inside materializeBang, where the
  // `_materializingTransactions` guard is already set — and internalExecute's
  // finally then dirties the current frame (Rails' with_raw_connection ensure).
  await this.internalExecute(createSavepointSql(spName), "TRANSACTION");
}

/**
 * Rollback to a savepoint. Uses current_savepoint_name by default.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints#exec_rollback_to_savepoint
 */
export async function execRollbackToSavepoint(this: SavepointHost, name?: string): Promise<void> {
  const spName = name ?? this.currentSavepointName();
  // materializeTransactions:true (default) per Rails savepoints.rb. The
  // committing/rolling-back savepoint frame is already popped, so
  // internalExecute's finally dirties the real PARENT frame — Rails
  // with_raw_connection's `ensure dirty_current_transaction` — making the
  // parent non-restorable if this savepoint op hit a reconnect mid-flight.
  await this.internalExecute(execRollbackToSavepointSql(spName), "TRANSACTION");
}

/**
 * Release a savepoint. Uses current_savepoint_name by default.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints#release_savepoint
 */
export async function releaseSavepoint(this: SavepointHost, name?: string): Promise<void> {
  const spName = name ?? this.currentSavepointName();
  // materializeTransactions:true (default) per Rails savepoints.rb. See
  // execRollbackToSavepoint — the popped-frame → parent-dirty semantics apply
  // identically to RELEASE SAVEPOINT.
  await this.internalExecute(releaseSavepointSql(spName), "TRANSACTION");
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
