import { Node, NodeVisitor } from "./node.js";
import { SqlLiteral } from "./sql-literal.js";
import { Quoted } from "./casted.js";
import { As, Binary } from "./binary.js";
import { Unary } from "./unary.js";

function buildQuoted(value: unknown): Node {
  if (value instanceof Node) return value;
  return new Quoted(value);
}

/**
 * Represents a CASE WHEN ... THEN ... ELSE ... END expression.
 *
 * Rails mutates in-place and returns self for chaining.
 *
 * Mirrors: Arel::Nodes::Case
 */
export class Case extends Node {
  readonly case: Node | null;
  readonly conditions: When[];
  default: Else | null;

  constructor(operand?: Node, defaultValue?: Node) {
    super();
    this.case = operand ?? null;
    this.conditions = [];
    this.default = defaultValue ? new Else(defaultValue) : null;
  }

  when(condition: Node | unknown, result?: Node | unknown): this {
    const whenNode = buildQuoted(condition);
    const thenNode = buildQuoted(result === undefined ? null : result);
    this.conditions.push(new When(whenNode, thenNode));
    return this;
  }

  else(result: Node | unknown): this {
    this.default = new Else(buildQuoted(result === undefined ? null : result));
    return this;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }

  clone(): Case {
    const c = new Case(this.case ?? undefined);
    c.conditions.push(...this.conditions);
    c.default = this.default;
    return c;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class When extends Binary {}
export class Else extends Unary {}
