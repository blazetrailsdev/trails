import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Guid extends Base {
  declare key: string;
}
constSet(TopLevel, "Guid", Guid);
DescendantsTracker.registerSubclass(Base, Guid);
