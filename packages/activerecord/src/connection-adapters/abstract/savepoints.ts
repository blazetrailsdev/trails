/**
 * Savepoints — savepoint SQL generation and execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints
 */

let _currentSavepointNumber = 0;

function validateSavepointName(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid savepoint name: ${name}`);
  }
  return name;
}

export function currentSavepointName(): string {
  return `active_record_${_currentSavepointNumber}`;
}

export function createSavepointSql(name: string): string {
  return `SAVEPOINT ${validateSavepointName(name)}`;
}

export function execRollbackToSavepointSql(name: string): string {
  return `ROLLBACK TO SAVEPOINT ${validateSavepointName(name)}`;
}

export function releaseSavepointSql(name: string): string {
  return `RELEASE SAVEPOINT ${validateSavepointName(name)}`;
}

export function nextSavepointName(): string {
  _currentSavepointNumber++;
  return currentSavepointName();
}

export function resetSavepointNumber(): void {
  _currentSavepointNumber = 0;
}

/**
 * Host interface for savepoint mixin methods.
 * Adapters that include Savepoints must provide internalExecute.
 */
export interface SavepointHost {
  internalExecute(sql: string, name: string): Promise<unknown>;
  currentSavepointName?(): string;
}

/**
 * Create a savepoint. Uses current_savepoint_name by default.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints#create_savepoint
 */
export async function createSavepoint(this: SavepointHost, name?: string): Promise<void> {
  const spName = name ?? this.currentSavepointName?.() ?? currentSavepointName();
  await this.internalExecute(createSavepointSql(spName), "TRANSACTION");
}

/**
 * Rollback to a savepoint. Uses current_savepoint_name by default.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints#exec_rollback_to_savepoint
 */
export async function execRollbackToSavepoint(this: SavepointHost, name?: string): Promise<void> {
  const spName = name ?? this.currentSavepointName?.() ?? currentSavepointName();
  await this.internalExecute(execRollbackToSavepointSql(spName), "TRANSACTION");
}

/**
 * Release a savepoint. Uses current_savepoint_name by default.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Savepoints#release_savepoint
 */
export async function releaseSavepoint(this: SavepointHost, name?: string): Promise<void> {
  const spName = name ?? this.currentSavepointName?.() ?? currentSavepointName();
  await this.internalExecute(releaseSavepointSql(spName), "TRANSACTION");
}
