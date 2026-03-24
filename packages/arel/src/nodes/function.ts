import { Node, NodeVisitor } from "./node.js";
import { SqlLiteral } from "./sql-literal.js";

export class Function extends Node {
  readonly expressions: Node[];
  readonly alias: Node | null;
  distinct: boolean;

  constructor(expressions: Node[], alias: string | null = null) {
    super();
    this.expressions = expressions;
    this.alias = alias ? new SqlLiteral(alias) : null;
    this.distinct = false;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Exists extends Node {
  readonly expressions: Node;
  readonly alias: Node | null;

  constructor(expressions: Node, alias: Node | null = null) {
    super();
    this.expressions = expressions;
    this.alias = alias;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Sum extends Function {}
export class Max extends Function {}
export class Min extends Function {}
export class Avg extends Function {}
