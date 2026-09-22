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
  return Base.isConnected()
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

const mysqlServer = adapterType === "mysql" ? await import("./mysql-server-version.js") : undefined;

export function supportsDefaultExpression(): boolean | undefined {
  if (currentAdapter("PostgreSQLAdapter")) {
    return true;
  } else if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
    const conn = mysqlServer!;
    return (
      (conn.isMariaDb && (conn.serverVersion?.compare("10.2.1") ?? -1) >= 0) ||
      (!conn.isMariaDb && (conn.serverVersion?.compare("8.0.13") ?? -1) >= 0)
    );
  }
  return undefined;
}

export function supportsNonUniqueConstraintName(): boolean {
  if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
    const conn = mysqlServer!;
    return conn.isMariaDb;
  } else {
    return false;
  }
}

export function supportsTextColumnWithDefault(): boolean {
  if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
    const conn = mysqlServer!;
    return conn.isMariaDb && (conn.serverVersion?.compare("10.2.1") ?? -1) >= 0;
  } else {
    return true;
  }
}

export function supportsSqlStandardDropConstraint(): boolean {
  if (currentAdapter("SQLite3Adapter")) {
    return false;
  } else if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
    const conn = mysqlServer!;
    if (conn.isMariaDb) {
      return (conn.serverVersion?.compare("10.3.13") ?? -1) >= 0;
    } else {
      return (conn.serverVersion?.compare("8.0.19") ?? -1) >= 0;
    }
  } else {
    return true;
  }
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
