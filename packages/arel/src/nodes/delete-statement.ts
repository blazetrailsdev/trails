import { rbObjClone, rbModConstSet } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import type { Table } from "../table.js";
import type { ArelNode } from "../arel.js";

export class DeleteStatement extends Node {
  relation: ArelNode | Table | null;
  wheres: ArelNode[];
  orders: ArelNode[];
  groups: ArelNode[];
  havings: ArelNode[];
  limit: Node | null;
  offset: Node | null;
  key: ArelNode | ArelNode[] | null;

  constructor(relation: ArelNode | Table | null = null, wheres: ArelNode[] = []) {
    super();
    this.relation = relation;
    this.wheres = wheres;
    this.orders = [];
    this.groups = [];
    this.havings = [];
    this.limit = null;
    this.offset = null;
    this.key = null;
  }

  hash(): number {
    return rbHash([
      this.constructor,
      this.relation,
      this.wheres,
      this.orders,
      this.limit,
      this.offset,
      this.key,
    ]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof DeleteStatement &&
      this.constructor === other.constructor &&
      rbEqual(this.relation, other.relation) &&
      rbEqual(this.wheres, other.wheres) &&
      rbEqual(this.orders, other.orders) &&
      rbEqual(this.groups, other.groups) &&
      rbEqual(this.havings, other.havings) &&
      rbEqual(this.limit, other.limit) &&
      rbEqual(this.offset, other.offset) &&
      rbEqual(this.key, other.key)
    );
  }

  initializeCopy(_other: DeleteStatement): void {
    if (this.relation != null) this.relation = rbObjClone(this.relation);
    if (this.wheres != null) this.wheres = rbObjClone(this.wheres);
  }
}

rbModConstSet(Nodes, "DeleteStatement", DeleteStatement);
