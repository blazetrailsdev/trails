import { Node, NodeVisitor } from "./node.js";
import { Binary } from "./binary.js";
import { Table } from "../table.js";

/**
 * Cte — a Common Table Expression node.
 *
 * Mirrors: Arel::Nodes::Cte
 */
export class Cte extends Binary {
  readonly name: string;
  readonly relation: Node;
  readonly materialized: boolean | null;

  constructor(name: string, relation: Node, materialized: boolean | null = null) {
    super(name, relation);
    this.name = name;
    this.relation = relation;
    this.materialized = materialized;
  }

  toCte(): Cte {
    return this;
  }

  toTable(): Table {
    return new Table(this.name);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
