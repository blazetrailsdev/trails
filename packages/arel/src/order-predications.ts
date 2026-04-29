import { Ascending } from "./nodes/ascending.js";
import { Descending } from "./nodes/descending.js";
import type { Node } from "./nodes/node.js";

/**
 * OrderPredications — `asc` / `desc` mixin.
 *
 * Mirrors: Arel::OrderPredications (activerecord/lib/arel/order_predications.rb).
 */
export interface OrderPredicationsModule {
  asc(): Ascending;
  desc(): Descending;
}

export const OrderPredications: OrderPredicationsModule = {
  asc(this: Node): Ascending {
    return new Ascending(this);
  },
  desc(this: Node): Descending {
    return new Descending(this);
  },
};
