import type { User } from "./user.js";
import { Base } from "../../base.js";

export class Room extends Base {
  declare user: User | null | Promise<User | null>;
  declare owner: User | null | Promise<User | null>;
  declare landlord: User | null | Promise<User | null>;
  declare tenant: User | null | Promise<User | null>;
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
