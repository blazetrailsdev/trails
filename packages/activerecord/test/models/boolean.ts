import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Boolean extends Base {
  declare has_fun: boolean;
  declare value: boolean;
}
constSet(TopLevel, "Boolean", Boolean);
DescendantsTracker.registerSubclass(Base, Boolean);
