import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class TooLongTableName extends Base {
  static _tableName = "toooooooooooooooooooooooooooooooooo_long_table_names";
}
constSet(TopLevel, "TooLongTableName", TooLongTableName);
DescendantsTracker.registerSubclass(Base, TooLongTableName);
