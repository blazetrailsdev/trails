/**
 * Port of `vendor/rails/activerecord/test/support/adapter_helper.rb` — the
 * `AdapterHelper` module of predicates AR tests gate on.
 *
 * Rails resolves the active adapter from the live connection
 * (`ActiveRecord::Base.lease_connection.is_a?(...)`). trails resolves it from
 * {@link adapterType}, which is derived from `ARCONN` at module load exactly
 * the way Rails' `connections:` hash key selects the adapter — so these
 * predicates stay synchronous and connection-free, which matters because tests
 * call them at collection time (`describe.skipIf(inMemoryDb())`).
 *
 * `adapter_helper.rb`'s `supports_<feature>?` methods (the `define_method`
 * block plus `supports_default_expression?`,
 * `supports_non_unique_constraint_name?`, `supports_text_column_with_default?`
 * and `supports_sql_standard_drop_constraint?`) are rendered by
 * `support/supports.ts` as one feature-keyed table rather than as ~19
 * individual exports here — its keys are the same `supports_<key>?` names, and
 * the test:compare gate extractor reads those keys. That file also carries
 * feature keys with no `adapter_helper.rb` counterpart (they are the adapters'
 * own `supports_*?` methods, which Rails tests call directly on the
 * connection); they stay there for the same reason.
 */

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

export function inMemoryDb(): boolean {
  if (!currentAdapter("SQLite3Adapter")) return false;
  const database = Base.isConnectedQ()
    ? Base.connectionPool().dbConfig.database
    : ambientPoolConfiguration().database;
  return database === ":memory:";
}

export function sqlite3AdapterStrictStringsDisabled(): boolean {
  return currentAdapter("SQLite3Adapter") && !ambientPoolConfiguration().strict;
}

export async function mysqlEnforcingGtidConsistency(): Promise<boolean> {
  if (!currentAdapter("Mysql2Adapter", "TrilogyAdapter")) return false;
  const connection = (await Base.leaseConnection()) as unknown as {
    showVariable(name: string): Promise<string | null>;
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
