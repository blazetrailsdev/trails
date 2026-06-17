import type { User } from "./user.js";
// vendor/rails/activerecord/test/models/room.rb
import { Base } from "../../base.js";

export class Room extends Base {
  declare user: User | null;
  declare owner: User | null;
  declare landlord: User | null;
  declare tenant: User | null;
  declare loadBelongsTo: ((name: "user") => Promise<User | null>) &
    ((name: "owner") => Promise<User | null>) &
    ((name: "landlord") => Promise<User | null>) &
    ((name: "tenant") => Promise<User | null>);
  declare landlord_id: number;
  declare owner_id: number;
  declare tenant_id: number;
  declare user_id: number;

  static {
    this.belongsTo("user");
    this.belongsTo("owner", { className: "User" });

    this.belongsTo("landlord", {
      className: "User",
      dependent: "destroy",
      inverseOf: "letRoom",
    });
    this.belongsTo("tenant", {
      className: "User",
      dependent: "destroy",
      inverseOf: "rentedRoom",
    });
  }
}
