// vendor/rails/activerecord/test/models/tuning_peg.rb
import { Base } from "../../base.js";

export class TuningPeg extends Base {
  static {
    this.belongsTo("guitar");
    this.validatesNumericalityOf("pitch");
  }
}
