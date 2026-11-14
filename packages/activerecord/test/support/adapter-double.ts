import { onTestFinished } from "vitest";
import type { Base } from "../../lib/base.js";
import { HashConfig } from "../../lib/database-configurations/hash-config.js";
import { AbstractAdapter } from "../../lib/connection-adapters/abstract-adapter.js";

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
  dbConfig.adapterClass = () => connection.constructor as never;
  await klass.establishConnection(dbConfig);
  const pool = klass.connectionPool();
  if (pool.activeConnection == null && pool.connections.includes(connection)) {
    await pool.leaseConnection();
  }
  const schemaCache = Object.getOwnPropertyDescriptor(connection, "schemaCache")?.value;
  if (schemaCache) pool.schemaReflection.loadedCache = schemaCache;
  await (klass as unknown as { resetColumnInformation(): Promise<void> }).resetColumnInformation();
  let restored = false;
  const restore = async () => {
    if (restored) return;
    restored = true;
    await pool.remove(connection);
    try {
      connection.expire();
    } catch {}
    (connection as unknown as { pool: unknown }).pool = originalPool;
    await klass.removeConnection();
    klass.connectionClass = wasConnectionClass;
    await (
      klass as unknown as { resetColumnInformation(): Promise<void> }
    ).resetColumnInformation();
  };
  try {
    onTestFinished(restore);
  } catch {}
  return restore;
}
