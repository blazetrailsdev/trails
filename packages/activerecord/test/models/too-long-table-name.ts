import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class TooLongTableName extends Base {
  static tableName = "toooooooooooooooooooooooooooooooooo_long_table_names";
}
constSet(TopLevel, "TooLongTableName", TooLongTableName);
DescendantsTracker.registerSubclass(Base, TooLongTableName);
