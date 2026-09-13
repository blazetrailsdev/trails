import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Discount } from "./discount.js";
import type { Invoice } from "./invoice.js";
import { Base } from "../../base.js";

export class ShippingLine extends Base {
  declare invoice: Invoice | null;
  declare discountApplications: AssociationProxy<ShippingLineDiscountApplication>;
  declare amount: number;
  declare invoice_id: number;

  static {
    this.belongsTo("invoice", { touch: true });
    this.hasMany("discountApplications", { className: "ShippingLineDiscountApplication" });
  }
}

export class ShippingLineDiscountApplication extends Base {
  declare shippingLine: ShippingLine | null;
  declare discount: Discount | null;
  declare discount_id: number;
  declare shipping_line_id: number;

  static {
    this.belongsTo("shippingLine");
    this.belongsTo("discount");
  }
}
