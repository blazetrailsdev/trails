import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Possession extends Base {
  static tableName = "having";
}
constSet(TopLevel, "Possession", Possession);
DescendantsTracker.registerSubclass(Base, Possession);
