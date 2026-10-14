import { rbObjClone, rbModConstSet } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import type { Table } from "../table.js";
import type { ArelNode } from "../arel.js";

export class UpdateStatement extends Node {
  relation: ArelNode | Table | null;
  values: (ArelNode | string)[];
  wheres: ArelNode[];
  orders: ArelNode[];
  groups: ArelNode[];
  havings: (ArelNode | string)[];
  limit: Node | null;
  offset: Node | null;
  key: ArelNode | ArelNode[] | null;

  constructor(relation: ArelNode | Table | null = null) {
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

  hash(): number {
    return rbHash([
      this.relation,
      this.wheres,
      this.values,
      this.orders,
      this.limit,
      this.offset,
      this.key,
    ]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof UpdateStatement &&
      this.constructor === other.constructor &&
      rbEqual(this.relation, other.relation) &&
      rbEqual(this.wheres, other.wheres) &&
      rbEqual(this.values, other.values) &&
      rbEqual(this.groups, other.groups) &&
      rbEqual(this.havings, other.havings) &&
      rbEqual(this.orders, other.orders) &&
      rbEqual(this.limit, other.limit) &&
      rbEqual(this.offset, other.offset) &&
      rbEqual(this.key, other.key)
    );
  }

  initializeCopy(_other: UpdateStatement): void {
    this.wheres = rbObjClone(this.wheres);
    this.values = rbObjClone(this.values);
  }
}

rbModConstSet(Nodes, "UpdateStatement", UpdateStatement);
