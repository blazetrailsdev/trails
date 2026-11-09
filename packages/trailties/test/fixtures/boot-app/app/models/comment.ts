import { ApplicationRecord } from "./application-record.js";

export class Comment extends ApplicationRecord {
  static {
    this.belongsTo("post");
  }
}
