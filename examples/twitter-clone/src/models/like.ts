import { Base } from "@blazetrails/activerecord";

export class Like extends Base {
  static {
    this.belongsTo("user");
    this.belongsTo("tweet");

    // Presence is required so a like can't be persisted without both FKs —
    // also makes the scoped unique index effective (SQLite allows multiple
    // NULLs in a unique index). Mirrors the Follow join model.
    this.validates("user_id", { presence: true });
    this.validates("tweet_id", { presence: true });
    // A user can like a given tweet at most once.
    this.validatesUniqueness("user_id", { scope: "tweet_id" });
  }
}
