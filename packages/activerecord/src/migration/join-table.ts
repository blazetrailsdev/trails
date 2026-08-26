import { deriveJoinTableName } from "../model-schema.js";

/**
 * JoinTable — helpers for deriving HABTM join table names.
 *
 * Mirrors: ActiveRecord::Migration::JoinTable
 */

/** @internal */
export function findJoinTableName(
  table1: string,
  table2: string,
  options: { tableName?: string } = {},
): string {
  // join_table.rb:7-9 — `options.delete(:table_name)`, which REMOVES the key so
  // the caller can splat the rest straight into create_table/drop_table.
  const tableName = options.tableName;
  delete options.tableName;
  return tableName ?? joinTableName(table1, table2);
}

/**
 * Mirrors: ActiveRecord::Migration::JoinTable#join_table_name
 * (`migration/join_table.rb:11-13`) — delegates to
 * `ModelSchema.derive_join_table_name`.
 *
 * @internal
 */
export function joinTableName(table1: string, table2: string): string {
  return deriveJoinTableName(table1, table2);
}
