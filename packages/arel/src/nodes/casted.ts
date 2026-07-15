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
 * - ActiveModel::Attribute isn't an Arel node either. Rails has
 *   visit_ActiveModel_Attribute that routes it through add_bind; we
 *   wrap it in BindParam so the value participates in prepared-statement
 *   bind extraction (visitBindParam handles valueForDatabase — both the
 *   method form on QueryAttribute and the getter form on AM Attribute).
 */
export function buildQuoted(other: unknown, attribute?: unknown): Node {
  if (other instanceof Node) return other;
  if (other && typeof other === "object") {
    // Arel::Attributes::Attribute (duck-typed via symbol brand)
    if ((other as Record<symbol, unknown>)[ATTRIBUTE_BRAND] === true) return other as Node;
    // ActiveModel::Attribute duck-type (Rails: casted.rb:50-51 — the
    // `when ..., ActiveModel::Attribute` arm returning `other`).
    // Structural check so buildQuoted doesn't require a runtime import here.
    // valueForDatabase is a getter (not a method) on the TS port; check via 'in'.
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
   * Mirrors: Arel::Nodes::Quoted#infinite? (casted.rb:43-45) — the sign, not a
   * boolean. `Casted` deliberately defines no counterpart (casted.rb:5-35), so
   * `open_ended?(Casted(INFINITY))` is false in Rails and must stay false here.
   */
  isInfinite(): 1 | -1 | false {
    if (this.value === Infinity) return 1;
    if (this.value === -Infinity) return -1;
    return false;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
