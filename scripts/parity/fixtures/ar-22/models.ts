import { Base, registerModel } from "@blazetrails/activerecord";

export class User extends Base {
  static {
    this.tableName = "users";
    registerModel(this);
  }
}
