// vendor/rails/activerecord/test/models/numeric_data.rb
import { Base } from "../../base.js";

export class NumericData extends Base {
  static _tableName = "numeric_data";

  static {
    this.attribute("world_population", "big_integer");
    this.attribute("my_house_population", "big_integer");
    this.attribute("atoms_in_universe", "big_integer");
    this.aliasAttribute("newBankBalance", "bank_balance");
  }
}
