import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class TooLongTableName extends Base {
  static _tableName = "toooooooooooooooooooooooooooooooooo_long_table_names";
}
registerConstant("TooLongTableName", TooLongTableName);
