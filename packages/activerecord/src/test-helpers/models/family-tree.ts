import type { Family } from "./family.js";
import type { User } from "./user.js";
// vendor/rails/activerecord/test/models/family_tree.rb
import { Base } from "../../base.js";

export class FamilyTree extends Base {
  declare member: User | null;
  declare family: Family | null;
  declare loadBelongsTo: ((name: "member") => Promise<User | null>) &
    ((name: "family") => Promise<Family | null>);
  declare family_id: number;
  declare member_id: number;
  declare token: string;

  static {
    this.belongsTo("member", { className: "User", foreignKey: "member_id" });
    this.belongsTo("family");
  }
}
