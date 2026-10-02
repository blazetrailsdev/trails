import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Node } from "./node.js";
import type { Table } from "../table.js";
import { Binary } from "./binary.js";

export class JoinSource extends Binary<Node | Table | null, Node[]> {
  constructor(singleSource: Node | Table | null, joinop: Node[] = []) {
    super(singleSource, joinop);
  }

  isEmpty(): boolean {
    return !this.left && this.right.length === 0;
  }
}

rbModConstSet(Nodes, "JoinSource", JoinSource);
