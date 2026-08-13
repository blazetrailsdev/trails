import { ApplicationRecord } from "./application-record.js";

export class Tweet extends ApplicationRecord {
  static {
    this.belongsTo("user");
    this.hasMany("likes", { dependent: "destroy" });

    this.validates("body", { presence: true });
  }
}
