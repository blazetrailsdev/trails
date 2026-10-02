import type { Ascending } from "./nodes/ascending.js";
import type { Descending } from "./nodes/descending.js";
import type { Node } from "./nodes/node.js";
import { Nodes } from "./namespaces.js";

export interface OrderPredicationsModule {
  asc(): Ascending;
  desc(): Descending;
}

export const OrderPredications: OrderPredicationsModule = {
  asc(this: Node): Ascending {
    return new Nodes.Ascending(this);
  },
  desc(this: Node): Descending {
    return new Nodes.Descending(this);
  },
};
