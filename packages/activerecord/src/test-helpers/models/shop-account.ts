import type { Carrier } from "./carrier.js";
import type { Customer } from "./customer.js";
import type { CustomerCarrier } from "./customer-carrier.js";
import { Base } from "../../base.js";

export class ShopAccount extends Base {
  declare customer: Customer | null | Promise<Customer | null>;
  declare customerCarrier: CustomerCarrier | null | Promise<CustomerCarrier | null>;
  declare carrier: Carrier | null | Promise<Carrier | null>;
  declare customer_carrier_id: number;
  declare customer_id: number;

  static {
    this.belongsTo("customer");
    this.belongsTo("customerCarrier");

    this.hasOne("carrier", { through: "customerCarrier" });
  }
}
