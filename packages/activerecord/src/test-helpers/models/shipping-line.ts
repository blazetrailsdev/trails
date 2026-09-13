import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Discount } from "./discount.js";
import type { Invoice } from "./invoice.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShippingLine extends Base {
  declare discountApplications: AssociationProxy<ShippingLineDiscountApplication>;
  declare amount: number;
  declare invoice_id: number;

  static {
    this.belongsTo("invoice", { touch: true });
    this.hasMany("discountApplications", { className: "ShippingLineDiscountApplication" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShippingLine {
  get invoice(): Invoice | null | Promise<Invoice | null>;
  set invoice(value: Invoice | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShippingLineDiscountApplication extends Base {
  declare discount_id: number;
  declare shipping_line_id: number;

  static {
    this.belongsTo("shippingLine");
    this.belongsTo("discount");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShippingLineDiscountApplication {
  get shippingLine(): ShippingLine | null | Promise<ShippingLine | null>;
  set shippingLine(value: ShippingLine | null);
  get discount(): Discount | null | Promise<Discount | null>;
  set discount(value: Discount | null);
}
