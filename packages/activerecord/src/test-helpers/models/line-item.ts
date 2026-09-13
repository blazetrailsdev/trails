import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Discount } from "./discount.js";
import type { Invoice } from "./invoice.js";
import { Base } from "../../base.js";

export class LineItem extends Base {
  declare discountApplications: AssociationProxy<LineItemDiscountApplication>;
  declare amount: number;
  declare invoice_id: number;

  static {
    this.belongsTo("invoice", { touch: true });
    this.hasMany("discountApplications", { className: "LineItemDiscountApplication" });
  }
}
export interface LineItem {
  get invoice(): Invoice | null | Promise<Invoice | null>;
  set invoice(value: Invoice | null);
}

export class LineItemDiscountApplication extends Base {
  declare discount_id: number;
  declare line_item_id: number;

  static {
    this.belongsTo("lineItem");
    this.belongsTo("discount");
  }
}
export interface LineItemDiscountApplication {
  get lineItem(): LineItem | null | Promise<LineItem | null>;
  set lineItem(value: LineItem | null);
  get discount(): Discount | null | Promise<Discount | null>;
  set discount(value: Discount | null);
}
