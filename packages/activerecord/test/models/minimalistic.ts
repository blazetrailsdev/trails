import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Minimalistic extends Base {
  declare expires_at: bigint;
}
constSet(TopLevel, "Minimalistic", Minimalistic);
DescendantsTracker.registerSubclass(Base, Minimalistic);
