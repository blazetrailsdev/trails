import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { cloneSlot, objectClone } from "../clone-support.js";
import { Node } from "./node.js";
import type { Table } from "../table.js";
import { JoinSource } from "./join-source.js";
import type { OptimizerHints } from "./unary.js";

export class SelectCore extends Node {
  source: JoinSource;
  projections: Node[];
  wheres: Node[];
  groups: Node[];
  havings: Node[];
  windows: Node[];
  setQuantifier: Node | null;
  optimizerHints: OptimizerHints | null;
  comment: Node | null;

  constructor(relation: Node | Table | null = null) {
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

  get from(): Node | Table | null {
    return this.source.left;
  }

  set from(value: Node | Table | null) {
    this.source.left = value;
  }

  get froms(): Node | Table | null {
    return this.from;
  }

  set froms(value: Node | null) {
    this.from = value;
  }

  hash(): number {
    return rbHash([
      this.source,
      this.setQuantifier,
      this.projections,
      this.optimizerHints,
      this.wheres,
      this.groups,
      this.havings,
      this.windows,
      this.comment,
    ]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof SelectCore &&
      this.constructor === other.constructor &&
      rbEqual(this.source, other.source) &&
      rbEqual(this.setQuantifier, other.setQuantifier) &&
      rbEqual(this.optimizerHints, other.optimizerHints) &&
      rbEqual(this.projections, other.projections) &&
      rbEqual(this.wheres, other.wheres) &&
      rbEqual(this.groups, other.groups) &&
      rbEqual(this.havings, other.havings) &&
      rbEqual(this.windows, other.windows) &&
      rbEqual(this.comment, other.comment)
    );
  }

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
