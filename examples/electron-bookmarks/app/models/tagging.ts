import { ApplicationRecord } from "./application-record.ts";

export class Tagging extends ApplicationRecord {
  static {
    this.belongsTo("bookmark");
    this.belongsTo("tag");
  }
}
