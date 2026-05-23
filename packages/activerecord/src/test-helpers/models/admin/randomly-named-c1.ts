// vendor/rails/activerecord/test/models/admin/randomly_named_c1.rb
import { Base } from "../../../base.js";

export class AdminClassNameThatDoesNotFollowCONVENTIONS1 extends Base {
  static _tableName = "randomly_named_table2";
}

export class AdminClassNameThatDoesNotFollowCONVENTIONS2 extends Base {
  static _tableName = "randomly_named_table3";
}
