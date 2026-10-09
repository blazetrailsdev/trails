import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class AutoId extends Base {
  static _tableName = "auto_id_tests";
  static {
    this.primaryKey = "auto_id";
  }
}
registerConstant("AutoId", AutoId);
