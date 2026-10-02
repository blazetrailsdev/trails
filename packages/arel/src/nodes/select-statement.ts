import { rbObjClone, rbModConstSet } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import type { Table } from "../table.js";
import { NodeExpression } from "./node-expression.js";
import { SelectCore } from "./select-core.js";
import type { ArelNode } from "../arel.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SelectStatement extends NodeExpression {
  cores: SelectCore[];
  orders: ArelNode[];
  limit: Node | null;
  offset: Node | null;
  lock: Node | null;
  with: Node | null;

  constructor(relation: ArelNode | Table | null = null) {
    super();
    this.cores = [new SelectCore(relation)];
    this.orders = [];
    this.limit = null;
    this.offset = null;
    this.lock = null;
    this.with = null;
  }

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

  initializeCopy(_other: SelectStatement): void {
    this.cores = this.cores.map((x) => rbObjClone(x));
    this.orders = this.orders.map((x) => rbObjClone(x));
  }
}

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface SelectStatement extends _AliasPredication {}

rbModConstSet(Nodes, "SelectStatement", SelectStatement);
