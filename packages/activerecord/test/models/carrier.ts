import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Carrier extends Base {}
constSet(TopLevel, "Carrier", Carrier);
DescendantsTracker.registerSubclass(Base, Carrier);
