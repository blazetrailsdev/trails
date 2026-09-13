import type { Carrier } from "./carrier.js";
import type { Customer } from "./customer.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CustomerCarrier extends Base {
  declare carrier_id: number;
  declare customer_id: number;

  static currentCustomer: unknown = null;

  static {
    this.belongsTo("customer");
    this.belongsTo("carrier");

    this.defaultScope((q: any) => {
      if (CustomerCarrier.currentCustomer) {
        return q.where({ customer: CustomerCarrier.currentCustomer });
      }
      return q.all();
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CustomerCarrier {
  get customer(): Customer | null | Promise<Customer | null>;
  set customer(value: Customer | null);
  get carrier(): Carrier | null | Promise<Carrier | null>;
  set carrier(value: Carrier | null);
}
