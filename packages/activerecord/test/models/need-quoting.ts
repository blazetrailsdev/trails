import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class NeedQuoting extends Base {
  static tableName = "1_need_quoting";
}
constSet(TopLevel, "NeedQuoting", NeedQuoting);
DescendantsTracker.registerSubclass(Base, NeedQuoting);
