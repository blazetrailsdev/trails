import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class Order extends Base {
  static {
    this.tableName = "orders";
    constSet(TopLevel, this.name, this);
  }
}
