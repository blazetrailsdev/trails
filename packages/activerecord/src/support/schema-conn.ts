import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { Mysql2Adapter } from "../connection-adapters/mysql2-adapter.js";
import { Version } from "../connection-adapters/abstract-adapter.js";
import type { TableDefinitionConn } from "../connection-adapters/abstract/schema-definitions.js";

export type SchemaConnName = "sqlite" | "postgres" | "mysql";

const conns = new Map<SchemaConnName, TableDefinitionConn>();

/**
 * The `conn` argument for DDL-rendering unit tests. Rails' `SchemaCreation.new`
 * and `TableDefinition#initialize` both require a connection, and its tests hand
 * them `ActiveRecord::Base.lease_connection`. Tests that only render SQL cannot
 * lease one for a dialect the lane isn't running, so they get a real adapter of
 * that dialect that is constructed but never connected — quoting and type
 * mapping are pure, so the rendered DDL is the adapter's own. MySQL's
 * `supports_check_constraints?` / `supports_index_sort_order?` are version-gated and
 * read the cached version, which is cold on a connection that was never opened, so
 * that adapter is seeded with a modern server version.
 */
export function schemaConn(name: SchemaConnName): TableDefinitionConn {
  let conn = conns.get(name);
  if (!conn) {
    conn =
      name === "sqlite"
        ? new BetterSQLite3Adapter(":memory:")
        : name === "postgres"
          ? new PostgreSQLAdapter("postgresql://localhost/trails_schema_conn")
          : new Mysql2Adapter("mysql://localhost/trails_schema_conn");
    if (name === "mysql") {
      // A connection that is never opened cannot answer `get_database_version`,
      // so seed the fetch the pool memo (`pool_config.rb:39-41`) caches.
      const version = new Version("8.0.35", "8.0.35");
      (conn as unknown as { getDatabaseVersion: () => Version }).getDatabaseVersion = () => version;
    }
    conns.set(name, conn);
  }
  return conn;
}
