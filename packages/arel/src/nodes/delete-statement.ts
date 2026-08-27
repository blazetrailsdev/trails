import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { cloneSlot, objectClone } from "../clone-support.js";
import { Node } from "./node.js";
import type { Table } from "../table.js";

/**
 * DeleteStatement — DELETE FROM ... WHERE ...
 *
 * Mirrors: Arel::Nodes::DeleteStatement
 */
export class DeleteStatement extends Node {
  relation: Node | Table | null;
  wheres: Node[];
  orders: Node[];
  groups: Node[];
  havings: Node[];
  limit: Node | null;
  offset: Node | null;
  key: Node | Node[] | null;

  constructor(relation: Node | Table | null = null, wheres: Node[] = []) {
    super();
    this.relation = relation;
    this.wheres = wheres;
    this.orders = [];
    this.groups = [];
    this.havings = [];
    this.limit = null;
    this.offset = null;
    this.key = null;
  }

  // Mirrors Arel::Nodes::DeleteStatement#hash / #eql? / #== (delete_statement.rb:25-41).
  hash(): number {
    return rbHash([
      this.constructor,
      this.relation,
      this.wheres,
      this.orders,
      this.limit,
      this.offset,
      this.key,
    ]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof DeleteStatement &&
      this.constructor === other.constructor &&
      rbEqual(this.relation, other.relation) &&
      rbEqual(this.wheres, other.wheres) &&
      rbEqual(this.orders, other.orders) &&
      rbEqual(this.groups, other.groups) &&
      rbEqual(this.havings, other.havings) &&
      rbEqual(this.limit, other.limit) &&
      rbEqual(this.offset, other.offset) &&
      rbEqual(this.key, other.key)
    );
  }

  // Mirrors Arel::Nodes::DeleteStatement#initialize_copy
  // (delete_statement.rb:20-24), which Ruby runs for `#clone`.
  clone(): this {
    const copy = objectClone(this);
    if (this.relation) copy.relation = cloneSlot(this.relation);
    if (this.wheres) copy.wheres = [...this.wheres];
    return copy;
  }
}
