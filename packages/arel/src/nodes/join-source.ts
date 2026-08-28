import { Node } from "./node.js";
import type { Table } from "../table.js";
import { Binary } from "./binary.js";

export class JoinSource extends Binary {
  declare left: Node | Table | null;
  declare right: Node[];

  constructor(singleSource: Node | Table | null, joinop: Node[] = []) {
    super(singleSource, joinop);
    this.left = singleSource;
    this.right = joinop;
  }

  isEmpty(): boolean {
    return !this.left && this.right.length === 0;
  }
}
