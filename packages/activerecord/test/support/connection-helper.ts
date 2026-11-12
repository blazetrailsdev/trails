import { Base } from "../../lib/base.js";
import type { DatabaseConfigOptions } from "../../lib/database-configurations/database-config.js";

export async function runWithoutConnection<T>(
  fn: (configHash: DatabaseConfigOptions) => Promise<T> | T,
): Promise<T> {
  const originalConnection = (await Base.removeConnection())!;
  try {
    return await fn(originalConnection.configurationHash);
  } finally {
    await Base.establishConnection(originalConnection);
  }
}

export async function resetConnection(): Promise<void> {
  const originalConnection = (await Base.removeConnection())!;
  await Base.establishConnection(originalConnection);
}
