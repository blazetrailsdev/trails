import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { cloneSlot, objectClone } from "../clone-support.js";
import { Node } from "./node.js";
import type { Table } from "../table.js";

export type InsertSelectSource = Node | { ast: Node; toSql: () => string } | null;

export class InsertStatement extends Node {
  relation: Node | Table | null;
  columns: Node[];
  values: Node | null;
  select: InsertSelectSource;

  constructor(relation: Node | Table | null = null) {
    super();
    this.relation = relation;
    this.columns = [];
    this.values = null;
    this.select = null;
  }

  hash(): number {
    return rbHash([this.relation, this.columns, this.values, this.select]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof InsertStatement &&
      this.constructor === other.constructor &&
      rbEqual(this.relation, other.relation) &&
      rbEqual(this.columns, other.columns) &&
      rbEqual(this.select, other.select) &&
      rbEqual(this.values, other.values)
    );
  }

  clone(): this {
    const copy = objectClone(this);
    copy.columns = [...this.columns];
    if (this.values) copy.values = cloneSlot(this.values);
    if (this.select) copy.select = cloneSlot(this.select);
    return copy;
  }
}
