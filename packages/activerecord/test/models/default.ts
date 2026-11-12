import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";
import type { BigDecimal } from "@blazetrails/activesupport";

export class Default extends Base {
  declare text_col: string;
  declare string_col: string;
  declare decimal_col: BigDecimal;
  declare bpchar_col: string;
}
constSet(TopLevel, "Default", Default);
DescendantsTracker.registerSubclass(Base, Default);
