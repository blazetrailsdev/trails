import { Node, NodeVisitor } from "./node.js";
import { SqlLiteral } from "./sql-literal.js";
import { Cte } from "./cte.js";

export class TableAlias extends Node {
  readonly relation: Node;
  readonly name: string;

  constructor(relation: Node, name: string) {
    super();
    this.relation = relation;
    this.name = name;
  }

  get(columnName: string): Node {
    return new SqlLiteral(`"${this.name}"."${columnName}"`);
  }

  toCte(): Cte {
    return new Cte(this.name, this.relation);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
