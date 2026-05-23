// vendor/rails/activerecord/test/models/price_estimate.rb
import { Base } from "../../base.js";

export class PriceEstimate extends Base {
  static {
    this.belongsTo("estimateOf", { polymorphic: true });
    this.belongsTo("thing", { polymorphic: true });
    this.validates("price", { numericality: true });
  }
}
