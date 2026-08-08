import { Base, registerModel } from "@blazetrails/activerecord";

export class Customer extends Base {
  static {
    this.tableName = "customers";
    registerModel(this);
  }
}
