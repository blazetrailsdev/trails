import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Minimalistic extends Base {
  declare expires_at: bigint;
}
constSet(TopLevel, "Minimalistic", Minimalistic);
DescendantsTracker.registerSubclass(Base, Minimalistic);
