import type { Carrier } from "./carrier.js";
import type { Customer } from "./customer.js";
import type { CustomerCarrier } from "./customer-carrier.js";
// vendor/rails/activerecord/test/models/shop_account.rb
import { Base } from "../../base.js";

export class ShopAccount extends Base {
  declare customer: Customer | null;
  declare customerCarrier: CustomerCarrier | null;
  declare carrier: Carrier | null;
  declare loadBelongsTo: ((name: "customer") => Promise<Customer | null>) &
    ((name: "customerCarrier") => Promise<CustomerCarrier | null>);
  declare loadHasOne: (name: "carrier") => Promise<Carrier | null>;
  declare customer_carrier_id: number;
  declare customer_id: number;

  static {
    this.belongsTo("customer");
    this.belongsTo("customerCarrier");

    this.hasOne("carrier", { through: "customerCarrier" });
  }
}
