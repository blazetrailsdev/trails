import { Node, NodeVisitor } from "./node.js";
import { As } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";
import { Over, NamedWindow, Window } from "./window.js";

/**
 * NamedFunction — a SQL function call, e.g. COUNT(*), SUM(x).
 *
 * Mirrors: Arel::Nodes::NamedFunction
 */
export class NamedFunction extends Node {
  readonly name: string;
  readonly expressions: Node[];
  readonly distinct: boolean;
  readonly alias: Node | null;

  constructor(name: string, expressions: Node[], aliasName?: string, distinct = false) {
    super();
    this.name = name;
    this.expressions = expressions;
    this.distinct = distinct;
    this.alias = aliasName ? new SqlLiteral(aliasName) : null;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }

  /**
   * Apply a window to this function call.
   *
   * Mirrors: `OVER` support on Arel functions.
   */
  over(window?: Window | NamedWindow | string | null): Over {
    if (!window) return new Over(this, null);
    if (typeof window === "string") return new Over(this, new SqlLiteral(window));
    if (window instanceof NamedWindow) return new Over(this, new SqlLiteral(`"${window.name}"`));
    return new Over(this, window);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
