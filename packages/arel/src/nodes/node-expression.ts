import { Node } from "./node.js";
import { _buildQuoted } from "../node-slots.js";
import type { Included } from "@blazetrails/activesupport";

/**
 * NodeExpression — common base for Arel nodes that behave as expressions
 * (attributes, functions, unary ops, etc.). Runtime wiring of the
 * Predications + Math mixins lives in ../index.ts to avoid a module-load
 * cycle between this file and the mixin modules (which reference the
 * concrete node classes that extend NodeExpression).
 *
 * Mirrors: Arel::Nodes::NodeExpression — which `include`s Arel::Expressions,
 *   Arel::Predications, Arel::AliasPredication, Arel::OrderPredications,
 *   and Arel::Math. Trails applies Predications + Math here; asc/desc
 *   (OrderPredications) and `as()` (AliasPredication) live on subclasses
 *   to avoid module-load cycles with `ascending.ts` / `descending.ts` /
 *   `binary.ts` — those files all ultimately depend on NodeExpression.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class NodeExpression extends Node {
  /**
   * Wrap a raw value into a Node for use inside predicates. Delegates to
   * the `buildQuoted` registered by casted.ts, passing the current node
   * as context so subclasses with type-casting semantics can coerce on
   * that basis. (Attribute — which extends Node directly, not this class
   * — implements its own predication methods with explicit type-casting
   * and therefore never reaches this default.)
   *
   * Mirrors: Arel::Predications#quoted_node (private), which calls
   * Nodes.build_quoted(other, self).
   *
   * @internal
   */
  quotedNode(other: unknown): Node {
    if (other instanceof Node) return other;
    if (_buildQuoted) return _buildQuoted(other, this);
    throw new Error(
      'NodeExpression.quotedNode called before buildQuoted was registered. Import from "@blazetrails/arel" so Arel package initialization runs and wires node registries.',
    );
  }
}

/**
 * Using `typeof import(...)` inline avoids pulling the mixin modules into
 * this file's static import graph (they transitively depend on node
 * classes that extend NodeExpression), while still giving TypeScript the
 * method-surface signatures via declaration merging.
 * AliasPredication / OrderPredications use their explicit module interfaces
 * (method-syntax) so subclasses like Function/Grouping/UnaryOperation that
 * override `as`/`asc`/`desc` with method declarations don't trip the
 * property-vs-method override error.
 *
 * @noRailsEquivalent TypeScript-only mixin typing; Ruby `include` needs no type surface.
 */
type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
type _OrderPredications = import("../order-predications.js").OrderPredicationsModule;
type _Expressions = import("../expressions.js").ExpressionsModule;
/**
 * `when` is lifted out of the mapped `Included<>` shape and restated in method
 * syntax for the same reason AliasPredication/OrderPredications use their
 * module interfaces: `Case` overrides it with a method declaration (case.rb:13),
 * and a property-typed base member makes that a TS2425 error.
 */
interface _PredicationsWhen {
  when(right: unknown): import("./case.js").Case;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface NodeExpression
  extends
    Omit<Included<typeof import("../predications.js").Predications>, "when">,
    _PredicationsWhen,
    Included<typeof import("../math.js").Math>,
    _Expressions,
    _AliasPredication,
    _OrderPredications {}
