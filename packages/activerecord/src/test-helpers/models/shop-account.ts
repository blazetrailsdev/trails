// vendor/rails/activerecord/test/models/shop_account.rb
import { Base } from "../../base.js";

export class ShopAccount extends Base {
  static {
    this.belongsTo("customer");
    this.belongsTo("customerCarrier");

    this.hasOne("carrier", { through: "customerCarrier" });
  }
}
