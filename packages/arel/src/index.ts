export { Table } from "./table.js";
export * as Nodes from "./nodes/index.js";
export * as Visitors from "./visitors/index.js";
export * as Collectors from "./collectors/index.js";
export { SelectManager } from "./select-manager.js";
export { InsertManager } from "./insert-manager.js";
export { UpdateManager } from "./update-manager.js";
export { DeleteManager } from "./delete-manager.js";
import { TreeManager } from "./tree-manager.js";
export { TreeManager };
export { ArelError, EmptyJoinError, BindError } from "./errors.js";
export { quoteArrayLiteral } from "./quote-array.js";

import { SqlLiteral } from "./nodes/sql-literal.js";
import { registerNodeDeps, setToSqlVisitor } from "./nodes/node.js";
export { setToSqlVisitor };
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
import { Node } from "./nodes/node.js";
import { NodeExpression } from "./nodes/node-expression.js";
import { InfixOperation } from "./nodes/infix-operation.js";
import { Function as FunctionNode } from "./nodes/function.js";
import { Predications } from "./predications.js";
import { Math as MathMixin } from "./math.js";
import { FactoryMethods } from "./factory-methods.js";
import { Expressions } from "./expressions.js";
import { AliasPredication } from "./alias-predication.js";
import { OrderPredications } from "./order-predications.js";
import { FilterPredications } from "./filter-predications.js";
import { WindowPredications } from "./window-predications.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- abstract class coercion for include() */
const _Node = Node as unknown as new (...args: any[]) => Node;
const _NodeExpression = NodeExpression as unknown as new (...args: any[]) => NodeExpression;
const _TreeManager = TreeManager as unknown as new (...args: any[]) => TreeManager;
const _SqlLiteral = SqlLiteral as unknown as new (...args: any[]) => SqlLiteral;
/* eslint-enable @typescript-eslint/no-explicit-any */
// Modules typed as explicit module interfaces (no string index sig) need
// a cast to satisfy include()'s runtime constraint. The cast is type-only
// and runtime semantics are unchanged — include() iterates Object.keys.
type RuntimeModule = Record<string, (...args: unknown[]) => unknown>;
const asRuntime = <T>(m: T): RuntimeModule => m as unknown as RuntimeModule;
include(_Node, asRuntime(FactoryMethods));
include(_TreeManager, asRuntime(FactoryMethods));
// Mirrors Rails: Arel::Nodes::NodeExpression includes Expressions,
// Predications, AliasPredication, OrderPredications, Math.
include(_NodeExpression, Predications);
include(_NodeExpression, MathMixin);
include(_NodeExpression, asRuntime(Expressions));
include(_NodeExpression, asRuntime(AliasPredication));
include(_NodeExpression, asRuntime(OrderPredications));
// InfixOperation extends Binary (not NodeExpression) but includes the
// same surface in Rails.
include(InfixOperation, Predications);
include(InfixOperation, MathMixin);
include(InfixOperation, asRuntime(Expressions));
include(InfixOperation, asRuntime(AliasPredication));
include(InfixOperation, asRuntime(OrderPredications));
// SqlLiteral < String in Rails; includes Expressions, Predications,
// AliasPredication, OrderPredications.
include(_SqlLiteral, Predications);
include(_SqlLiteral, asRuntime(Expressions));
include(_SqlLiteral, asRuntime(AliasPredication));
include(_SqlLiteral, asRuntime(OrderPredications));
// Function includes WindowPredications and FilterPredications.
include(FunctionNode, asRuntime(WindowPredications));
include(FunctionNode, asRuntime(FilterPredications));

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
