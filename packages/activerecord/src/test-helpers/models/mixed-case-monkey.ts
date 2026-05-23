// vendor/rails/activerecord/test/models/mixed_case_monkey.rb
import { Base } from "../../base.js";

export class MixedCaseMonkey extends Base {
  static {
    this.belongsTo("human");
  }
}
