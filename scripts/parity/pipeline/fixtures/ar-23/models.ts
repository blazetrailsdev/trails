import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class Developer extends Base {
  static {
    this.tableName = "developers";
    constSet(TopLevel, this.name, this);
  }
}
