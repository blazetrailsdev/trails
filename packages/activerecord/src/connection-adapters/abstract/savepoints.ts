/**
 * Savepoints — savepoint SQL generation.
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
