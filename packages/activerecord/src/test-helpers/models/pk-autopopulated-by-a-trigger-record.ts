import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class PkAutopopulatedByATriggerRecord extends Base {
  static {
    this.primaryKey = "id";
  }
}
constSet(TopLevel, "PkAutopopulatedByATriggerRecord", PkAutopopulatedByATriggerRecord);
DescendantsTracker.registerSubclass(Base, PkAutopopulatedByATriggerRecord);
