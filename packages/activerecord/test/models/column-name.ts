import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class ColumnName extends Base {
  static tableName = "colnametests";
}
constSet(TopLevel, "ColumnName", ColumnName);
DescendantsTracker.registerSubclass(Base, ColumnName);
