import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Measurement extends Base {}
constSet(TopLevel, "Measurement", Measurement);
DescendantsTracker.registerSubclass(Base, Measurement);
