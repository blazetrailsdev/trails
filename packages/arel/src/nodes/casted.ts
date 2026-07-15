import { Node, NodeVisitor } from "./node.js";
import { NodeExpression, registerBuildQuoted } from "./node-expression.js";
import { Unary } from "./unary.js";
import type { Attribute } from "../attributes/attribute.js";
import { ATTRIBUTE_BRAND } from "./binary.js";
import { BindParam } from "./bind-param.js";

/**
 * Arel::Nodes.build_quoted — coerce `other` into a Node suitable for the AST.
 *
 * Rails: pass Arel Nodes / Arel::Attribute / Table / SelectManager /
 * SqlLiteral / ActiveModel::Attribute through unchanged; otherwise wrap
 * in Casted (when an attribute is supplied) or Quoted.
 *
 * TS deviations, all narrower/safer:
 * - Table / SelectManager aren't Arel nodes here and our visitor only
 *   handles them via duck-type in specific contexts (see visitIn). When
 *   their AST is what's wanted, unwrap to the ast node so downstream
 *   visitors always receive a real Node.
 * - ActiveModel::Attribute isn't an Arel node either. Rails passes it
 *   through bare (casted.rb:50); we wrap it in BindParam. This is a
 *   deliberate, behaviorally-equivalent shape difference — see below.
 *
 * ## Why the BindParam wrap is equivalent to Rails' bare pass-through
 *
 * Do not "fix" this as a bug. The two shapes emit identical SQL and record
 * an identical bind payload, because Rails' two visitors converge:
 *
 *     def visit_ActiveModel_Attribute(o, collector)
 *       collector.add_bind(o, &bind_block)         # to_sql.rb:756-758
 *     end
 *
 *     def visit_Arel_Nodes_BindParam(o, collector)
 *       collector.add_bind(o.value, &bind_block)   # to_sql.rb:760-762
 *     end
 *
 * Rails' bare `attr` reaches `add_bind(attr)`; Rails' `BindParam(attr)`
 * reaches `add_bind(o.value)` — which *is* `attr`. Same payload.
 *
 * Trails arrives at the same payload by a different route, so be precise:
 * `visitArelNodesBindParam` (to-sql.ts) pushes the *node*, not `node.value`,
 * because `compile` needs it to render the `?` marker. The unwrap to the
 * attribute happens later, at the two extraction sites —
 * `ToSql#compileWithBinds` and `SubstituteBinds#extractValue`
 * (collectors/substitute-binds.ts), which recurse through `.value`. Net bind
 * payload is the attribute either way, so `type_casted_binds` /
 * prepared-statement paths still see it and call `value_for_database` on it
 * exactly as before.
 *
 * The predicate delegations survive the wrap too: BindParam#isUnboundable
 * (bind-param.ts:50-52) and #isNil (:39-43) forward to the wrapped value,
 * so `IS NULL` collapsing and unboundable-range handling behave the same.
 *
 * We wrap rather than pass through because a bare ActiveModel::Attribute is
 * not a `Node`, and trails' AST is statically typed against `Node` — Ruby
 * duck-types its way past this, TS cannot without widening every node slot.
 * This is the only wrap-site: `Attribute#quotedNode` delegates straight here
 * (`buildQuoted(value, this)`, matching Rails' `Nodes.build_quoted(other,
 * self)`), so the AST shape cannot diverge by call path.
 *
 * `ToSql#visitActiveModelAttribute` is still ported, and a bare attribute that
 * bypasses this function still reaches it. Both of Rails' own pre-emptive
 * `when ... ActiveModel::Attribute` arms are ported and each gets there by its
 * own route:
 * - `visitArelNodesValuesList` (Rails to_sql.rb:109-110 — the `when` arm at
 *   :109, its `visit(value)` at :110) calls `visit` on it,
 *   which resolves via the ActiveModel::Attribute dispatch registration —
 *   trails' analogue of Ruby's name-derived dispatch + ancestors walk;
 * - `visitArelNodesAssignment` (Rails to_sql.rb:632) hands it to
 *   `visitNodeOrValue`, which branches on it before raw-value dispatch.
 * Both are load-bearing: drop either and that arm raises instead of binding.
 */
