import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Hardback extends Base {}
constSet(TopLevel, "Hardback", Hardback);
DescendantsTracker.registerSubclass(Base, Hardback);

export class BestHardback extends Hardback {}
constSet(TopLevel, "BestHardback", BestHardback);
DescendantsTracker.registerSubclass(Hardback, BestHardback);
