import { weeks } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Range } from "@blazetrails/activerecord";
import { Order } from "./models.js";

// Ruby `Time.now`. Built from `Date.now()`, not `Temporal.Now.instant()`:
// only the former is pinned by the runner's frozen clock.
const now = Temporal.Instant.fromEpochMilliseconds(Date.now());
const weekAgo = weeks(1).ago(now);
export default Order.where({ created_at: new Range(weekAgo, now) });
