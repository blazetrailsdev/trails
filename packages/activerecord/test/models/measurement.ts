import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class Measurement extends Base {}
constSet(TopLevel, "Measurement", Measurement);
DescendantsTracker.registerSubclass(Base, Measurement);
