import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class AutoId extends Base {
  static _tableName = "auto_id_tests";
  static {
    this.primaryKey = "auto_id";
  }
}
constSet(TopLevel, "AutoId", AutoId);
DescendantsTracker.registerSubclass(Base, AutoId);
