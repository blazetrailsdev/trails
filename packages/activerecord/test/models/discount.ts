import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class Discount extends Base {
  declare amount: number;
}
constSet(TopLevel, "Discount", Discount);
DescendantsTracker.registerSubclass(Base, Discount);
