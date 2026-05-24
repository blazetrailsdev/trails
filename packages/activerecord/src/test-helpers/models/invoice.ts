// vendor/rails/activerecord/test/models/invoice.rb
import { Base } from "../../base.js";

export class Invoice extends Base {
  static {
    this.hasMany("lineItems", { autosave: true });
    this.hasMany("shippingLines", { autosave: true });
    this.beforeSave(async function (this: any) {
      await this.lineItems.load();
      this.balance = this.lineItems
        .map((i: any) => i.amount)
        .filter((a: any) => a != null)
        .reduce((s: number, a: number) => s + a, 0);
    });
  }
}
