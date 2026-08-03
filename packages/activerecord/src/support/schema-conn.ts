import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { Mysql2Adapter } from "../connection-adapters/mysql2-adapter.js";
import type { SchemaQuoter } from "../connection-adapters/abstract/assert-schema-adapter.js";

export type SchemaConnName = "sqlite" | "postgres" | "mysql";

const conns = new Map<SchemaConnName, SchemaQuoter>();

/**
 * The `conn` argument for DDL-rendering unit tests. Rails' `SchemaCreation.new`
 * and `TableDefinition#initialize` both require a connection, and its tests hand
 * them `ActiveRecord::Base.lease_connection`. Tests that only render SQL cannot
 * lease one for a dialect the lane isn't running, so they get a real adapter of
 * that dialect that is constructed but never connected — quoting and type
 * mapping are pure, so the rendered DDL is the adapter's own.
 */
export function schemaConn(name: SchemaConnName): SchemaQuoter {
  let conn = conns.get(name);
  if (!conn) {
    conn =
      name === "sqlite"
        ? new BetterSQLite3Adapter(":memory:")
        : name === "postgres"
          ? new PostgreSQLAdapter("postgresql://localhost/trails_schema_conn")
          : new Mysql2Adapter("mysql://localhost/trails_schema_conn");
    conns.set(name, conn);
  }
  return conn;
}
