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

/** @internal */
export function joinTableName(table1: string, table2: string): string {
  const joined = [String(table1), String(table2)].sort().join("\0");
  const deduped = joined.replace(/^(.*[_.])(.+)\0\1(.+)/, "$1$2_$3");
  return deduped.replaceAll("\0", "_");
}