export function buildQuoted(other: unknown, attribute?: unknown): Node {
  if (other instanceof Node) return other;
  if (other && typeof other === "object") {
    // Arel::Attributes::Attribute (duck-typed via symbol brand)
    if ((other as Record<symbol, unknown>)[ATTRIBUTE_BRAND] === true) return other as Node;
    // ActiveModel::Attribute duck-type (Rails: casted.rb:50-51 — the
    // `when ..., ActiveModel::Attribute` arm returning `other`).
    // valueForDatabase is a getter (not a method) on the TS port; check via 'in'.
    //
    // The "structural so we don't need a runtime import" rationale this used to
    // carry is stale: arel already depends on @blazetrails/activemodel, which
    // does not depend back (no cycle), and visitors/to-sql.ts + visitors/dot.ts
    // already import Attribute from it at runtime. Rails identifies it by class
    // (casted.rb:50), so `instanceof` is the convergent shape — #4880 already
    // moved `Dot` to it. The two structural checks left in arel are this one and
    // to-sql's `isActiveModelAttribute`, which omits the `name` half, so they
    // disagree with each other as well as with Rails. Tracked by story
    // `arel-am-attribute-predicates-diverge-across-sites` — a behaviour change
    // (a duck-typed object stops binding), so not folded in.
    if (
      "valueForDatabase" in (other as Record<string, unknown>) &&
      "name" in (other as Record<string, unknown>)
    )
      return new BindParam(other);
    // SelectManager / TreeManager — expose a Node `ast`; use that so the
    // visitor always receives a real Node.
    const maybeAst = (other as { ast?: unknown }).ast;
    if (maybeAst instanceof Node) return maybeAst;
  }
  if (isAttribute(attribute)) return new Casted(other, attribute as Attribute);
  return new Quoted(other);
}

registerBuildQuoted(buildQuoted);

function isAttribute(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return (value as Record<symbol, unknown>)[ATTRIBUTE_BRAND] === true;
}

/**
 * Casted — a value bound to a specific attribute for type casting.
 *
 * Mirrors: Arel::Nodes::Casted
 */
export class Casted extends NodeExpression {
  readonly value: unknown;
  readonly attribute: Attribute;

  constructor(value: unknown, attribute: Attribute) {
    super();
    this.value = value;
    this.attribute = attribute;
  }

  valueBeforeTypeCast(): unknown {
    return this.value;
  }

  /**
   * Mirrors: Arel::Nodes::Casted#nil? (casted.rb:15) — `value.nil?`.
   *
   * Both of TS' nils count: Ruby has only `nil`, so `undefined` is as much a
   * `nil?` here as `null` is. This is deliberately WIDER than
   * `BindParam#isNil` (bind_param.rb:23-25), which excludes `undefined`
   * because a valueless `new BindParam()` is a trails positional-bind marker
   * rather than a value. A `Casted`/`Quoted` always wraps a value, so that
   * carve-out does not apply.
   */
  isNil(): boolean {
    return this.value === null || this.value === undefined;
  }

  valueForDatabase(): unknown {
    if (this.attribute.isAbleToTypeCast()) {
      return this.attribute.typeCastForDatabase(this.value);
    }
    return this.value;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

/**
 * Quoted — a value that will be quoted/escaped in the output SQL.
 *
 * Mirrors: Arel::Nodes::Quoted (extends Unary; value stored in expr slot)
 */
export class Quoted extends Unary {
  constructor(value: unknown) {
    super(value);
  }

  get value(): unknown {
    return this.expr;
  }

  valueForDatabase(): unknown {
    return this.value;
  }

  valueBeforeTypeCast(): unknown {
    return this.value;
  }

  /**
   * Mirrors: Arel::Nodes::Quoted#nil? (casted.rb:41) — `value.nil?`, defined
   * identically to Casted's; see the note there on why `undefined` counts.
   */
  isNil(): boolean {
    return this.value === null || this.value === undefined;
  }

  /**
   * Mirrors: Arel::Nodes::Quoted#infinite? (casted.rb:43-45) —
   * `value.respond_to?(:infinite?) && value.infinite?`, which yields the sign
   * rather than a boolean (Ruby's `Float#infinite?` returns `1 | -1 | nil`).
   *
   * Duck-typed, not a bare `=== ±Infinity` check: in Ruby anything answering
   * `infinite?` participates, so `Quoted(QueryAttribute(INFINITY))#infinite?`
   * is `1`. `Casted` deliberately defines no counterpart (casted.rb:5-35), so
   * `open_ended?(Casted(INFINITY))` is false in Rails and must stay false here.
   */
  isInfinite(): 1 | -1 | false {
    if (this.value === Infinity) return 1;
    if (this.value === -Infinity) return -1;
    const v = this.value as { isInfinite?: () => 1 | -1 | false } | null | undefined;
    return typeof v?.isInfinite === "function" ? v.isInfinite() : false;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
