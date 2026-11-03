import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class User extends Base {
  static {
    this.tableName = "users";
    constSet(TopLevel, this.name, this);
  }
}
