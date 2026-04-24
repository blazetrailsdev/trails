import { Base, registerModel } from "@blazetrails/activerecord";

export class User extends Base {
  static {
    this.tableName = "users";
    this.hasMany("comments");
    registerModel(this);
  }
}
export class Comment extends Base {
  static {
    this.tableName = "comments";
    this.belongsTo("user");
    registerModel(this);
  }
}
