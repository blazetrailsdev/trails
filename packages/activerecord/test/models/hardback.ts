import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class Hardback extends Base {}
constSet(TopLevel, "Hardback", Hardback);
DescendantsTracker.registerSubclass(Base, Hardback);

export class BestHardback extends Hardback {}
constSet(TopLevel, "BestHardback", BestHardback);
DescendantsTracker.registerSubclass(Hardback, BestHardback);
