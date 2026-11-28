import { ApplicationRecord } from "./application-record.ts";

export class Comment extends ApplicationRecord {
  static {
    this.belongsTo("post");
  }
}
