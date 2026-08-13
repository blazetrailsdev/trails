import type { Relation } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.js";
import { Hashtag } from "./hashtag.js";

/** Every `#word` in a tweet body. */
const HASHTAG_PATTERN = /#(\w+)/g;

export class Tweet extends ApplicationRecord {
  static {
    // `counterCache` keeps `users.tweets_count` in step without a query.
    this.belongsTo("user", { counterCache: true });

    // Self-referential threading: a reply belongs to the tweet it answers,
    // and maintains that tweet's `replies_count`.
    this.belongsTo("replyTo", {
      className: "Tweet",
      foreignKey: "reply_to_id",
      counterCache: "replies_count",
      optional: true,
    });
    this.hasMany("replies", {
      className: "Tweet",
      foreignKey: "reply_to_id",
      dependent: "destroy",
    });

    this.hasMany("likes", { dependent: "destroy" });
    // has_many :through — the users who liked this tweet, via the join model.
    this.hasMany("likers", { through: "likes", source: "user", className: "User" });

    this.hasAndBelongsToMany("hashtags");

    this.enum("visibility", { everyone: 0, followers: 1 });

    this.validates("body", { presence: true });

    this.scope("recent", (q: Relation<Tweet>) => q.order({ created_at: "desc" }));
    this.scope("popular", (q: Relation<Tweet>) => q.order({ likes_count: "desc" }));
    this.scope("roots", (q: Relation<Tweet>) => q.where({ reply_to_id: null }));

    this.beforeValidation(function (this: Tweet) {
      if (this.body != null) this.body = String(this.body).trim();
    });

    // Link the tweet to the hashtags in its body. `afterSave` rather than
    // `afterCreate` so an edited body re-syncs its tags.
    this.afterSave(async function (this: Tweet) {
      await this.syncHashtags();
    });
  }

  /** Parse `#tags` out of the body and replace the join rows. */
  async syncHashtags(): Promise<void> {
    const names = new Set(
      [...String(this.body ?? "").matchAll(HASHTAG_PATTERN)].map((m) => m[1].toLowerCase()),
    );
    const current = await this.hashtags;
    const currentNames = new Set(current.map((h) => String(h.name)));

    // `delete` drops the join row; `destroy` would delete the Hashtag itself.
    for (const h of current) {
      if (!names.has(String(h.name))) await this.hashtags.delete(h);
    }
    for (const name of names) {
      if (currentNames.has(name)) continue;
      await this.hashtags.concat(await Hashtag.findOrCreateByName(name));
    }
  }
}
