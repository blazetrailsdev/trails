import { weeks } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Range } from "@blazetrails/activerecord";
import { Order } from "./models.js";

// Ruby `Time.now` — read through `Date.now()` so the parity runner's frozen
// clock pins it deterministically (Temporal.Now.instant() carries sub-millisecond
// hrtime precision that no clock freeze reaches).
const now = Temporal.Instant.fromEpochMilliseconds(Date.now());
const weekAgo = weeks(1).ago(now);
export default Order.where({ created_at: new Range(weekAgo, now) });
