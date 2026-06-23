// vendor/rails/activerecord/test/models/price_estimate.rb
import { NumberHelper } from "@blazetrails/activesupport";
import { Base } from "../../base.js";

export class PriceEstimate extends Base {
  declare estimateOf: Base | null;
  declare thing: Base | null;
  declare loadBelongsTo: ((name: "estimateOf") => Promise<Base | null>) &
    ((name: "thing") => Promise<Base | null>);
  declare currency: string;
  declare estimate_of_id: number;
  declare estimate_of_type: string;

  static {
    this.belongsTo("estimateOf", { polymorphic: true });
    this.belongsTo("thing", { polymorphic: true });
    this.validates("price", { numericality: true });
  }

  // Rails overrides the `price` reader with `number_to_currency(super)`.
  get price(): string {
    return NumberHelper.numberToCurrency(this.readAttribute("price"));
  }
}
