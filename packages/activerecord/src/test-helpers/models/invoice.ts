import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { LineItem } from "./line-item.js";
import type { ShippingLine } from "./shipping-line.js";
import { Base } from "../../base.js";
import { association } from "../../associations.js";

export class Invoice extends Base {
  declare lineItems: AssociationProxy<LineItem>;
  declare shippingLines: AssociationProxy<ShippingLine>;
  declare balance: number;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  static {
    this.hasMany("lineItems", { autosave: true });
    this.hasMany("shippingLines", { autosave: true });
    this.beforeSave(async function (this: any, record?: any) {
      const self = record ?? this;
      const lineItems = await association(self, "lineItems");
      self.balance = lineItems
        .map((i: any) => i.amount)
        .filter((a: any) => a != null)
        .reduce((s: number, a: number) => s + a, 0);
    });
  }
}
