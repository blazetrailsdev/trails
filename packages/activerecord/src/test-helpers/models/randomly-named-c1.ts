import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class ClassNameThatDoesNotFollowCONVENTIONS extends Base {
  static _tableName = "randomly_named_table1";
}
registerConstant("ClassNameThatDoesNotFollowCONVENTIONS", ClassNameThatDoesNotFollowCONVENTIONS);
