import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { Mysql2Adapter } from "../connection-adapters/mysql2-adapter.js";
import { Version } from "../connection-adapters/abstract-adapter.js";
import { PoolConfig } from "../connection-adapters/pool-config.js";
import { ConnectionDescriptor } from "../connection-adapters/abstract/connection-descriptor.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import type { TableDefinitionConn } from "../connection-adapters/abstract/schema-definitions.js";

export type SchemaConnName = "sqlite" | "postgres" | "mysql";

const conns = new Map<SchemaConnName, TableDefinitionConn>();

/**
 * The `conn` argument for DDL-rendering unit tests. Rails' `SchemaCreation.new`
 * and `TableDefinition#initialize` both require a connection, and its tests hand
 * them `ActiveRecord::Base.lease_connection` — an adapter that came out of a real
 * `ConnectionPool`. Tests that only render SQL cannot lease one for a dialect the
 * lane isn't running, so the adapter comes from a pool of its own via
 * `ConnectionPool#new_connection` (`abstract/connection_pool.rb:1003-1007`), which
 * constructs the adapter and assigns `connection.pool = self` without opening a
 * server connection — quoting and type mapping are pure, so the rendered DDL is
 * the adapter's own. A real pool is what makes `role` / `shard` / `inspect()`
 * answer, where the constructor's `NullPool` seed (`abstract_adapter.rb:153`)
 * would read `undefined` against Ruby's `NoMethodError`.
 *
 * `reaping_frequency: nil` keeps the pool's `Reaper` from ever running
 * (`connection_pool/reaper.rb:35` — a zero/nil frequency never reaps), so the
 * pool stays inert; nothing ever checks a connection out of it.
 *
 * MySQL's `supports_check_constraints?` / `supports_index_sort_order?` are
 * version-gated and read `database_version`, which reaches
 * `PoolConfig#server_version` (`pool_config.rb:39-41`) — cold on a connection that
 * was never opened, so the pool config is seeded through Rails'
 * `attr_writer :server_version` (`pool_config.rb:9`) with a modern server version.
 */
export function schemaConn(name: SchemaConnName): TableDefinitionConn {
  let conn = conns.get(name);
  if (!conn) {
    const dbConfig = new HashConfig("test", `schema_conn_${name}`, {
      adapter: name,
      database: "trails_schema_conn",
      reapingFrequency: null,
    });
    const poolConfig = new PoolConfig(
      new ConnectionDescriptor(`SchemaConn::${name}`),
      dbConfig,
      "writing",
      "default",
      {
        adapterFactory: () =>
          name === "sqlite"
            ? new BetterSQLite3Adapter(":memory:")
            : name === "postgres"
              ? new PostgreSQLAdapter("postgresql://localhost/trails_schema_conn")
              : new Mysql2Adapter("mysql://localhost/trails_schema_conn"),
      },
    );
    conn = poolConfig.pool.newConnection() as TableDefinitionConn;
    if (name === "mysql") {
      poolConfig.setServerVersion(new Version("8.0.35", "8.0.35"));
    }
    conns.set(name, conn);
  }
  return conn;
}
