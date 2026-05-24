import { Base } from "../../../base.js";

export class CpkOrderTag extends Base {
  static _tableName = "cpk_order_tags";

  static {
    this.belongsTo("tag", { className: "CpkTag" });
    this.belongsTo("order", { className: "CpkOrder", primaryKey: "id" });
  }
}
