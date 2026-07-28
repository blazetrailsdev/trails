/**
 * No Rails counterpart file: `ActiveRecord::Migration::ForeignKeyTest` creates
 * and drops `rockets` / `astronauts` inline
 * (`test/cases/migration/foreign_key_test.rb:179-195`). Two trails test files
 * need the same tables, so the helper is shared rather than duplicated, and
 * lives in `support/` with its invented name (RFC 0064 bucket C rule) instead
 * of being inlined into one of them.
 */
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { Base } from "../index.js";

/** Rails' `@connection = ActiveRecord::Base.lease_connection`. */
export async function ambientConnection(): Promise<AbstractAdapter> {
  return (await Base.leaseConnection()) as unknown as AbstractAdapter;
}

/**
 * `ActiveRecord::Migration::ForeignKeyTest`'s setup/teardown,
 * foreign_key_test.rb:179-195. rockets/astronauts are not canonical-schema
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

/**
 * `ActiveRecord::Migration::CompositeForeignKeyTest`'s setup/teardown,
 * foreign_key_test.rb:827-842. Same table names as `withRocketTables` but a
 * composite primary key on `rockets` and the matching pair of integer FK
 * columns on `astronauts`.
 */
export async function withCompositeRocketTables(
  conn: AbstractAdapter,
  body: () => Promise<void>,
): Promise<void> {
  await conn.createTable("rockets", { primaryKey: ["tenant_id", "id"], force: true }, (t) => {
    t.integer("tenant_id");
    t.integer("id");
  });
  await conn.createTable("astronauts", { force: true }, (t) => {
    t.integer("rocket_id");
    t.integer("rocket_tenant_id");
  });
  try {
    await body();
  } finally {
    await conn.dropTable("astronauts", { ifExists: true });
    await conn.dropTable("rockets", { ifExists: true });
  }
}
