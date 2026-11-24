import { ApplicationRecord } from "./application-record.ts";

export class Like extends ApplicationRecord {
  static {
    this.belongsTo("user");
    this.belongsTo("tweet");
    this.validates("user_id", { presence: true });
    this.validates("tweet_id", { presence: true });
    this.validatesUniquenessOf("user_id", { scope: "tweet_id" });
  }
}
