import { ApplicationRecord } from "./application-record.ts";

export class User extends ApplicationRecord {
  static {
    this.hasMany("posts");
    this.hasMany("likes");
  }
}
