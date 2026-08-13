import type { Relation } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.js";

/**
 * A user who can tweet, follow others, and like tweets.
 *
 * Zero-`declare` and zero-`attribute`: column types come from `db/schema.ts`,
 * which `trails-tsc` reads to inject the `declare` members, and at runtime the
 * columns are reflected from the live database. Only associations,
 * validations, scopes, and callbacks live here — exactly as in a Rails
 * `class User < ApplicationRecord`.
 */
export class User extends ApplicationRecord {
  static {
    this.hasMany("tweets", { dependent: "destroy" });
    this.hasMany("likes", { dependent: "destroy" });
    // has_many :through — the tweets this user has liked, via the join model.
    this.hasMany("likedTweets", { through: "likes", source: "tweet", className: "Tweet" });

    // Follows where this user is the follower → the people they follow.
    this.hasMany("activeFollows", {
      className: "Follow",
      foreignKey: "follower_id",
      dependent: "destroy",
    });
    this.hasMany("following", {
      through: "activeFollows",
      source: "followee",
      className: "User",
    });

    // Follows where this user is the followee → their followers.
    this.hasMany("passiveFollows", {
      className: "Follow",
      foreignKey: "followee_id",
      dependent: "destroy",
    });
    this.hasMany("followers", {
      through: "passiveFollows",
      source: "follower",
      className: "User",
    });

    this.validates("handle", { presence: true });
    this.validates("display_name", { presence: true });
    this.validatesUniqueness("handle");

    this.scope("chatty", (q: Relation<User>) => q.order({ tweets_count: "desc" }));
    this.scope("alphabetical", (q: Relation<User>) => q.order({ handle: "asc" }));

    // Handles are compared case-insensitively and stored without the sigil,
    // so `@Ada`, `Ada`, and `ada` all name the same account.
    this.beforeValidation(function (this: User) {
      if (this.handle != null) {
        this.handle = String(this.handle).trim().replace(/^@/, "").toLowerCase();
      }
      if (this.display_name != null) this.display_name = String(this.display_name).trim();
    });
  }
}
