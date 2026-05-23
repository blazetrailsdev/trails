// vendor/rails/activerecord/test/models/shipping_line.rb
import { Base } from "../../base.js";

export class ShippingLine extends Base {
  static {
    this.belongsTo("invoice", { touch: true });
    this.hasMany("discountApplications", { className: "ShippingLineDiscountApplication" });
  }
}

export class ShippingLineDiscountApplication extends Base {
  static {
    this.belongsTo("shippingLine");
    this.belongsTo("discount");
  }
}
