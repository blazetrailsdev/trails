import { Node, NodeVisitor } from "./node.js";
import { SqlLiteral } from "./sql-literal.js";
import { As } from "./binary.js";

/**
 * Represents a CASE WHEN ... THEN ... ELSE ... END expression.
 *
 * Mirrors: Arel::Nodes::Case
 */
export class Case extends Node {
  readonly operand: Node | null;
  readonly conditions: Array<{ when: Node; then: Node }>;
  readonly defaultValue: Node | null;

  constructor(operand?: Node) {
    super();
    this.operand = operand ?? null;
    this.conditions = [];
    this.defaultValue = null;
  }

  when(condition: Node | unknown, result?: Node | unknown): Case {
    const c = new Case(this.operand ?? undefined);
    (c as any).conditions = [...this.conditions];
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
    (c as any).defaultValue = this.defaultValue;
    return c;
  }

  else(result: Node | unknown): Case {
    const c = new Case(this.operand ?? undefined);
    (c as any).conditions = [...this.conditions];
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
    (c as any).defaultValue = elseNode;
    return c;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
