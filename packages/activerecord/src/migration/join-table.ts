import { deriveJoinTableName } from "../model-schema.js";

/** @internal */
export function findJoinTableName(
  table1: string,
  table2: string,
  options: { tableName?: string } = {},
): string {
  const tableName = options.tableName;
  delete options.tableName;
  return tableName ?? joinTableName(table1, table2);
}

/** @internal */
export function joinTableName(table1: string, table2: string): string {
  return deriveJoinTableName(table1, table2);
}
