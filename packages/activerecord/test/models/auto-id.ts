import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class AutoId extends Base {
  static tableName = "auto_id_tests";
  static {
    this.primaryKey = "auto_id";
  }
}
constSet(TopLevel, "AutoId", AutoId);
DescendantsTracker.registerSubclass(Base, AutoId);
