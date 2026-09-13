import type { Family } from "./family.js";
import type { User } from "./user.js";
import { Base } from "../../base.js";

export class FamilyTree extends Base {
  declare family_id: number;
  declare member_id: number;
  declare token: string;

  static {
    this.belongsTo("member", { className: "User", foreignKey: "member_id" });
    this.belongsTo("family");
  }
}
export interface FamilyTree {
  get member(): User | null | Promise<User | null>;
  set member(value: User | null);
  get family(): Family | null | Promise<Family | null>;
  set family(value: Family | null);
}
