import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import type { Table } from "../table.js";
import { Binary } from "./binary.js";
import type { ArelNode } from "../arel.js";

export class JoinSource extends Binary<ArelNode | Table | null, ArelNode[]> {
  constructor(singleSource: ArelNode | Table | null, joinop: ArelNode[] = []) {
    super(singleSource, joinop);
  }

  isEmpty(): boolean {
    return !this.left && this.right.length === 0;
  }
}

constSet(Nodes, "JoinSource", JoinSource);
