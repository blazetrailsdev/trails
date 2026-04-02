import { Node, NodeVisitor } from "./node.js";
import { SqlLiteral } from "./sql-literal.js";
import { As, Binary } from "./binary.js";
import { Unary } from "./unary.js";

/** Writable view of Case for internal mutation during construction. */
type MutableCase = Case & {
  conditions: Array<{ when: Node; then: Node }>;
  default: Node | null;
};

/**
 * Represents a CASE WHEN ... THEN ... ELSE ... END expression.
 *
 * Mirrors: Arel::Nodes::Case
 */
export class Case extends Node {
  readonly case: Node | null;
  readonly conditions: Array<{ when: Node; then: Node }>;
  readonly default: Node | null;

  constructor(operand?: Node, defaultValue?: Node) {
    super();
    this.case = operand ?? null;
    this.conditions = [];
    this.default = defaultValue ?? null;
  }

  when(condition: Node | unknown, result?: Node | unknown): Case {
    const c = new Case(this.case ?? undefined) as MutableCase;
    c.conditions = [...this.conditions];
    const whenNode = condition instanceof Node ? condition : new SqlLiteral(String(condition));
    const thenNode =
      result instanceof Node
        ? result
        : new SqlLiteral(
            result === null
              ? "NULL"
              : typeof result === "number"
                ? String(result)
                : typeof result === "string"
                  ? `'${result.replace(/'/g, "''")}'`
                  : String(result),
          );
    c.conditions.push({ when: whenNode, then: thenNode });
    c.default = this.default;
    return c;
  }

  else(result: Node | unknown): Case {
    const c = new Case(this.case ?? undefined) as MutableCase;
    c.conditions = [...this.conditions];
    const elseNode =
      result instanceof Node
        ? result
        : new SqlLiteral(
            result === null
              ? "NULL"
              : typeof result === "number"
                ? String(result)
                : typeof result === "string"
                  ? `'${result.replace(/'/g, "''")}'`
                  : String(result),
          );
    c.default = elseNode;
    return c;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }

  clone(): Case {
    const c = new Case(this.case ?? undefined) as MutableCase;
    c.conditions = [...this.conditions];
    c.default = this.default;
    return c;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class When extends Binary {}
export class Else extends Unary {}
