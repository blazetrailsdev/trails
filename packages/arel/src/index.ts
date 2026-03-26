export { Table } from "./table.js";
export * as Nodes from "./nodes/index.js";
export * as Visitors from "./visitors/index.js";
export * as Collectors from "./collectors/index.js";
export { SelectManager } from "./select-manager.js";
export { InsertManager } from "./insert-manager.js";
export { UpdateManager } from "./update-manager.js";
export { DeleteManager } from "./delete-manager.js";
export { TreeManager } from "./tree-manager.js";
export { ArelError, EmptyJoinError, BindError } from "./errors.js";
export { quoteArrayLiteral } from "./quote-array.js";

import { SqlLiteral } from "./nodes/sql-literal.js";

/**
 * Arel.sql() — escape hatch for raw SQL.
 *
 * Mirrors: Arel.sql
 */
export function sql(rawSql: string): SqlLiteral {
  return new SqlLiteral(rawSql);
}

/**
 * Arel.star — represents `*` in a projection.
 *
 * Mirrors: Arel.star
 */
export const star = new SqlLiteral("*");
