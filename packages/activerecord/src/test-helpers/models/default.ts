import { Base } from "../../base.js";
import type { BigDecimal } from "@blazetrails/activesupport";
import { registerModel } from "../../associations.js";

export class Default extends Base {
  declare text_col: string;
  declare string_col: string;
  declare decimal_col: BigDecimal;
  declare bpchar_col: string;
}
registerModel(Default);
