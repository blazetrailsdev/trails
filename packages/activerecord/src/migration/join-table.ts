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
  return options.tableName ?? joinTableName(table1, table2);
}

/**
 * Rails' `join_table_name` delegates: `ModelSchema.derive_join_table_name(...)`
 * (join_table.rb:12). This port deliberately keeps its own copy of those three
 * lines instead. This module is a leaf — nothing else imports — and adding the
 * `model-schema.js` edge pulls that module's whole transitive graph in wherever
 * join-table is first imported, which reorders initialization enough that
 * `base.ts`'s top-level `extend(Base, { belongsTo: _Associations.belongsTo })`
 * runs against an uninitialized binding. `scripts/test-deps/adapter-graph-import-tdz.test.ts`
 * guards exactly that. `model-schema.ts#deriveJoinTableName` is the canonical
 * definition and stays byte-identical to this one.
 *
 * @internal
 */
export function joinTableName(table1: string, table2: string): string {
  const joined = [String(table1), String(table2)].sort().join("\0");
  const deduped = joined.replace(/^(.*[_.])(.+)\0\1(.+)/, "$1$2_$3");
  return deduped.replaceAll("\0", "_");
}
