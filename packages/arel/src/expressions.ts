import type { Node } from "./nodes/node.js";

export interface Expressions {
  count(distinct?: boolean): Node;
  sum(): Node;
  maximum(): Node;
  minimum(): Node;
  average(): Node;
}
