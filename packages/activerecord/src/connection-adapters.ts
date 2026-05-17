/**
 * Connection adapters — top-level module for database adapter infrastructure.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters
 */
import { AdapterNotFound } from "./errors.js";
import type { DatabaseAdapter } from "./adapter.js";

export interface ConnectionAdapters {
  readonly AbstractAdapter: unknown;
}

// Registered adapters: name → async loader producing the adapter class.
// Mirrors Rails ConnectionAdapters @adapters Hash storing [class_name, path].
// In TS we can't use String constantize, so we store loader functions instead.
type AdapterLoader = () => Promise<new (...args: any[]) => DatabaseAdapter>;
type AdapterClass = new (...args: any[]) => DatabaseAdapter;
const adapters = new Map<string, AdapterLoader>();
// Memoize the loader's result so resolve() is effectively a cached lookup
// (like Rails' adapter registry). Cleared when a name is re-registered.
const resolved = new Map<string, Promise<AdapterClass>>();
// Sync mirror of `resolved`, populated when each promise settles. Lets
// sync entry points (like `connectsTo`) hand the pool a sync
// `adapterFactory` once async adapter loading has completed at least once.
const resolvedSyncCache = new Map<string, AdapterClass>();

/**
 * Synchronous companion to `resolve(name)`. Returns the adapter class if it
 * has been resolved at least once (via `resolve()`), or null. Used by
 * `connectsTo` to build a sync `adapterFactory` without changing its
 * signature.
 *
 * @internal
 */
export function resolveSync(adapterName: string): AdapterClass | null {
  return resolvedSyncCache.get(adapterName) ?? null;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters.register
 *
 * Registers a custom database adapter. Can also be used to define aliases.
 *
 *   ConnectionAdapters.register("megadb", () => import("megadb").then(m => m.MegaDBAdapter))
 *
 * Pre-registered: sqlite3, mysql2, postgresql
 */
export function register(name: string, loader: AdapterLoader): void {
  adapters.set(name, loader);
  resolved.delete(name);
  resolvedSyncCache.delete(name);
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters.resolve
 *
 * Resolves an adapter name to its class.
 */
export async function resolve(adapterName: string): Promise<AdapterClass> {
  const cached = resolved.get(adapterName);
  if (cached) return cached;

  const loader = adapters.get(adapterName);
  if (!loader) {
    const available = [...adapters.keys()].sort().join(", ");
    throw new AdapterNotFound(
      `Database configuration specifies nonexistent '${adapterName}' adapter. ` +
        `Available adapters are: ${available}.`,
    );
  }
  const promise = loader()
    .then((klass) => {
      resolvedSyncCache.set(adapterName, klass);
      return klass;
    })
    .catch((err) => {
      resolved.delete(adapterName);
      throw err;
    });
  resolved.set(adapterName, promise);
  return promise;
}

// Pre-registered adapters matching Rails' canonical names.
const sqlite3Loader: AdapterLoader = async () => {
  // Lazy-load the default better-sqlite3 driver alongside the adapter so any
  // production entry point that resolves "sqlite3" (CLI bins, trailties,
  // establishConnection) gets a registered driver without each consumer
  // re-importing the subpath. Apps that pre-register a custom driver are
  // unaffected — registerSqliteDriver overwrites with a one-time warn.
  await import("@blazetrails/activesupport/sqlite/better-sqlite3").catch(() => {});
  return (await import("./connection-adapters/sqlite3-adapter.js")).SQLite3Adapter as any;
};
const mysql2Loader: AdapterLoader = async () =>
  (await import("./connection-adapters/mysql2-adapter.js")).Mysql2Adapter as any;
const postgresqlLoader: AdapterLoader = async () =>
  (await import("./connection-adapters/postgresql-adapter.js")).PostgreSQLAdapter as any;
register("sqlite3", sqlite3Loader);
register("mysql2", mysql2Loader);
register("postgresql", postgresqlLoader);

// Backward-compat aliases — canonical names come from Rails (sqlite3, mysql2,
// postgresql) but our codebase historically also accepts these short forms.
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
 */
export function defaultPrimaryKey(): string {
  return "id";
}
