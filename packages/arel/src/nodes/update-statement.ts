import { objectClone } from "../clone-support.js";
import { Node } from "./node.js";

/**
 * UpdateStatement — UPDATE ... SET ... WHERE ...
 *
 * Mirrors: Arel::Nodes::UpdateStatement
 */
export class UpdateStatement extends Node {
  relation: Node | null;
  values: Node[];
  wheres: Node[];
  orders: Node[];
  groups: Node[];
  havings: Node[];
  limit: Node | null;
  offset: Node | null;
  key: Node | Node[] | null;

  constructor(relation: Node | null = null) {
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

  // Mirrors Arel::Nodes::UpdateStatement#initialize_copy
  // (update_statement.rb:21-25), which Ruby runs for `#clone`.
  clone(): this {
    const copy = objectClone(this);
    copy.wheres = [...this.wheres];
    copy.values = [...this.values];
    return copy;
  }
}
