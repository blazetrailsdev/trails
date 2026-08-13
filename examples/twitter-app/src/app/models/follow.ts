import { ApplicationRecord } from "./application-record.js";

export class Follow extends ApplicationRecord {
  static {
    this.belongsTo("follower", { className: "User" });
    this.belongsTo("followee", { className: "User" });
  }
}
