import { ApplicationRecord } from "./application-record.ts";

export class Post extends ApplicationRecord {
  static {
    this.hasMany("comments");
  }
}
