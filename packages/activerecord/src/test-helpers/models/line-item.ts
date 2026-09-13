import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Discount } from "./discount.js";
import type { Invoice } from "./invoice.js";
import { Base } from "../../base.js";

export class LineItem extends Base {
  declare invoice: Invoice | null;
  declare discountApplications: AssociationProxy<LineItemDiscountApplication>;
  declare amount: number;
  declare invoice_id: number;

  static {
    this.belongsTo("invoice", { touch: true });
    this.hasMany("discountApplications", { className: "LineItemDiscountApplication" });
  }
}

export class LineItemDiscountApplication extends Base {
  declare lineItem: LineItem | null;
  declare discount: Discount | null;
  declare discount_id: number;
  declare line_item_id: number;

  static {
    this.belongsTo("lineItem");
    this.belongsTo("discount");
  }
}
