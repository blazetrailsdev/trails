import { weeks } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Book } from "./models.js";

// `1.week.ago` on the Ruby side. trails' `Time` analogue is Temporal, not JS
// Date (the adapter's `quote` rejects a Date outright), and the Instant is read
// through `Date.now()` so the runner's frozen clock pins it — `Temporal.Now`
// carries sub-millisecond hrtime precision that no clock freeze reaches.
const oneWeekAgo = weeks(1).ago(Temporal.Instant.fromEpochMilliseconds(Date.now()));

export default Book.joins("reviews").where("reviews.created_at > ?", oneWeekAgo);
