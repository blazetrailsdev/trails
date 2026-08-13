import { ApplicationRecord } from "./application-record.js";

export class Like extends ApplicationRecord {
  static {
    this.belongsTo("user");
    this.belongsTo("tweet");
  }
}
