import { Temporal } from "@blazetrails/activesupport/temporal";
import { Order } from "./models.js";

// Ruby `Time.now` — read through `Date.now()` so the parity runner's frozen
// clock pins it deterministically (Temporal.Now.instant() carries sub-millisecond
// hrtime precision that no clock freeze reaches).
export default Order.where({
  created_at: Temporal.Instant.fromEpochMilliseconds(Date.now()),
});
