import type { Node } from "./nodes/node.js";
import type { SqlLiteral } from "./nodes/sql-literal.js";
import type { BoundSqlLiteral } from "./nodes/bound-sql-literal.js";
import type { InsertManager } from "./insert-manager.js";
import type { UpdateManager } from "./update-manager.js";
import type { DeleteManager } from "./delete-manager.js";

export type UpdateValues = [Node, unknown][] | string | SqlLiteral | BoundSqlLiteral;

/**
 * Crud — mixed into query-like managers to build CRUD statements.
 *
 * Mirrors: Arel::Crud
 */
export interface Crud {
  compileInsert(values: [Node, unknown][]): InsertManager;
  createInsert(): InsertManager;
  compileUpdate(
    values: UpdateValues,
    key?: Node | null,
    havingClause?: Node | null,
    groupValuesColumns?: Node[],
  ): UpdateManager;
  compileDelete(
    key?: Node | null,
    havingClause?: Node | null,
    groupValuesColumns?: Node[],
  ): DeleteManager;
}
