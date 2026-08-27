import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { cloneSlot, objectClone } from "../clone-support.js";
import { Node } from "./node.js";
import type { Table } from "../table.js";
import { NodeExpression } from "./node-expression.js";
import { SelectCore } from "./select-core.js";

/**
 * SelectStatement — the full SELECT with cores, order, limit, offset, lock.
 *
 * Mirrors: Arel::Nodes::SelectStatement (select_statement.rb).
 *
 * Comment lives on `SelectCore`, not here — Rails' attr_accessor list is
 * `:limit, :orders, :lock, :offset, :with` and only `SelectCore` carries
 * `:comment`. The visitor emits the comment in `visit_Arel_Nodes_SelectCore`.
 */
export class SelectStatement extends NodeExpression {
  cores: SelectCore[];
  orders: Node[];
  limit: Node | null;
  offset: Node | null;
  lock: Node | null;
  with: Node | null;

  constructor(relation: Node | Table | null = null) {
    super();
    this.cores = [new SelectCore(relation)];
    this.orders = [];
    this.limit = null;
    this.offset = null;
    this.lock = null;
    this.with = null;
  }

  // Mirrors Arel::Nodes::SelectStatement#hash / #eql? / #== (select_statement.rb:24-38).
  hash(): number {
    return rbHash([this.cores, this.orders, this.limit, this.lock, this.offset, this.with]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof SelectStatement &&
      this.constructor === other.constructor &&
      rbEqual(this.cores, other.cores) &&
      rbEqual(this.orders, other.orders) &&
      rbEqual(this.limit, other.limit) &&
      rbEqual(this.lock, other.lock) &&
      rbEqual(this.offset, other.offset) &&
      rbEqual(this.with, other.with)
    );
  }

  // Mirrors Arel::Nodes::SelectStatement#initialize_copy
  // (select_statement.rb:19-23), which Ruby runs for `#clone`.
  clone(): this {
    const copy = objectClone(this);
    copy.cores = this.cores.map((x) => x.clone());
    copy.orders = this.orders.map((x) => cloneSlot(x));
    return copy;
  }
}
