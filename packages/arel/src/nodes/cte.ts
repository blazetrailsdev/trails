import { Node, NodeVisitor } from "./node.js";
import { Binary } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";
import { Table } from "../table.js";

/**
 * Cte — a Common Table Expression node.
 *
 * Mirrors: Arel::Nodes::Cte
 */
export class Cte extends Binary {
  // Rails: `SelectManager#as` builds a `TableAlias` whose name is a
  // `Nodes::SqlLiteral` (rendered bare), so `TableAlias#to_cte` passes that
  // literal straight through to `Cte.new`. A plain-string name (e.g. a directly
  // constructed `Cte`) is quoted. Accept both.
  readonly name: string | SqlLiteral;
  readonly relation: Node;
  readonly materialized: boolean | null;

  constructor(name: string | SqlLiteral, relation: Node, materialized: boolean | null = null) {
    super(name, relation);
    this.name = name;
    this.relation = relation;
    this.materialized = materialized;
  }

  toCte(): Cte {
    return this;
  }

  toTable(): Table {
    // Rails `Arel::Table.new(name)` passes the name through unchanged, so a
    // `SqlLiteral` name stays a literal (cte.rb:31-32): the Table visitor
    // renders it bare and `Table`'s string ops coerce it via `nameString`.
    // `Table` types `name` as `string`; a smuggled `SqlLiteral` is cast,
    // matching visit_Arel_Table's convention.
    return new Table(this.name as unknown as string);
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
