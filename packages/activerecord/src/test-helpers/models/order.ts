// vendor/rails/activerecord/test/models/order.rb
import { Base } from "../../base.js";

export class Order extends Base {
  static {
    this.belongsTo("billing", { className: "Customer", foreignKey: "billing_customer_id" });
    this.belongsTo("shipping", { className: "Customer", foreignKey: "shipping_customer_id" });
  }
}
