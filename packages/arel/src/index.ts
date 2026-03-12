export { Table } from "./table.js";
export * as Nodes from "./nodes/index.js";
export * as Visitors from "./visitors/index.js";
export * as Collectors from "./collectors/index.js";
export { SelectManager, InsertManager, UpdateManager, DeleteManager } from "./managers/index.js";

import { SqlLiteral } from "./nodes/sql-literal.js";
import { NamedFunction } from "./nodes/named-function.js";
import { Node } from "./nodes/node.js";

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
