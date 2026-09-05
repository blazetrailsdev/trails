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
 * @internal
 * @noRailsEquivalent CONVERGEABLE retire-adapter-resolution-sync-companions
 */
export function resolveSync(adapterName: string): AdapterClass | null {
  return resolvedSyncCache.get(adapterName) ?? null;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE retire-adapter-resolution-sync-companions
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
 * @internal
 * @noRailsEquivalent CONVERGEABLE retire-adapter-resolution-sync-companions
 */
export function validateAdapterName(adapterName: string): void {
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
  const loadError = resolveErrors.get(adapterName);
  if (loadError !== undefined) throw loadError;
}

export async function resolve(adapterName: string): Promise<AdapterClass> {
  const cached = resolved.get(adapterName);
  if (cached) return cached;

  validateAdapterName(adapterName);
  const loader = adapters.get(adapterName)!;
  const promise = loader()
    .then((klass) => {
      resolvedSyncCache.set(adapterName, klass);
      resolveErrors.delete(adapterName);
      return klass;
    })
    .catch((err) => {
      resolved.delete(adapterName);
      const message = err instanceof Error ? err.message : String(err);
      const errorPath =
        typeof (err as { url?: unknown }).url === "string"
          ? (err as { url: string }).url
          : (/^Cannot find (?:module|package) '([^']+)'/.exec(message)?.[1] ?? null);
      const pathToAdapter =
        /import[\w$]*\(\s*["']([^"']+)["']/.exec(loader.toString())?.[1] ?? null;
      const loadError =
        (err as { code?: unknown }).code === "ERR_MODULE_NOT_FOUND" &&
        errorPath !== null &&
        pathToAdapter !== null &&
        (errorPath.startsWith("file:")
          ? new URL(errorPath).pathname.endsWith(pathToAdapter.replace(/^\.+/, ""))
          : errorPath === pathToAdapter || pathToAdapter.startsWith(`${errorPath}/`))
          ? new Error(
              `Error loading the '${adapterName}' Active Record adapter. Ensure that the path registered by the adapter package is correct. ${message}`,
              { cause: err },
            )
          : new Error(
              `Error loading the '${adapterName}' Active Record adapter. Missing a package it depends on? ${message}`,
              { cause: err },
            );
      resolveErrors.set(adapterName, loadError);
      throw loadError;
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
