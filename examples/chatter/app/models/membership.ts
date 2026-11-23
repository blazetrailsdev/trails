import { ApplicationRecord } from "./application-record.ts";

export class Membership extends ApplicationRecord {
  static {
    this.belongsTo("room");
    this.belongsTo("user");
    this.validates("user_id", { uniqueness: { scope: "room_id" } });
  }
}
