import { Base } from "@blazetrails/activerecord";

/** Join record: `follower_id` follows `followee_id`. */
export class Follow extends Base {
  static {
    this.belongsTo("follower", { className: "User" });
    this.belongsTo("followee", { className: "User" });

    this.validates("follower_id", { presence: true });
    this.validates("followee_id", { presence: true });
    // Can't follow the same person twice.
    this.validatesUniqueness("followee_id", { scope: "follower_id" });
  }
}
