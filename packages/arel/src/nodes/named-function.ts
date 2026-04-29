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
   * Apply a window to this function call. Property-form override (vs.
   * `over(...) {}`) — the inherited WindowPredications.over is mixed
   * into Function as a property via Included<>, and NamedFunction's
   * version widens the signature to accept Window/NamedWindow/string.
   *
   * Mirrors: `OVER` support on Arel functions.
   */
  over = (window?: Window | NamedWindow | string | null): Over => {
    if (!window) return new Over(this, null);
    if (typeof window === "string") return new Over(this, new SqlLiteral(window));
    if (window instanceof NamedWindow) {
      // Match the identifier-quoting policy used elsewhere in ToSql:
      // double up embedded quotes so a name like `w"x` doesn't escape
      // the identifier and produce malformed (or injectable) SQL.
      const escaped = window.name.replace(/"/g, '""');
      return new Over(this, new SqlLiteral(`"${escaped}"`));
    }
    return new Over(this, window);
  };

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
