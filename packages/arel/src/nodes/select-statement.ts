import { cloneSlot, objectClone } from "../clone-support.js";
import { Node } from "./node.js";
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

  constructor(relation: Node | null = null) {
    super();
    this.cores = [new SelectCore(relation)];
    this.orders = [];
    this.limit = null;
    this.offset = null;
    this.lock = null;
    this.with = null;
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
