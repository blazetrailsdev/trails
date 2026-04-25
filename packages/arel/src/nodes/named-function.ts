import { Node, NodeVisitor } from "./node.js";
import { Function } from "./function.js";
import { SqlLiteral } from "./sql-literal.js";
import { Over } from "./over.js";
import { NamedWindow, Window } from "./window.js";

/**
 * NamedFunction — a SQL function call, e.g. COUNT(*), SUM(x).
 *
 * Mirrors: Arel::Nodes::NamedFunction
 */
export class NamedFunction extends Function {
  readonly name: string;

  constructor(name: string, expressions: Node[], aliasName?: string, distinct = false) {
    super(expressions, aliasName ?? null);
    this.name = name;
    this.distinct = distinct;
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
