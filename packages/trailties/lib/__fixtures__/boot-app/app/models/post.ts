import { ApplicationRecord } from "./application-record.js";

export class Post extends ApplicationRecord {
  static {
    this.hasMany("comments");
  }
}
