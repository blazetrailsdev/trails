import { Base } from "../../../base.js";

export class CpkTag extends Base {
  static _tableName = "cpk_tags";

  static {
    this.hasMany("orderTags", { className: "CpkOrderTag", foreignKey: "tag_id" });
    this.hasMany("orders", { className: "CpkOrder", through: "orderTags" });
  }
}
