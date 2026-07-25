import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { Base } from "../index.js";

/** Rails' `@connection = ActiveRecord::Base.lease_connection`. */
export async function ambientConnection(): Promise<AbstractAdapter> {
  return (await Base.leaseConnection()) as unknown as AbstractAdapter;
}

/**
 * `ActiveRecord::Migration::ForeignKeyTest`'s setup/teardown,
 * foreign_key_test.rb:178-194. rockets/astronauts are not canonical-schema
 * tables in Rails either — the FK test creates and drops them itself — so this
 * mirrors that rather than reaching for the canonical schema.
 */
export async function withRocketTables(
  conn: AbstractAdapter,
  body: () => Promise<void>,
): Promise<void> {
  await conn.createTable("rockets", { force: true }, (t) => {
    t.string("name");
  });
  await conn.createTable("astronauts", { force: true }, (t) => {
    t.string("name");
    t.references("rocket", { type: "bigint" });
    t.references("favorite_rocket");
  });
  try {
    await body();
  } finally {
    await conn.dropTable("astronauts", "rockets", { ifExists: true });
  }
}
