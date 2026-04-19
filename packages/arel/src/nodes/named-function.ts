import { Node, NodeVisitor } from "./node.js";
import { Function } from "./function.js";
import { Addition, Subtraction, Multiplication, Division } from "./infix-operation.js";
import { SqlLiteral } from "./sql-literal.js";
import { Over } from "./over.js";
import { NamedWindow, Window } from "./window.js";
import { Grouping } from "./grouping.js";
import { Quoted } from "./casted.js";
import {
  BitwiseAnd,
  BitwiseOr,
  BitwiseXor,
  BitwiseShiftLeft,
  BitwiseShiftRight,
} from "./infix-operation.js";

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

  // -- Math --

  private buildQuoted(other: unknown): Node {
    return other instanceof Node ? other : new Quoted(other);
  }

  add(other: unknown): Grouping {
    return new Grouping(new Addition(this, this.buildQuoted(other)));
  }

  subtract(other: unknown): Grouping {
    return new Grouping(new Subtraction(this, this.buildQuoted(other)));
  }

  multiply(other: unknown): Multiplication {
    return new Multiplication(this, this.buildQuoted(other));
  }

  divide(other: unknown): Division {
    return new Division(this, this.buildQuoted(other));
  }

  bitwiseAnd(other: unknown): Grouping {
    return new Grouping(new BitwiseAnd(this, this.buildQuoted(other)));
  }

  bitwiseOr(other: unknown): Grouping {
    return new Grouping(new BitwiseOr(this, this.buildQuoted(other)));
  }

  bitwiseXor(other: unknown): Grouping {
    return new Grouping(new BitwiseXor(this, this.buildQuoted(other)));
  }

  bitwiseShiftLeft(other: unknown): Grouping {
    return new Grouping(new BitwiseShiftLeft(this, this.buildQuoted(other)));
  }

  bitwiseShiftRight(other: unknown): Grouping {
    return new Grouping(new BitwiseShiftRight(this, this.buildQuoted(other)));
  }
}
