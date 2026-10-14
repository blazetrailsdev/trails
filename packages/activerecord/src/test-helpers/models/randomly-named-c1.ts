import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class ClassNameThatDoesNotFollowCONVENTIONS extends Base {
  static _tableName = "randomly_named_table1";
}
registerModel(ClassNameThatDoesNotFollowCONVENTIONS);
