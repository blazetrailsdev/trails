import { Base, registerModel } from "@blazetrails/activerecord";

export class User extends Base {
  static {
    this.tableName = "users";
    this.hasMany("posts");
    registerModel(this);
  }
}
export class Post extends Base {
  static {
    this.tableName = "posts";
    this.belongsTo("user");
    registerModel(this);
  }
}
