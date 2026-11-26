import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class PkAutopopulatedByATriggerRecord extends Base {
  static {
    this.primaryKey = "id";
  }
}
constSet(TopLevel, "PkAutopopulatedByATriggerRecord", PkAutopopulatedByATriggerRecord);
DescendantsTracker.registerSubclass(Base, PkAutopopulatedByATriggerRecord);
