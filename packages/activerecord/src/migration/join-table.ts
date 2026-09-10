import { _deriveJoinTableName } from "../model-schema-slot.js";

export interface JoinTableHost {
  joinTableName(table1: string, table2: string): string;
}

/** @internal */
export function findJoinTableName(
  this: JoinTableHost,
  table1: string,
  table2: string,
  options: { tableName?: string } = {},
): string {
  const tableName = options.tableName;
  delete options.tableName;
  return tableName ?? this.joinTableName(table1, table2);
}

/** @internal */
export function joinTableName(table1: string, table2: string): string {
  return _deriveJoinTableName!(table1, table2);
}
