// vendor/rails/activerecord/test/models/customer_carrier.rb
import { Base } from "../../base.js";

export class CustomerCarrier extends Base {
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
