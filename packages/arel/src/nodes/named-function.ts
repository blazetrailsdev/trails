import { Node, NodeVisitor } from "./node.js";
import { As } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";

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

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
