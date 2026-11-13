import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class ColumnName extends Base {
  static tableName = "colnametests";
}
constSet(TopLevel, "ColumnName", ColumnName);
DescendantsTracker.registerSubclass(Base, ColumnName);
