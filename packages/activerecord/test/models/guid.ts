import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class Guid extends Base {
  declare key: string;
}
constSet(TopLevel, "Guid", Guid);
DescendantsTracker.registerSubclass(Base, Guid);
