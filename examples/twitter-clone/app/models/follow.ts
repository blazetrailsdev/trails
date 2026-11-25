import { ApplicationRecord } from "./application-record.ts";

export class Follow extends ApplicationRecord {
  static {
    this.belongsTo("follower", { className: "User" });
    this.belongsTo("followee", { className: "User" });

    this.validates("follower_id", { presence: true });
    this.validates("followee_id", { presence: true });
    this.validatesUniquenessOf("followee_id", { scope: "follower_id" });
  }
}
