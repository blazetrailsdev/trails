import type { SqliteConnection } from "../sqlite-adapter.js";
import { BusyException } from "./errors.js";
import { setBusyTimeout } from "./pragmas.js";

/** @noRailsEquivalent CONVERGEABLE sqlite-busy-wait-residual-gaps */
export async function retryBusy<T>(timeout: number, step: () => T | Promise<T>): Promise<T> {
  const deadline = Date.now() + timeout;
  while (true) {
    try {
      return await step();
    } catch (error) {
      if (!(error instanceof BusyException) || !(Date.now() <= deadline)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }
}

/** @noRailsEquivalent CONVERGEABLE sqlite-busy-wait-residual-gaps */
export async function execBatch(
  rawConnection: SqliteConnection,
  sql: string,
  timeout: number,
): Promise<void> {
  if (!timeout) return await rawConnection.exec(sql);
  await setBusyTimeout.call(rawConnection, timeout);
  try {
    await rawConnection.exec(sql);
  } finally {
    await setBusyTimeout.call(rawConnection, 0);
  }
}
