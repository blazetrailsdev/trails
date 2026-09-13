import type { Customer } from "./customer.js";
import { Base } from "../../base.js";

export class Order extends Base {
  declare billing_customer_id: number;
  declare name: string;
  declare shipping_customer_id: number;

  static {
    this.belongsTo("billing", { className: "Customer", foreignKey: "billing_customer_id" });
    this.belongsTo("shipping", { className: "Customer", foreignKey: "shipping_customer_id" });
  }
}
export interface Order {
  get billing(): Customer | null | Promise<Customer | null>;
  set billing(value: Customer | null);
  get shipping(): Customer | null | Promise<Customer | null>;
  set shipping(value: Customer | null);
}
