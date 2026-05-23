// vendor/rails/activerecord/test/models/line_item.rb
import { Base } from "../../base.js";

export class LineItem extends Base {
  static {
    this.belongsTo("invoice", { touch: true });
    this.hasMany("discountApplications", { className: "LineItemDiscountApplication" });
  }
}

export class LineItemDiscountApplication extends Base {
  static {
    this.belongsTo("lineItem");
    this.belongsTo("discount");
  }
}
