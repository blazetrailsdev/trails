import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class Record extends Base {}
constSet(TopLevel, "Record", Record);
DescendantsTracker.registerSubclass(Base, Record);
