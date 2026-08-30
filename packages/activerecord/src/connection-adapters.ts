import { AdapterNotFound } from "./errors.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";

export interface ConnectionAdapters {
  readonly AbstractAdapter: unknown;
}

type AdapterLoader = () => Promise<new (...args: any[]) => DatabaseAdapter>;
type AdapterClass = new (...args: any[]) => DatabaseAdapter;
const adapters = new Map<string, AdapterLoader>();
const resolved = new Map<string, Promise<AdapterClass>>();
const resolvedSyncCache = new Map<string, AdapterClass>();
const resolveErrors = new Map<string, unknown>();

/**
 * Synchronous companion to `resolve(name)`. Returns the adapter class if it
 * has been resolved at least once (via `resolve()`), or null. Used by
 * `db_config.new_connection`, which is synchronous as Rails' is.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE Ruby's ConnectionAdapters.resolve (connection_adapters.rb:34-39) is synchronous because `require` is; retires with the pool async convergence.
 */
export function resolveSync(adapterName: string): AdapterClass | null {
  return resolvedSyncCache.get(adapterName) ?? null;
}

/**
 * Returns the rejection from a prior `resolve()` call for this adapter
 * name, or null if no failure was recorded. Lets sync entry points
 * (`ConnectionPool.newConnection` → `dbConfig.newConnection`) surface the
 * original failure cause (AdapterNotFound, import error, etc.) instead of
 * a generic "not pre-resolved" message.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE surfaces the failure Ruby's synchronous resolve raises in place (connection_adapters.rb:34-39); retires with the same convergence.
 */
export function resolveSyncError(adapterName: string): unknown | null {
  return resolveErrors.get(adapterName) ?? null;
}

export function register(name: string, loader: AdapterLoader): void {
  adapters.set(name, loader);
  resolved.delete(name);
  resolvedSyncCache.delete(name);
  resolveErrors.delete(name);
}

/**
 * Synchronous half of `resolve(name)` — Rails does this check inline, but
 * trails' sync callers can't await the dynamic import. The message stays in
 * `resolve`, which builds it once as Ruby does (connection_adapters.rb:34-39);
 * this raises what `resolve` recorded on its synchronous prefix.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the AdapterNotFound check Ruby writes inline in resolve (connection_adapters.rb:34-39), split out for the sync callers.
 */
export function validateAdapterName(adapterName: string): void {
  if (adapters.has(adapterName)) return;
  void resolve(adapterName).catch(() => {});
  throw resolveErrors.get(adapterName);
}

export async function resolve(adapterName: string): Promise<AdapterClass> {
  const cached = resolved.get(adapterName);
  if (cached) return cached;

  const loader = adapters.get(adapterName);
  if (!loader) {
    const err = new AdapterNotFound(
      `Database configuration specifies nonexistent '${adapterName}' adapter. ` +
        `Available adapters are: ${[...adapters.keys()].sort().join(", ")}. ` +
        `Ensure that the adapter is spelled correctly in config/database.yml and that you've added the necessary ` +
        `adapter package to your package.json if it's not in the list of available adapters.`,
    );
    resolveErrors.set(adapterName, err);
    throw err;
  }
  const promise = loader()
    .then((klass) => {
      resolvedSyncCache.set(adapterName, klass);
      resolveErrors.delete(adapterName);
      return klass;
    })
    .catch((err) => {
      resolved.delete(adapterName);
      resolveErrors.set(adapterName, err);
      throw err;
    });
  resolved.set(adapterName, promise);
  return promise;
}

const sqlite3Loader: AdapterLoader = async () =>
  (await import("./connection-adapters/better-sqlite3-adapter.js")).BetterSQLite3Adapter as any;
const nodeSqliteLoader: AdapterLoader = async () =>
  (await import("./connection-adapters/node-sqlite-adapter.js")).NodeSQLiteAdapter as any;
const expoSqliteLoader: AdapterLoader = async () =>
  (await import("./connection-adapters/expo-sqlite-adapter.js")).ExpoSQLiteAdapter as any;
const libsqlLoader: AdapterLoader = async () =>
  (await import("./connection-adapters/libsql-adapter.js")).LibSQLAdapter as any;
const libsqlRemoteLoader: AdapterLoader = async () =>
  (await import("./connection-adapters/libsql-remote-adapter.js")).LibSQLRemoteAdapter as any;
const libsqlReplicaLoader: AdapterLoader = async () =>
  (await import("./connection-adapters/libsql-replica-adapter.js")).LibSQLReplicaAdapter as any;
const mysql2Loader: AdapterLoader = async () =>
  (await import("./connection-adapters/mysql2-adapter.js")).Mysql2Adapter as any;
const postgresqlLoader: AdapterLoader = async () =>
  (await import("./connection-adapters/postgresql-adapter.js")).PostgreSQLAdapter as any;
register("sqlite3", sqlite3Loader);
register("node-sqlite", nodeSqliteLoader);
register("expo-sqlite", expoSqliteLoader);
register("libsql", libsqlLoader);
register("libsql-remote", libsqlRemoteLoader);
register("libsql-replica", libsqlReplicaLoader);
register("mysql2", mysql2Loader);
register("postgresql", postgresqlLoader);

register("sqlite", sqlite3Loader);
register("mysql", mysql2Loader);
register("postgres", postgresqlLoader);

export { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
export { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
export { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
export { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
export { SchemaCreation } from "./connection-adapters/abstract/schema-creation.js";
export { Column, NullColumn } from "./connection-adapters/column.js";
export { PoolConfig } from "./connection-adapters/pool-config.js";
export { PoolManager } from "./connection-adapters/pool-manager.js";
export {
  SchemaCache,
  SchemaReflection,
  BoundSchemaReflection,
  FakePool,
} from "./connection-adapters/schema-cache.js";
export { SqlTypeMetadata } from "./connection-adapters/sql-type-metadata.js";
export { StatementPool } from "./connection-adapters/statement-pool.js";
export { deduplicate, registry, type Deduplicable } from "./connection-adapters/deduplicable.js";
export {
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  TableDefinition,
} from "./connection-adapters/abstract/schema-definitions.js";

/**
 * Returns the default primary key name used when creating tables.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::TableDefinition#default_primary_key (private)
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE TableDefinition#default_primary_key (abstract/schema_definitions.rb:170) hoisted to a free function; the port splits that file.
 */
export function defaultPrimaryKey(): string {
  return "id";
}
