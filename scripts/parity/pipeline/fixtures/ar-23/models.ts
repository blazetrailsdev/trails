import { Base, registerModel } from "@blazetrails/activerecord";

export class Developer extends Base {
  static {
    this.tableName = "developers";
    registerModel(this);
  }
}
