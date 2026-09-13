import type { Family } from "./family.js";
import type { User } from "./user.js";
import { Base } from "../../base.js";

export class FamilyTree extends Base {
  declare member: User | null | Promise<User | null>;
  declare family: Family | null | Promise<Family | null>;
  declare family_id: number;
  declare member_id: number;
  declare token: string;

  static {
    this.belongsTo("member", { className: "User", foreignKey: "member_id" });
    this.belongsTo("family");
  }
}
