export function createSavepointSql(name: string | null): string {
  return `SAVEPOINT ${name ?? ""}`;
}

export function execRollbackToSavepointSql(name: string | null): string {
  return `ROLLBACK TO SAVEPOINT ${name ?? ""}`;
}

export function releaseSavepointSql(name: string | null): string {
  return `RELEASE SAVEPOINT ${name ?? ""}`;
}

export interface SavepointHost {
  internalExecute(
    sql: string,
    name: string,
    binds?: unknown[],
    opts?: { materializeTransactions?: boolean },
  ): Promise<unknown>;
  currentSavepointName(): string | null;
}

export interface CurrentSavepointNameHost {
  currentTransaction(): { savepointName: string | null };
}

export function currentSavepointName(this: CurrentSavepointNameHost): string | null {
  return this.currentTransaction().savepointName;
}

export async function createSavepoint(this: SavepointHost, name?: string): Promise<void> {
  const spName = name ?? this.currentSavepointName();
  await this.internalExecute(createSavepointSql(spName), "TRANSACTION");
}

export async function execRollbackToSavepoint(this: SavepointHost, name?: string): Promise<void> {
  const spName = name ?? this.currentSavepointName();
  await this.internalExecute(execRollbackToSavepointSql(spName), "TRANSACTION");
}

export async function releaseSavepoint(this: SavepointHost, name?: string): Promise<void> {
  const spName = name ?? this.currentSavepointName();
  await this.internalExecute(releaseSavepointSql(spName), "TRANSACTION");
}

export const Savepoints = {
  currentSavepointName,
  createSavepoint,
  execRollbackToSavepoint,
  releaseSavepoint,
};
