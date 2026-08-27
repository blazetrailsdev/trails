import { Node } from "./node.js";
import { _buildQuoted } from "../node-slots.js";
import { ArelError } from "../errors.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class NodeExpression extends Node {
  /** @internal */
  quotedNode(other: unknown): Node {
    if (_buildQuoted) return _buildQuoted(other, this);
    throw new ArelError(
      'NodeExpression.quotedNode called before buildQuoted was registered. Import from "@blazetrails/arel" so Arel package initialization runs and wires node registries.',
    );
  }
}

/**
 * Using `typeof import(...)` inline avoids pulling the mixin modules into
 * this file's static import graph (they transitively depend on node
 * classes that extend NodeExpression), while still giving TypeScript the
 * method-surface signatures via declaration merging.
 * Every mixin here uses its explicit module interface (method-syntax) so
 * subclasses like Function/Grouping/UnaryOperation/Case that override
 * `as`/`asc`/`desc`/`when` with method declarations don't trip the
 * property-vs-method override error.
 *
 * @noRailsEquivalent TypeScript-only mixin typing; Ruby `include` needs no type surface.
 */
type _Predications = import("../predications.js").PredicationsModule;
type _Math = import("../math.js").MathModule;
type _OrderPredications = import("../order-predications.js").OrderPredicationsModule;
type _Expressions = import("../expressions.js").ExpressionsModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface NodeExpression extends _Predications, _Math, _Expressions, _OrderPredications {}
