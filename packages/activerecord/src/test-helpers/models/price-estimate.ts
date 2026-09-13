import { NumberHelper } from "@blazetrails/activesupport";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class PriceEstimate extends Base {
  declare currency: string;
  declare estimate_of_id: number;
  declare estimate_of_type: string;

  static {
    this.belongsTo("estimateOf", { polymorphic: true });
    this.belongsTo("thing", { polymorphic: true });
    this.validates("price", { numericality: true });
  }

  get price(): unknown {
    return NumberHelper.numberToCurrency(this.readAttribute("price"));
  }
}
export interface PriceEstimate {
  get estimateOf(): Base | null | Promise<Base | null>;
  set estimateOf(value: Base | null);
  get thing(): Base | null | Promise<Base | null>;
  set thing(value: Base | null);
}

registerModel(PriceEstimate);
