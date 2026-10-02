import { atWithoutCoercion } from "@blazetrails/activesupport/core-ext/time/calculations";
import { Order } from "./models.js";

// Ruby `Time.now`. Built from `Date.now()`, not `Temporal.Now.instant()`:
// only the former is pinned by the runner's frozen clock.
export default Order.where({
  created_at: atWithoutCoercion(Date.now() / 1000),
});
