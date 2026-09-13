import type { Carrier } from "./carrier.js";
import type { Customer } from "./customer.js";
import type { CustomerCarrier } from "./customer-carrier.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShopAccount extends Base {
  declare customer_carrier_id: number;
  declare customer_id: number;

  static {
    this.belongsTo("customer");
    this.belongsTo("customerCarrier");

    this.hasOne("carrier", { through: "customerCarrier" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShopAccount {
  get customer(): Customer | null | Promise<Customer | null>;
  set customer(value: Customer | null);
  get customerCarrier(): CustomerCarrier | null | Promise<CustomerCarrier | null>;
  set customerCarrier(value: CustomerCarrier | null);
  get carrier(): Carrier | null | Promise<Carrier | null>;
  set carrier(value: Carrier | null);
}
