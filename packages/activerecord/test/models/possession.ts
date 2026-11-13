import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class Possession extends Base {
  static tableName = "having";
}
constSet(TopLevel, "Possession", Possession);
DescendantsTracker.registerSubclass(Base, Possession);
