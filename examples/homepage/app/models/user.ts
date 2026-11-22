import { ApplicationRecord } from "./application-record.ts";
export class User extends ApplicationRecord {
  declare email: string;
  static {
    this.hasMany("posts", { foreignKey: "authorId" });
  }
}
