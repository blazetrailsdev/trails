import { _setNot } from "../node-slots.js";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";

export class Unary extends NodeExpression {
  readonly expr: unknown;

  // Mirrors Rails `alias :value :expr` (unary.rb:7).
  get value(): unknown {
    return this.expr;
  }

  constructor(expr: unknown) {
    super();
    this.expr = expr;
  }
}

export class Offset extends Unary {}
export class Limit extends Unary {}
export class Lock extends Unary {}
export class DistinctOn extends Unary {}
export class Bin extends Unary {}
export class On extends Unary {}

// Mirrors Rails: `Not < Unary` (unary.rb). Inherits Predications/Math/etc.
// from NodeExpression. Field type narrowed to `Node` since callers always
// pass an Arel node.
export class Not extends Unary {
  declare readonly expr: Node;
  constructor(expr: Node) {
    super(expr);
  }
}

// Mirrors Rails: `Lateral < Unary` (unary.rb). The subquery node lives in
// the inherited `expr` slot — Rails' visit_Arel_Nodes_Lateral reads `o.expr`
// (postgresql.rb:66).
export class Lateral extends Unary {
  declare readonly expr: Node;
  constructor(expr: Node) {
    super(expr);
  }
}

// Mirrors Rails: `Cube`, `GroupingElement`, `GroupingSet` and `RollUp` are
// each `Class.new(Unary)` (unary.rb:25-42). Children live in the inherited
// `expr` slot — the visitors read `o.expr` (postgresql.rb:44) and
// `grouping_array_or_grouping_element` branches on `o.expr.is_a? Array`
// (postgresql.rb:88-96), so `expr` keeps whatever the caller passed.
export class GroupingElement extends Unary {}
export class Cube extends Unary {}
export class RollUp extends Unary {}
export class GroupingSet extends Unary {}

/** @deprecated Use RollUp (Rails casing) */
export const Rollup = RollUp;
/** @deprecated Use RollUp (Rails casing) */
export type Rollup = RollUp;

export class Group extends Unary {}
/**
 * Mirrors: `OptimizerHints` (unary.rb:38) — the hint list lives in the
 * inherited `expr` slot, which `visit_Arel_Nodes_OptimizerHints` maps over
 * (to_sql.rb:170-173).
 */
export class OptimizerHints extends Unary {
  declare readonly expr: ReadonlyArray<string | import("./sql-literal.js").SqlLiteral>;
}

_setNot(Not);
