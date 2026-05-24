import { Base } from "../../../base.js";

export class CpkOrderAgreement extends Base {
  static _tableName = "cpk_order_agreements";

  static {
    this.belongsTo("order", { className: "CpkOrder", primaryKey: "id" });
  }
}
