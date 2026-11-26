import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../../lib/base.js";

export class ExtraFirm extends Base {
  static tableName = "companies";
}
constSet(TopLevel, "ExtraFirm", ExtraFirm);
DescendantsTracker.registerSubclass(Base, ExtraFirm);
