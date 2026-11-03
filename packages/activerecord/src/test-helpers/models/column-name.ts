import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class ColumnName extends Base {
  static _tableName = "colnametests";
}
constSet(TopLevel, "ColumnName", ColumnName);
DescendantsTracker.registerSubclass(Base, ColumnName);
