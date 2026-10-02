import { rbObjClone, rbModConstSet } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import type { Table } from "../table.js";
import type { ArelNode } from "../arel.js";

export type InsertSelectSource = Node | { ast: Node; toSql: () => string } | null;

export class InsertStatement extends Node {
  relation: ArelNode | Table | null;
  columns: ArelNode[];
  values: ArelNode | null;
  select: InsertSelectSource;

  constructor(relation: ArelNode | Table | null = null) {
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

  initializeCopy(_other: InsertStatement): void {
    this.columns = rbObjClone(this.columns);
    if (this.values != null) this.values = rbObjClone(this.values);
    if (this.select != null) this.select = rbObjClone(this.select);
  }
}

rbModConstSet(Nodes, "InsertStatement", InsertStatement);
