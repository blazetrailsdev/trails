import { ActiveRecord } from "../namespaces.js";

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
  return ActiveRecord.ModelSchema.deriveJoinTableName(table1, table2);
}
