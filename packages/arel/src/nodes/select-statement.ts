import { Node, NodeVisitor } from "./node.js";
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

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
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

/**
 * SelectOptions — the (limit, offset, lock) triple Rails extracts from a
 * SelectStatement so it can be visited as a unit. Trails inlines limit/
 * offset/lock on `SelectStatement` itself, so this node is rarely
 * constructed in normal use; it exists for callers (and for parity with
 * `Arel::Nodes::SelectOptions`) that build one explicitly.
 *
 * Mirrors: Arel::Nodes::SelectOptions
 */
export class SelectOptions extends Node {
  readonly limit: Node | null;
  readonly offset: Node | null;
  readonly lock: Node | null;

  constructor(limit: Node | null = null, offset: Node | null = null, lock: Node | null = null) {
    super();
    this.limit = limit;
    this.offset = offset;
    this.lock = lock;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
