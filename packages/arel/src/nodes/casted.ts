import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { _Attribute, _Table, _setBuildQuoted } from "../node-slots.js";
import { Unary } from "./unary.js";
import type { Attribute } from "../attributes/attribute.js";
import { Attribute as ModelAttribute } from "@blazetrails/activemodel";

/**
 * Arel::Nodes.build_quoted — coerce `other` into a Node suitable for the AST.
 *
 * Rails: pass Arel Nodes / Arel::Attribute / Table / SelectManager /
 * SqlLiteral / ActiveModel::Attribute through unchanged; otherwise wrap
 * in Casted (when an attribute is supplied) or Quoted.
 *
 * TS deviations, all narrower/safer:
 * - Table / SelectManager aren't Arel nodes here, so the SelectManager arm is
 *   matched on its `ast` duck-type rather than by class (importing
 *   `SelectManager` from a node module closes a require cycle) and the Table
 *   arm reads the `_Table` slot for the same reason. Both are returned
 *   unchanged, as Rails does (casted.rb:47-51), so `visit_Arel_SelectManager`
 *   supplies the subquery parens and `visit_Arel_Table` renders the table.
 */
export function buildQuoted(other: unknown, attribute?: unknown): Node {
  if (other instanceof Node) return other;
  if (other && typeof other === "object") {
    if (_Attribute && other instanceof _Attribute) return other as Node;
    if (_Table && other instanceof _Table) return other as Node;
    // Rails: casted.rb:50-51 — the `when ..., ActiveModel::Attribute` arm
    // returning `other` unwrapped. `visit_ActiveModel_Attribute`
    // (to_sql.rb:756) is what lands its value as a bind.
    if (other instanceof ModelAttribute) return other as unknown as Node;
    const maybeAst = (other as { ast?: unknown }).ast;
    if (maybeAst instanceof Node) return other as Node;
  }
  if (_Attribute && attribute instanceof _Attribute)
    return new Casted(other, attribute as Attribute);
  return new Quoted(other);
}

_setBuildQuoted(buildQuoted);

/**
 * Casted — a value bound to a specific attribute for type casting.
 *
 * Mirrors: Arel::Nodes::Casted
 */
export class Casted extends NodeExpression {
  readonly value: unknown;
  readonly attribute: Attribute;

  valueBeforeTypeCast(): unknown {
    return this.value;
  }

  constructor(value: unknown, attribute: Attribute) {
    super();
    this.value = value;
    this.attribute = attribute;
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

  // Mirrors Arel::Nodes::Casted#hash / #eql? / #== (casted.rb:24-34).
  hash(): number {
    return rbHash([this.constructor, this.value, this.attribute]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Casted &&
      this.constructor === other.constructor &&
      rbEqual(this.value, other.value) &&
      rbEqual(this.attribute, other.attribute)
    );
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

  get value(): unknown {
    return this.expr;
  }
}
