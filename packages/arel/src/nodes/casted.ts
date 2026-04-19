import { Node, NodeVisitor } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import type { Attribute } from "../attributes/attribute.js";
import { ATTRIBUTE_BRAND } from "./binary.js";
import { BindParam } from "./bind-param.js";
import { Attribute as AMAttribute } from "@blazetrails/activemodel";

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
    // ActiveModel::Attribute → BindParam (Rails: collector.add_bind).
    if (other instanceof AMAttribute) return new BindParam(other);
    // SelectManager / TreeManager — expose a Node `ast`; use that so the
    // visitor always receives a real Node.
    const maybeAst = (other as { ast?: unknown }).ast;
    if (maybeAst instanceof Node) return maybeAst;
  }
  if (isAttribute(attribute)) return new Casted(other, attribute as Attribute);
  return new Quoted(other);
}

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

  valueForDatabase(): unknown {
    const attr = this.attribute as unknown as {
      caster?: { typeCastForDatabase(v: unknown): unknown };
      isAbleToTypeCast?: () => boolean;
      typeCastForDatabase?: (v: unknown) => unknown;
    };
    if (attr?.caster?.typeCastForDatabase) {
      return attr.caster.typeCastForDatabase(this.value);
    }
    if (attr?.isAbleToTypeCast?.() && attr.typeCastForDatabase) {
      return attr.typeCastForDatabase(this.value);
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
 * Mirrors: Arel::Nodes::Quoted
 */
export class Quoted extends Node {
  readonly value: unknown;

  constructor(value: unknown) {
    super();
    this.value = value;
  }

  valueForDatabase(): unknown {
    return this.value;
  }

  valueBeforeTypeCast(): unknown {
    return this.value;
  }

  isInfinite(): number | null {
    if (this.value === Infinity) return 1;
    if (this.value === -Infinity) return -1;
    return null;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
