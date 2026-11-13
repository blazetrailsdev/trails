import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class NeedQuoting extends Base {
  static tableName = "1_need_quoting";
}
constSet(TopLevel, "NeedQuoting", NeedQuoting);
DescendantsTracker.registerSubclass(Base, NeedQuoting);
