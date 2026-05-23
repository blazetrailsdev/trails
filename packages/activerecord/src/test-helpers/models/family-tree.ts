// vendor/rails/activerecord/test/models/family_tree.rb
import { Base } from "../../base.js";

export class FamilyTree extends Base {
  static {
    this.belongsTo("member", { className: "User", foreignKey: "member_id" });
    this.belongsTo("family");
  }
}
