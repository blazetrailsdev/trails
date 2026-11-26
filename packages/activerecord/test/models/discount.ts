import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Discount extends Base {
  declare amount: number;
}
constSet(TopLevel, "Discount", Discount);
DescendantsTracker.registerSubclass(Base, Discount);
