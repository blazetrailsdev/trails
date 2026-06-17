// vendor/rails/activerecord/test/models/numeric_data.rb
import { Base } from "../../base.js";

export class NumericData extends Base {
  declare world_population: bigint;
  declare my_house_population: bigint;
  declare atoms_in_universe: bigint;
  declare bank_balance: number | null;
  declare big_bank_balance: number | null;
  declare decimal_number: number;
  declare decimal_number_big_precision: number | null;
  declare decimal_number_with_default: number | null;
  declare numeric_number: number;
  declare temperature: number;
  declare temperature_with_limit: number | null;
  declare unscaled_bank_balance: number | null;

  static _tableName = "numeric_data";

  static {
    this.attribute("world_population", "big_integer");
    this.attribute("my_house_population", "big_integer");
    this.attribute("atoms_in_universe", "big_integer");
    this.aliasAttribute("newBankBalance", "bank_balance");
  }
}
