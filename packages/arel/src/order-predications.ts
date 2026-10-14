import type { Ascending } from "./nodes/ascending.js";
import type { Descending } from "./nodes/descending.js";
import type { ArelNode } from "./arel.js";
import { Nodes } from "./namespaces.js";

export interface OrderPredicationsModule {
  asc(): Ascending;
  desc(): Descending;
}

export const OrderPredications: OrderPredicationsModule = {
  asc(this: ArelNode): Ascending {
    return new Nodes.Ascending(this);
  },
  desc(this: ArelNode): Descending {
    return new Nodes.Descending(this);
  },
};
