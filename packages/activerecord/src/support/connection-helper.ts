import { Base } from "../base.js";
import type { DatabaseConfigOptions } from "../database-configurations/database-config.js";

export async function runWithoutConnection<T>(
  fn: (configHash: DatabaseConfigOptions) => Promise<T> | T,
): Promise<T> {
  const originalConnection = Base.removeConnection()!;
  try {
    return await fn(originalConnection.configurationHash);
  } finally {
    await Base.establishConnection(originalConnection);
  }
}

export async function resetConnection(): Promise<void> {
  const originalConnection = Base.removeConnection()!;
  await Base.establishConnection(originalConnection);
}
