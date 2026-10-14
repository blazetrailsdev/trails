import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class ColumnName extends Base {
  static _tableName = "colnametests";
}
registerModel(ColumnName);
