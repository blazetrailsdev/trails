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

  clone(): SelectStatement {
    const copy = new SelectStatement();
    copy.cores = this.cores.map((c) => c.clone());
    copy.orders = [...this.orders];
    copy.limit = this.limit;
    copy.offset = this.offset;
    copy.lock = this.lock;
    copy.with = this.with;
    return copy;
  }
}
