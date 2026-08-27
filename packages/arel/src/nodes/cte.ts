import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import { Binary } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";
import { Table } from "../table.js";
import type { SelectManager } from "../select-manager.js";

/**
 * Cte — a Common Table Expression node.
 *
 * Mirrors: Arel::Nodes::Cte
 */
export class Cte extends Binary {
  // Mirrors `alias :name :left` / `alias :relation :right` (cte.rb:6-7): these
  // are the Binary slots under another spelling, not fields beside them, so a
  // write through either name is the same write — which is what `Binary#eql`
  // reads (binary.rb:19-27).
  //
  // Rails: `SelectManager#as` builds a `TableAlias` whose name is a
  // `Nodes::SqlLiteral` (rendered bare), so `TableAlias#to_cte` passes that
  // literal straight through to `Cte.new`. A plain-string name (e.g. a directly
  // constructed `Cte`) is quoted. Accept both.
  get name(): string | SqlLiteral {
    return this.left as string | SqlLiteral;
  }

  set name(value: string | SqlLiteral) {
    this.left = value;
  }

  // Rails seats a manager here directly —
  // `Cte.new("foo", Table.new(:bar).project(Arel.star))`
  // (test/cases/arel/visitors/to_sql_test.rb:1008) — and
  // `visit_Arel_SelectManager` (to_sql.rb:358-361) renders it, parens included.
  get relation(): Node | SelectManager {
    return this.right as Node | SelectManager;
  }

  set relation(value: Node | SelectManager) {
    this.right = value;
  }

  readonly materialized: boolean | null;

  constructor(
    name: string | SqlLiteral,
    relation: Node | Table | SelectManager,
    materialized: boolean | null = null,
  ) {
    super(name, relation);
    this.materialized = materialized;
  }

  // Mirrors Arel::Nodes::Cte#hash / #eql? / #== (cte.rb:14-25).
  override hash(): number {
    return rbHash([this.name, this.relation, this.materialized]);
  }

  override eql(other: unknown): boolean {
    return (
      other instanceof Cte &&
      this.constructor === other.constructor &&
      rbEqual(this.name, other.name) &&
      rbEqual(this.relation, other.relation) &&
      rbEqual(this.materialized, other.materialized)
    );
  }

  toCte(): Cte {
    return this;
  }

  toTable(): Table {
    // Rails `Arel::Table.new(name)` passes the name through unchanged, so a
    // `SqlLiteral` name stays a literal and the Table visitor renders it bare
    // (visit_Arel_Table visits a Node name). `Table` types `name` as `string`;
    // a smuggled `SqlLiteral` is cast, matching visit_Arel_Table's convention.
    return new Table(this.name as unknown as string);
  }
}
