import { underscore } from "@blazetrails/activesupport";
import { LoadError } from "@blazetrails/ruby-compat";
import { AdapterNotFound } from "./errors.js";
import { ActiveRecord, ConnectionAdapters } from "./namespaces.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";

type AdapterLoader = () => Promise<new (...args: any[]) => DatabaseAdapter>;
type AdapterClass = new (...args: any[]) => DatabaseAdapter;
const adapters = new Map<string, [string, string, AdapterLoader]>();
const resolved = new Map<string, AdapterClass>();
const resolveErrors = new Map<string, unknown>();

export function register(
  name: string,
  className: string,
  path: string = underscore(className),
  loader: AdapterLoader = async () => (await import(path))[className],
): void {
  adapters.set(name, [className, path, loader]);
  resolved.delete(name);
  resolveErrors.delete(name);
}

/** @noRailsEquivalent PERMANENT */
export async function load(adapterName: string | undefined): Promise<void> {
  const [, , loader] = adapters.get(adapterName ?? "") ?? [];
  if (!loader || resolved.has(adapterName ?? "")) return;

  resolveErrors.delete(adapterName ?? "");
  try {
    const klass = await loader();
    if (klass !== undefined) resolved.set(adapterName ?? "", klass);
  } catch (error) {
    resolveErrors.set(adapterName ?? "", error);
  }
}

export function resolve(adapterName: string | undefined): AdapterClass {
  const [className, pathToAdapter] = adapters.get(adapterName ?? "") ?? [];

  if (!className) {
    throw new AdapterNotFound(
      `Database configuration specifies nonexistent '${adapterName ?? ""}' adapter. ` +
        `Available adapters are: ${[...adapters.keys()].sort().join(", ")}. ` +
        `Ensure that the adapter is spelled correctly in config/database.yml and that you've added the necessary ` +
        `adapter gem to your Gemfile if it's not in the list of available adapters.`,
    );
  }

  const klass = resolved.get(adapterName ?? "");
  if (!klass) {
    const error = resolveErrors.get(adapterName ?? "");
    if (error !== undefined) {
      const message = error instanceof Error ? error.message : String(error);
      const errorPath =
        typeof (error as { url?: unknown }).url === "string"
          ? (error as { url: string }).url
          : (/^Cannot find (?:module|package) '([^']+)'/.exec(message)?.[1] ?? null);
      if (
        (error as { code?: unknown }).code === "ERR_MODULE_NOT_FOUND" &&
        errorPath !== null &&
        pathToAdapter !== undefined &&
        (errorPath.startsWith("file:")
          ? new URL(errorPath).pathname.endsWith(pathToAdapter.replace(/^\.+/, ""))
          : errorPath === pathToAdapter || pathToAdapter.startsWith(`${errorPath}/`))
      ) {
        throw new LoadError(
          `Error loading the '${adapterName ?? ""}' Active Record adapter. Ensure that the path registered by the adapter gem is correct. ${message}`,
          { cause: error },
        );
      } else {
        throw new LoadError(
          `Error loading the '${adapterName ?? ""}' Active Record adapter. Missing a gem it depends on? ${message}`,
          { cause: error },
        );
      }
    }

    throw new AdapterNotFound(
      `Could not load the ${className} Active Record adapter (uninitialized constant ${className}).`,
    );
  }
  return klass;
}

ConnectionAdapters.register = register;
ConnectionAdapters.load = load;
ConnectionAdapters.resolve = resolve;
ActiveRecord.ConnectionAdapters = ConnectionAdapters;

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
const builtinLoaders: Record<string, [string, string, AdapterLoader]> = {
  sqlite3: [
    "BetterSQLite3Adapter",
    "./connection-adapters/better-sqlite3-adapter.js",
    sqlite3Loader,
  ],
  "node-sqlite": [
    "NodeSQLiteAdapter",
    "./connection-adapters/node-sqlite-adapter.js",
    nodeSqliteLoader,
  ],
  "expo-sqlite": [
    "ExpoSQLiteAdapter",
    "./connection-adapters/expo-sqlite-adapter.js",
    expoSqliteLoader,
  ],
  libsql: ["LibSQLAdapter", "./connection-adapters/libsql-adapter.js", libsqlLoader],
  "libsql-remote": [
    "LibSQLRemoteAdapter",
    "./connection-adapters/libsql-remote-adapter.js",
    libsqlRemoteLoader,
  ],
  "libsql-replica": [
    "LibSQLReplicaAdapter",
    "./connection-adapters/libsql-replica-adapter.js",
    libsqlReplicaLoader,
  ],
  mysql2: ["Mysql2Adapter", "./connection-adapters/mysql2-adapter.js", mysql2Loader],
  postgresql: [
    "PostgreSQLAdapter",
    "./connection-adapters/postgresql-adapter.js",
    postgresqlLoader,
  ],
};

for (const [name, [className, path, loader]] of Object.entries(builtinLoaders))
  register(name, className, path, loader);

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
export { Deduplicable, deduplicate, registry } from "./connection-adapters/deduplicable.js";
export {
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  TableDefinition,
} from "./connection-adapters/abstract/schema-definitions.js";
