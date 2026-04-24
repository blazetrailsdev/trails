import { Book } from "./models.js";

// `1.week.ago` on the Ruby side → `new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)`
// here. Both runners install the same frozen clock before evaluating the
// fixture, so `now` is identical on both sides and subtraction is deterministic.
const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

export default Book.joins("reviews").where("reviews.created_at > ?", oneWeekAgo);
