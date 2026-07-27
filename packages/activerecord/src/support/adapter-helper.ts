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
import { getEnv } from "@blazetrails/activesupport";

/**
 * The `ActiveRecord::ConnectionAdapters` constant names `current_adapter?` is
 * called with in the AR suite. `TrilogyAdapter` is accepted so ported call
 * sites can stay verbatim; trails has no Trilogy adapter (Ruby-only driver),
 * so it never matches.
 */
export type AdapterClassName =
  | "SQLite3Adapter"
  | "PostgreSQLAdapter"
  | "Mysql2Adapter"
  | "TrilogyAdapter";

const ADAPTER_CLASS: Record<AdapterClassName, string> = {
  SQLite3Adapter: "sqlite",
  PostgreSQLAdapter: "postgres",
  Mysql2Adapter: "mysql",
  // No trails backend ever answers to this, so `current_adapter?(:TrilogyAdapter)`
  // is permanently false.
  TrilogyAdapter: "trilogy",
};

/**
 * `current_adapter?(*types)` (adapter_helper.rb:4) — is the active connection
 * an instance of any of the named adapter classes?
 */
export function currentAdapter(...types: AdapterClassName[]): boolean {
  return types.some((type) => ADAPTER_CLASS[type] === adapterType);
}

/**
 * `in_memory_db?` (adapter_helper.rb:12): `current_adapter?(:SQLite3Adapter)
 * && db_config.database == ":memory:"`.
 *
 * The `db_config.database` analog here is the `database` field of the
 * `DatabaseConfigurations` entry built in `support/test-database-config.ts`,
 * which is `AR_TEST_WORKER_DB ?? ":memory:"` — i.e. literally `":memory:"` on
 * the default lane and a real on-disk clone path when a per-worker template
 * exists. So `!AR_TEST_WORKER_DB` is exactly `db_config.database == ":memory:"`.
 */
export function inMemoryDb(): boolean {
  return currentAdapter("SQLite3Adapter") && !getEnv("AR_TEST_WORKER_DB");
}

/**
 * `sqlite3_adapter_strict_strings_disabled?` (adapter_helper.rb:16):
 * `current_adapter?(:SQLite3Adapter) && !configuration_hash[:strict]`.
 *
 * {@link ambientPoolConfiguration} is trails' `configuration_hash` for the
 * active lane's primary connection.
 */
export function sqlite3AdapterStrictStringsDisabled(): boolean {
  return currentAdapter("SQLite3Adapter") && !ambientPoolConfiguration().strict;
}

/**
 * `mysql_enforcing_gtid_consistency?` (adapter_helper.rb:20). Async because
 * `show_variable` issues a query.
 */
export async function mysqlEnforcingGtidConsistency(): Promise<boolean> {
  if (!currentAdapter("Mysql2Adapter", "TrilogyAdapter")) return false;
  const connection = (await Base.leaseConnection()) as unknown as {
    showVariable(name: string): Promise<string | null>;
  };
  return (await connection.showVariable("enforce_gtid_consistency")) === "ON";
}

/** The connection surface `enable_extension!` / `disable_extension!` drive. */
type ExtensionConnection = {
  supportsExtensions(): boolean;
  extensionEnabled(name: string): Promise<boolean>;
  enableExtension(name: string, options?: Record<string, unknown>): Promise<void>;
  disableExtension(name: string, options?: Record<string, unknown>): Promise<void>;
  reconnectBang(): Promise<void>;
  commitDbTransaction(): Promise<void>;
  isTransactionOpen(): boolean;
};

/**
 * `enable_extension!(extension, connection)` (adapter_helper.rb:87). Returns
 * `false` when the adapter has no extension support, mirroring Rails' guard.
 */
export async function enableExtensionBang(
  extension: string,
  connection: ExtensionConnection,
): Promise<boolean> {
  if (!connection.supportsExtensions()) return false;
  if (await connection.extensionEnabled(extension)) {
    await connection.reconnectBang();
    return true;
  }

  await connection.enableExtension(extension);
  if (connection.isTransactionOpen()) await connection.commitDbTransaction();
  await connection.reconnectBang();
  return true;
}

/**
 * `disable_extension!(extension, connection)` (adapter_helper.rb:96).
 */
export async function disableExtensionBang(
  extension: string,
  connection: ExtensionConnection,
): Promise<boolean> {
  if (!connection.supportsExtensions()) return false;
  if (!(await connection.extensionEnabled(extension))) return true;

  await connection.disableExtension(extension, { force: "cascade" });
  await connection.reconnectBang();
  return true;
}
