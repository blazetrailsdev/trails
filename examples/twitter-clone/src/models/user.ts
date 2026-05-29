import { Base } from "@blazetrails/activerecord";

/**
 * A user who can tweet, follow others, and like tweets.
 *
 * Zero-declare AND zero-attribute: no `declare` fields, no `this.attribute`
 * calls, no `import type { Tweet }`. Attribute types come from
 * `db/schema-columns.json` (regenerate with `pnpm db:schema:dump`), which
 * `trails-tsc` reads to inject the `declare` members; at runtime the
 * columns are reflected from the live DB (see db.ts). Associations and
 * scopes still come from the runtime macros below. This mirrors a Rails
 * `class User < ApplicationRecord` exactly.
 */
export class User extends Base {
  static {
    this.hasMany("tweets", { dependent: "destroy" });

    // follows where this user is the follower → the people they follow.
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

    // follows where this user is the followee → their followers.
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
    // Uniqueness is DB-aware, so it has its own (AR-only) macro.
    this.validatesUniqueness("handle");
  }
}
