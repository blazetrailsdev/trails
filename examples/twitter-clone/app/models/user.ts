import { ApplicationRecord } from "./application-record.ts";

export class User extends ApplicationRecord {
  static {
    this.hasMany("tweets", { dependent: "destroy" });
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
    this.validatesUniquenessOf("handle");
  }
}
