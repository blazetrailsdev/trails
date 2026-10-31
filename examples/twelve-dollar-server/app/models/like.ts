import { ApplicationRecord } from "./application-record.ts";

export class Like extends ApplicationRecord {
  static {
    this.primaryKey = ["user_id", "post_id"];

    this.belongsTo("user");
    this.belongsTo("post");
  }
}
