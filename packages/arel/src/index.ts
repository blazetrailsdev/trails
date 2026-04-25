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
import { registerNodeDeps } from "./nodes/node.js";
import { Not } from "./nodes/unary.js";
import { Grouping } from "./nodes/grouping.js";
import { Or } from "./nodes/or.js";
import { And } from "./nodes/and.js";
import { ToSql } from "./visitors/to-sql.js";
import { registerBinaryInversions, _registerCteFactory } from "./nodes/binary.js";
import { Equality } from "./nodes/equality.js";
import { In } from "./nodes/in.js";
import { Cte } from "./nodes/cte.js";

registerNodeDeps({ Not, Grouping, Or, And, ToSql });
registerBinaryInversions({ Equality, In });
_registerCteFactory((name, relation) => new Cte(name, relation));

// Mix Predications + Math into NodeExpression (so every expression-valued
// node — Function, Unary, Case, Casted, ...) and into InfixOperation
// separately (it extends Binary, not NodeExpression). Done here at package
// init rather than inside node-expression.ts / infix-operation.ts because
// the mixin modules transitively import those files via their target-node
// imports, creating a module-load cycle.
import { include } from "@blazetrails/activesupport";
import { NodeExpression } from "./nodes/node-expression.js";
import { InfixOperation } from "./nodes/infix-operation.js";
import { Predications } from "./predications.js";
import { Math as MathMixin } from "./math.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- abstract class coercion for include() */
const _NodeExpression = NodeExpression as unknown as new (...args: any[]) => NodeExpression;
/* eslint-enable @typescript-eslint/no-explicit-any */
include(_NodeExpression, Predications);
include(_NodeExpression, MathMixin);
include(InfixOperation, Predications);
include(InfixOperation, MathMixin);

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
