import type { Customer } from "./customer.js";
// vendor/rails/activerecord/test/models/order.rb
import { Base } from "../../base.js";

export class Order extends Base {
  declare billing: Customer | null;
  declare shipping: Customer | null;
  declare loadBelongsTo: ((name: "billing") => Promise<Customer | null>) &
    ((name: "shipping") => Promise<Customer | null>);
  declare billing_customer_id: number;
  declare name: string;
  declare shipping_customer_id: number;

  static {
    this.belongsTo("billing", { className: "Customer", foreignKey: "billing_customer_id" });
    this.belongsTo("shipping", { className: "Customer", foreignKey: "shipping_customer_id" });
  }
}
