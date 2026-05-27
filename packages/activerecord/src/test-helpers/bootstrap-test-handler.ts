import { Base } from "../base.js";
import { setToSqlVisitor } from "@blazetrails/arel";

/**
 * Bootstrap `Base.connectionHandler` for the current worker so that models
 * without a direct `static { this.adapter = X }` assignment resolve their
 * adapter via the Rails-shape handler chain:
 *
 *   Base.adapter getter → connectionHandler → pool → checkout
 *
 * Call once from `beforeAll` in test files that opt into the Phase-D pattern.
 * Idempotent: subsequent calls are no-ops when the handler is already connected.
 *
 * SQLite `:memory:` uses `pool: 1` to prevent the pool from creating multiple
 * independent in-memory databases. PG and MySQL use the default pool size.
 *
 * @internal
 */
export async function bootstrapTestHandler(): Promise<void> {
  if (!Base.isConnectedQ()) {
    const pgUrl = process.env.PG_TEST_URL;
    const mysqlUrl = process.env.MYSQL_TEST_URL;
    if (pgUrl) {
      await Base.establishConnection(pgUrl);
    } else if (mysqlUrl) {
      await Base.establishConnection(mysqlUrl);
    } else {
      await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
    }
  }
  // Sync the global Arel visitor so Node#toSql() uses the adapter-specific
  // visitor (e.g. SQLite strips FOR UPDATE). Mirrors the sync in Base.adapter setter.
  const visitor = (Base.adapter as { visitor?: object }).visitor;
  if (visitor) {
    setToSqlVisitor(
      (visitor as object).constructor as new () => {
        compile(node: import("@blazetrails/arel").Nodes.Node): string;
      },
    );
  }
}
