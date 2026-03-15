import { Node, NodeVisitor } from "./node.js";
import { SqlLiteral } from "./sql-literal.js";
import { As } from "./binary.js";

/** Writable view of Case for internal mutation during construction. */
type MutableCase = Case & {
  conditions: Array<{ when: Node; then: Node }>;
  defaultValue: Node | null;
};

/**
 * Represents a CASE WHEN ... THEN ... ELSE ... END expression.
 *
 * Mirrors: Arel::Nodes::Case
 */
export class Case extends Node {
  readonly operand: Node | null;
  readonly conditions: Array<{ when: Node; then: Node }>;
  readonly defaultValue: Node | null;

  constructor(operand?: Node, defaultValue?: Node) {
    super();
    this.operand = operand ?? null;
    this.conditions = [];
    this.defaultValue = defaultValue ?? null;
  }

  when(condition: Node | unknown, result?: Node | unknown): Case {
    const c = new Case(this.operand ?? undefined) as MutableCase;
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
    c.defaultValue = this.defaultValue;
    return c;
  }

  else(result: Node | unknown): Case {
    const c = new Case(this.operand ?? undefined) as MutableCase;
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
    c.defaultValue = elseNode;
    return c;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }

  clone(): Case {
    const c = new Case(this.operand ?? undefined) as MutableCase;
    c.conditions = [...this.conditions];
    c.defaultValue = this.defaultValue;
    return c;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
