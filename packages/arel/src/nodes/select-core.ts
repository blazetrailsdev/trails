import { cloneSlot, objectClone } from "../clone-support.js";
import { Node } from "./node.js";
import { JoinSource } from "./join-source.js";
import type { OptimizerHints } from "./unary.js";

/**
 * SelectCore — the core of a SELECT statement (projections, from, where, etc.).
 *
 * Mirrors: Arel::Nodes::SelectCore
 */
export class SelectCore extends Node {
  source: JoinSource;
  projections: Node[];
  wheres: Node[];
  groups: Node[];
  havings: Node[];
  windows: Node[];
  setQuantifier: Node | null;
  // Mirrors Rails: `@ctx.optimizer_hints` is an `OptimizerHints` node (or
  // nil) — not a bare array (select_core.rb). Narrowed to the concrete
  // node type so the SQL visitor can rely on the `/*+ … */` formatting.
  optimizerHints: OptimizerHints | null;
  comment: Node | null;

  constructor(relation: Node | null = null) {
    super();
    this.source = new JoinSource(relation);
    this.projections = [];
    this.wheres = [];
    this.groups = [];
    this.havings = [];
    this.windows = [];
    this.setQuantifier = null;
    this.optimizerHints = null;
    this.comment = null;
  }

  get from(): Node | null {
    return this.source.left;
  }

  set from(value: Node | null) {
    this.source.left = value;
  }

  /** Mirrors: `alias :froms :from` (select_core.rb:33). */
  get froms(): Node | null {
    return this.from;
  }

  /** Mirrors: `alias :froms= :from=` (select_core.rb:32). */
  set froms(value: Node | null) {
    this.from = value;
  }

  // Mirrors Arel::Nodes::SelectCore#initialize_copy (select_core.rb:35-43),
  // which Ruby runs for `#clone`.
  clone(): this {
    const copy = objectClone(this);
    if (this.source) copy.source = cloneSlot(this.source);
    copy.projections = [...this.projections];
    copy.wheres = [...this.wheres];
    copy.groups = [...this.groups];
    copy.havings = [...this.havings];
    copy.windows = [...this.windows];
    return copy;
  }
}
