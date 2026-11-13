import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../../lib/base.js";

export class ExtraFirm extends Base {
  static tableName = "companies";
}
constSet(TopLevel, "ExtraFirm", ExtraFirm);
DescendantsTracker.registerSubclass(Base, ExtraFirm);
