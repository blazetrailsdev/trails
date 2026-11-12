import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class Carrier extends Base {}
constSet(TopLevel, "Carrier", Carrier);
DescendantsTracker.registerSubclass(Base, Carrier);
