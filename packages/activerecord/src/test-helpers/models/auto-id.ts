import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class AutoId extends Base {
  static _tableName = "auto_id_tests";
  static {
    this.primaryKey = "auto_id";
  }
}
registerModel(AutoId);
