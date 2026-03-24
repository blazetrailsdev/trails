import type { Node } from "./nodes/node.js";

export interface OrderPredications {
  asc(): Node;
  desc(): Node;
}
