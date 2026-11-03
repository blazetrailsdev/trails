import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../../base.js";

export class ExtraFirm extends Base {
  static _tableName = "companies";
}
constSet(TopLevel, "ExtraFirm", ExtraFirm);
DescendantsTracker.registerSubclass(Base, ExtraFirm);
