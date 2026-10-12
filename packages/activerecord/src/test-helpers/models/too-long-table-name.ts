import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class TooLongTableName extends Base {
  static _tableName = "toooooooooooooooooooooooooooooooooo_long_table_names";
}
registerModel(TooLongTableName);
