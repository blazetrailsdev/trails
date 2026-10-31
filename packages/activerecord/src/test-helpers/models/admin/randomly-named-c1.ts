import { Admin } from "../admin.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../base.js";
import { registerModel } from "../../../associations.js";

export class AdminClassNameThatDoesNotFollowCONVENTIONS1 extends Base {
  static _tableName = "randomly_named_table2";
  static {
    registerModel(constSet(Admin, "ClassNameThatDoesNotFollowCONVENTIONS1", this));
  }
}

export class AdminClassNameThatDoesNotFollowCONVENTIONS2 extends Base {
  static _tableName = "randomly_named_table3";
  static {
    registerModel(constSet(Admin, "ClassNameThatDoesNotFollowCONVENTIONS2", this));
  }
}
