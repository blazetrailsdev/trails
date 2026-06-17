import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Discount } from "./discount.js";
import type { Invoice } from "./invoice.js";
// vendor/rails/activerecord/test/models/line_item.rb
import { Base } from "../../base.js";

export class LineItem extends Base {
  declare invoice: Invoice | null;
  declare discountApplications: AssociationProxy<LineItemDiscountApplication>;
  declare loadBelongsTo: (name: "invoice") => Promise<Invoice | null>;
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
  declare loadBelongsTo: ((name: "lineItem") => Promise<LineItem | null>) &
    ((name: "discount") => Promise<Discount | null>);
  declare discount_id: number;
  declare line_item_id: number;

  static {
    this.belongsTo("lineItem");
    this.belongsTo("discount");
  }
}
