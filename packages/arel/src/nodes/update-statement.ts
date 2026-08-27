import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { objectClone } from "../clone-support.js";
import { Node } from "./node.js";
import type { Table } from "../table.js";

/**
 * UpdateStatement — UPDATE ... SET ... WHERE ...
 *
 * Mirrors: Arel::Nodes::UpdateStatement
 */
export class UpdateStatement extends Node {
  relation: Node | Table | null;
  values: Node[];
  wheres: Node[];
  orders: Node[];
  groups: Node[];
  havings: Node[];
  limit: Node | null;
  offset: Node | null;
  key: Node | Node[] | null;

  constructor(relation: Node | Table | null = null) {
    super();
    this.relation = relation;
    this.values = [];
    this.wheres = [];
    this.orders = [];
    this.groups = [];
    this.havings = [];
    this.limit = null;
    this.offset = null;
    this.key = null;
  }

  // Mirrors Arel::Nodes::UpdateStatement#hash / #eql? / #== (update_statement.rb:26-43).
  hash(): number {
    return rbHash([
      this.relation,
      this.wheres,
      this.values,
      this.orders,
      this.limit,
      this.offset,
      this.key,
    ]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof UpdateStatement &&
      this.constructor === other.constructor &&
      rbEqual(this.relation, other.relation) &&
      rbEqual(this.wheres, other.wheres) &&
      rbEqual(this.values, other.values) &&
      rbEqual(this.groups, other.groups) &&
      rbEqual(this.havings, other.havings) &&
      rbEqual(this.orders, other.orders) &&
      rbEqual(this.limit, other.limit) &&
      rbEqual(this.offset, other.offset) &&
      rbEqual(this.key, other.key)
    );
  }

  // Mirrors Arel::Nodes::UpdateStatement#initialize_copy
  // (update_statement.rb:21-25), which Ruby runs for `#clone`.
  clone(): this {
    const copy = objectClone(this);
    copy.wheres = [...this.wheres];
    copy.values = [...this.values];
    return copy;
  }
}
