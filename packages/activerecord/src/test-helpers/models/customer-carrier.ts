import type { Carrier } from "./carrier.js";
import type { Customer } from "./customer.js";
// vendor/rails/activerecord/test/models/customer_carrier.rb
import { Base } from "../../base.js";

export class CustomerCarrier extends Base {
  declare customer: Customer | null;
  declare carrier: Carrier | null;
  declare loadBelongsTo: ((name: "customer") => Promise<Customer | null>) &
    ((name: "carrier") => Promise<Carrier | null>);
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
