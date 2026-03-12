import { Node, NodeVisitor } from "./node.js";
import { Table } from "../table.js";

/**
 * Cte — a Common Table Expression node.
 *
 * Mirrors: Arel::Nodes::Cte
 */
export class Cte extends Node {
  readonly name: string;
  readonly relation: Node;
  readonly materialized?: "materialized" | "not_materialized";

  constructor(name: string, relation: Node, materialized?: "materialized" | "not_materialized") {
    super();
    this.name = name;
    this.relation = relation;
    this.materialized = materialized;
  }

  toTable(): Table {
    return new Table(this.name);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
