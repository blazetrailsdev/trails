import { onTestFinished } from "vitest";
import type { Base } from "../base.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";

export class AdapterDouble extends AbstractAdapter {
  static override readonly ADAPTER_NAME: string = "AdapterDouble";

  override async active(): Promise<boolean> {
    return true;
  }
}

export function adapterDouble<T extends object>(overrides: T = {} as T): AdapterDouble & T {
  const double = new AdapterDouble({});
  Object.defineProperties(double, Object.getOwnPropertyDescriptors(overrides));
  return double as AdapterDouble & T;
}

export async function establishConnectionTo(
  klass: typeof Base,
  connection: AbstractAdapter,
): Promise<() => Promise<void>> {
  const wasConnectionClass = klass.connectionClass;
  const originalPool = (connection as unknown as { pool: unknown }).pool;
  const dbConfig = new HashConfig("test", `${klass.name}_fake`, { adapter: "fake" });
  dbConfig.newConnection = () => connection;
  await klass.establishConnection(dbConfig);
  const pool = klass.connectionPool();
  (klass as unknown as { resetColumnInformation(): void }).resetColumnInformation();
  let restored = false;
  const restore = async () => {
    if (restored) return;
    restored = true;
    pool.remove(connection);
    try {
      connection.expire();
    } catch {}
    (connection as unknown as { pool: unknown }).pool = originalPool;
    klass.removeConnection();
    klass.connectionClass = wasConnectionClass;
    (klass as unknown as { resetColumnInformation(): void }).resetColumnInformation();
  };
  try {
    onTestFinished(restore);
  } catch {}
  return restore;
}
