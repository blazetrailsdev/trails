import { Node } from "./node.js";
import type { Table } from "../table.js";
import { Binary } from "./binary.js";

export class JoinSource extends Binary {
  declare left: Node | Table | null;
  declare right: Node[];

  constructor(left: Node | Table | null, right: Node[] = []) {
    super(left, right);
    this.left = left;
    this.right = right;
  }

  isEmpty(): boolean {
    return !this.left && this.right.length === 0;
  }
}
