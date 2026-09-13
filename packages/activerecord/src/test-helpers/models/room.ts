import type { User } from "./user.js";
import { Base } from "../../base.js";

export class Room extends Base {
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
export interface Room {
  get user(): User | null | Promise<User | null>;
  set user(value: User | null);
  get owner(): User | null | Promise<User | null>;
  set owner(value: User | null);
  get landlord(): User | null | Promise<User | null>;
  set landlord(value: User | null);
  get tenant(): User | null | Promise<User | null>;
  set tenant(value: User | null);
}
