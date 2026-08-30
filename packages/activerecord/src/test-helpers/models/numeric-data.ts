import { BigDecimal } from "@blazetrails/activesupport";
import { Base } from "../../base.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- a generated attribute accessor's reader and writer types differ (CLAUDE.md, "Generated attribute readers are properties"); a class body cannot hold a bodiless accessor, so the pair lives in an interface that merges with the class. */
export interface NumericData {
  get bank_balance(): BigDecimal | null;
  set bank_balance(value: unknown);
  get temperature(): BigDecimal | null;
  set temperature(value: unknown);
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the reader/writer accessor pair for this model's generated attributes lives in the interface merged above. */
export class NumericData extends Base {
  declare virtual_decimal_number: BigDecimal | null;
  declare world_population: number | bigint | null;
  declare my_house_population: number | bigint | null;
  declare atoms_in_universe: number | bigint | null;
  declare big_bank_balance: BigDecimal | null;
  declare decimal_number: BigDecimal | null;
  declare decimal_number_big_precision: BigDecimal | null;
  declare decimal_number_with_default: BigDecimal | null;
  declare numeric_number: BigDecimal | null;
  declare temperature_with_limit: BigDecimal | null;
  declare unscaled_bank_balance: BigDecimal | null;

  static _tableName = "numeric_data";

  static {
    this.attribute("world_population", "big_integer");
    this.attribute("my_house_population", "big_integer");
    this.attribute("atoms_in_universe", "big_integer");
    this.aliasAttribute("new_bank_balance", "bank_balance");
  }
}
