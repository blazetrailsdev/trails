import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class ColumnName extends Base {
  static _tableName = "colnametests";
}
registerConstant("ColumnName", ColumnName);
