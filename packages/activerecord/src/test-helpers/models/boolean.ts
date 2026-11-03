import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Boolean extends Base {
  declare has_fun: boolean;
  declare value: boolean;
}
constSet(TopLevel, "Boolean", Boolean);
DescendantsTracker.registerSubclass(Base, Boolean);
