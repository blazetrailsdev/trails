// vendor/rails/activerecord/test/models/invoice.rb
import { Base } from "../../base.js";
import { association } from "../../associations.js";

export class Invoice extends Base {
  static {
    this.hasMany("lineItems", { autosave: true });
    this.hasMany("shippingLines", { autosave: true });
    this.beforeSave(async function (this: any, record?: any) {
      const self = record ?? this;
      const lineItems = await association(self, "lineItems").toArray();
      self.balance = lineItems
        .map((i: any) => i.amount)
        .filter((a: any) => a != null)
        .reduce((s: number, a: number) => s + a, 0);
    });
  }
}
