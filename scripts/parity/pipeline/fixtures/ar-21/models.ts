import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class User extends Base {
  static {
    this.tableName = "users";
    this.hasMany("posts");
    constSet(TopLevel, this.name, this);
  }
}
export class Post extends Base {
  static {
    this.tableName = "posts";
    this.belongsTo("user");
    constSet(TopLevel, this.name, this);
  }
}
