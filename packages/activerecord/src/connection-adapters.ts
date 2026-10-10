import { underscore } from "@blazetrails/activesupport";
import { LoadError, NameError, rbModConstDefined, rbModConstGet } from "@blazetrails/ruby-compat";
import { AdapterNotFound } from "./errors.js";
import { ActiveRecord, ConnectionAdapters } from "./namespaces.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";

type AdapterClass = typeof DatabaseAdapter;
const adapters = new Map<string, [string, string]>();
const loadErrors = new Map<string, unknown>();

export function register(
  name: string,
  className: string,
  path: string = underscore(className),
): void {
  adapters.set(name, [className, path]);
  loadErrors.delete(name);
}

/** @noRailsEquivalent PERMANENT */
export async function load(adapterName: string | undefined): Promise<void> {
  const [className, pathToAdapter] = adapters.get(adapterName ?? "") ?? [];
  if (!className) return;

  loadErrors.delete(adapterName ?? "");
  if (!rbModConstDefined(Object, className)) {
    try {
      await (ConnectionAdapters.loadPath[pathToAdapter!] ?? (() => import(pathToAdapter!)))();
    } catch (error) {
      loadErrors.set(adapterName ?? "", error);
    }
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

  if (!rbModConstDefined(Object, className)) {
    const error = loadErrors.get(adapterName ?? "");
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
  }

  try {
    return rbModConstGet(Object, className) as AdapterClass;
  } catch (error) {
    if (!(error instanceof NameError)) throw error;
    throw new AdapterNotFound(
      `Could not load the ${className} Active Record adapter (${error.message}).`,
    );
  }
}

ConnectionAdapters.register = register;
ConnectionAdapters.load = load;
ConnectionAdapters.resolve = resolve;
ActiveRecord.ConnectionAdapters = ConnectionAdapters;

register(
  "sqlite3",
  "ActiveRecord::ConnectionAdapters::BetterSQLite3Adapter",
  "active_record/connection_adapters/better_sqlite3_adapter",
);
register(
  "node-sqlite",
  "ActiveRecord::ConnectionAdapters::NodeSQLiteAdapter",
  "active_record/connection_adapters/node_sqlite_adapter",
);
register(
  "expo-sqlite",
  "ActiveRecord::ConnectionAdapters::ExpoSQLiteAdapter",
  "active_record/connection_adapters/expo_sqlite_adapter",
);
register(
  "libsql",
  "ActiveRecord::ConnectionAdapters::LibSQLAdapter",
  "active_record/connection_adapters/libsql_adapter",
);
register(
  "libsql-remote",
  "ActiveRecord::ConnectionAdapters::LibSQLRemoteAdapter",
  "active_record/connection_adapters/libsql_remote_adapter",
);
register(
  "libsql-replica",
  "ActiveRecord::ConnectionAdapters::LibSQLReplicaAdapter",
  "active_record/connection_adapters/libsql_replica_adapter",
);
register(
  "mysql2",
  "ActiveRecord::ConnectionAdapters::Mysql2Adapter",
  "active_record/connection_adapters/mysql2_adapter",
);
register(
  "postgresql",
  "ActiveRecord::ConnectionAdapters::PostgreSQLAdapter",
  "active_record/connection_adapters/postgresql_adapter",
);

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
