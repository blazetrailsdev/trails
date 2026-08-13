import { ApplicationRecord } from "./application-record.js";

/**
 * A user who can tweet, follow others, and like tweets.
 *
 * Zero-`declare` and zero-`attribute`: column types come from `db/schema.ts`,
 * which `trails-tsc` reads to inject the `declare` members, and at runtime the
 * columns are reflected from the live database. Only associations,
 * validations, and scopes live here — exactly as in a Rails
 * `class User < ApplicationRecord`.
 */
export class User extends ApplicationRecord {
  static {
    this.hasMany("tweets", { dependent: "destroy" });
    this.hasMany("likes", { dependent: "destroy" });

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
  }
}
