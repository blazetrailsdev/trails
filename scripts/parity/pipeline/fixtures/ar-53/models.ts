import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class Customer extends Base {
  static {
    this.tableName = "customers";
    constSet(TopLevel, this.name, this);
  }
}
