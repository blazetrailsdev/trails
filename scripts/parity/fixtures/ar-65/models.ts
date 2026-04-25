import { Base, registerModel } from "@blazetrails/activerecord";

export class Order extends Base {
  static {
    this.tableName = "orders";
    registerModel(this);
  }
}
