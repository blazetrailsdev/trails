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

export async function createSavepoint(
  this: SavepointHost,
  name: string | null = this.currentSavepointName(),
): Promise<void> {
  await this.internalExecute(`SAVEPOINT ${name ?? ""}`, "TRANSACTION");
}

export async function execRollbackToSavepoint(
  this: SavepointHost,
  name: string | null = this.currentSavepointName(),
): Promise<void> {
  await this.internalExecute(`ROLLBACK TO SAVEPOINT ${name ?? ""}`, "TRANSACTION");
}

export async function releaseSavepoint(
  this: SavepointHost,
  name: string | null = this.currentSavepointName(),
): Promise<void> {
  await this.internalExecute(`RELEASE SAVEPOINT ${name ?? ""}`, "TRANSACTION");
}

export const Savepoints = {
  currentSavepointName,
  createSavepoint,
  execRollbackToSavepoint,
  releaseSavepoint,
};
