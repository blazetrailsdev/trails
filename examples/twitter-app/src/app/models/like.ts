import type { Relation } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.js";

export class Like extends ApplicationRecord {
  static {
    this.belongsTo("user");
    // `counterCache` maintains `tweets.likes_count`; `touch` moves the tweet's
    // `updated_at` so a like invalidates any cache keyed on it.
    this.belongsTo("tweet", { counterCache: true, touch: true });

    // One like per user per tweet, enforced above the unique index so the
    // failure arrives as a validation error rather than a constraint violation.
    this.validatesUniqueness("user_id", { scope: "tweet_id" });

    this.scope("recent", (q: Relation<Like>) => q.order({ created_at: "desc" }));
  }
}
