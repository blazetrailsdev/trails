import { adapterType, ambientPoolConfiguration } from "../test-adapter.js";
import { Base } from "../base.js";

export type AdapterClassName =
  | "SQLite3Adapter"
  | "PostgreSQLAdapter"
  | "Mysql2Adapter"
  | "TrilogyAdapter";

const ADAPTER_CLASS: Record<AdapterClassName, string> = {
  SQLite3Adapter: "sqlite",
  PostgreSQLAdapter: "postgres",
  Mysql2Adapter: "mysql",
  TrilogyAdapter: "trilogy",
};

export function currentAdapter(...types: AdapterClassName[]): boolean {
  return types.some((type) => ADAPTER_CLASS[type] === adapterType);
}

function poolConfigurationHash(): Record<string, unknown> {
  return Base.connectedQ()
    ? (Base.connectionPool().dbConfig.configurationHash as Record<string, unknown>)
    : ambientPoolConfiguration();
}

export function inMemoryDb(): boolean {
  if (!currentAdapter("SQLite3Adapter")) return false;
  return poolConfigurationHash().database === ":memory:";
}

export function sqlite3AdapterStrictStringsDisabled(): boolean {
  if (!currentAdapter("SQLite3Adapter")) return false;
  return !poolConfigurationHash().strict;
}

export async function mysqlEnforcingGtidConsistency(): Promise<boolean> {
  if (!currentAdapter("Mysql2Adapter", "TrilogyAdapter")) return false;
  const connection = (await Base.leaseConnection()) as unknown as {
    showVariable(name: string): Promise<unknown>;
  };
  return (await connection.showVariable("enforce_gtid_consistency")) === "ON";
}

type ExtensionConnection = {
  supportsExtensions(): boolean;
  extensionEnabled(name: string): Promise<boolean>;
  enableExtension(name: string, options?: Record<string, unknown>): Promise<void>;
  disableExtension(name: string, options?: Record<string, unknown>): Promise<void>;
  reconnectBang(): Promise<void>;
  commitDbTransaction(): Promise<void>;
  isTransactionOpen(): boolean;
};

export async function enableExtensionBang(
  extension: string,
  connection: ExtensionConnection,
): Promise<false | void> {
  if (!connection.supportsExtensions()) return false;
  if (await connection.extensionEnabled(extension)) return connection.reconnectBang();

  await connection.enableExtension(extension);
  if (connection.isTransactionOpen()) await connection.commitDbTransaction();
  return connection.reconnectBang();
}

export async function disableExtensionBang(
  extension: string,
  connection: ExtensionConnection,
): Promise<boolean | void> {
  if (!connection.supportsExtensions()) return false;
  if (!(await connection.extensionEnabled(extension))) return true;

  await connection.disableExtension(extension, { force: "cascade" });
  return connection.reconnectBang();
}
