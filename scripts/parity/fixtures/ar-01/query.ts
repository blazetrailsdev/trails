import { weeks } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Book } from "./models.js";

// Ruby `1.week.ago`. Built from `Date.now()`, not `Temporal.Now.instant()`:
// only the former is pinned by the runner's frozen clock.
const oneWeekAgo = weeks(1).ago(Temporal.Instant.fromEpochMilliseconds(Date.now()));

export default Book.joins("reviews").where("reviews.created_at > ?", oneWeekAgo);
