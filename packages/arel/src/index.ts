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
export type { ArelEngine } from "./nodes/node.js";
export { ArelError, EmptyJoinError, BindError } from "./errors.js";
export { sql, star, fetchAttribute } from "./arel.js";

import { SqlLiteral } from "./nodes/sql-literal.js";
import { _registerCteFactory } from "./nodes/binary.js";
import { Cte } from "./nodes/cte.js";
import "./nodes/unary.js";
import "./nodes/grouping.js";
import "./nodes/nary.js";
import "./nodes/equality.js";
import "./nodes/in.js";
import "./nodes/casted.js";

_registerCteFactory((name, relation) => new Cte(name, relation));

/**
 * Mix Predications + Math into NodeExpression (so every expression-valued
 * node — Function, Unary, Case, Casted, ...) and into InfixOperation
 * separately (it extends Binary, not NodeExpression). Done here at package
 * init rather than inside node-expression.ts / infix-operation.ts because
 * the mixin modules transitively import those files via their target-node
 * imports, creating a module-load cycle.
 *
 * @noRailsEquivalent ESM load order forces the mixin wiring here; Ruby `include`s in each class body.
 */
import { include } from "@blazetrails/activesupport";
import { Node } from "./nodes/node.js";
import { NodeExpression } from "./nodes/node-expression.js";
import { InfixOperation } from "./nodes/infix-operation.js";
import { Function as FunctionNode } from "./nodes/function.js";
import { Filter as FilterNode } from "./nodes/filter.js";
import { Predications } from "./predications.js";
import { Math as MathMixin } from "./math.js";
import { FactoryMethods } from "./factory-methods.js";
import { Expressions } from "./expressions.js";
import { AliasPredication } from "./alias-predication.js";
import { Table as _TableClass } from "./table.js";
import { OrderPredications } from "./order-predications.js";
import { FilterPredications } from "./filter-predications.js";
import { WindowPredications } from "./window-predications.js";
const _Node = Node as unknown as new (...args: unknown[]) => Node;
const _NodeExpression = NodeExpression as unknown as new (...args: unknown[]) => NodeExpression;
const _TreeManager = TreeManager as unknown as new (...args: unknown[]) => TreeManager;
const _SqlLiteral = SqlLiteral as unknown as new (...args: unknown[]) => SqlLiteral;

type RuntimeModule = Record<string, (...args: unknown[]) => unknown>;
const asRuntime = <T>(m: T): RuntimeModule => m as unknown as RuntimeModule;
include(_Node, asRuntime(FactoryMethods));
const _Table = _TableClass as unknown as new (...args: unknown[]) => object;
include(_Table, asRuntime(FactoryMethods));
include(_Table, asRuntime(AliasPredication));
include(_TreeManager, asRuntime(FactoryMethods));
include(_NodeExpression, Predications);
include(_NodeExpression, MathMixin);
include(_NodeExpression, asRuntime(Expressions));
include(_NodeExpression, asRuntime(AliasPredication));
include(_NodeExpression, asRuntime(OrderPredications));
include(InfixOperation, Predications);
include(InfixOperation, MathMixin);
include(InfixOperation, asRuntime(Expressions));
include(InfixOperation, asRuntime(AliasPredication));
include(InfixOperation, asRuntime(OrderPredications));
include(_SqlLiteral, Predications);
include(_SqlLiteral, asRuntime(Expressions));
include(_SqlLiteral, asRuntime(AliasPredication));
include(_SqlLiteral, asRuntime(OrderPredications));
include(FunctionNode, asRuntime(WindowPredications));
include(FunctionNode, asRuntime(FilterPredications));
include(FilterNode, asRuntime(WindowPredications));
