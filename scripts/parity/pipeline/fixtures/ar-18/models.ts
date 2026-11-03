import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class User extends Base {
  static {
    this.tableName = "users";
    this.hasMany("comments");
    constSet(TopLevel, this.name, this);
  }
}
export class Comment extends Base {
  static {
    this.tableName = "comments";
    this.belongsTo("user");
    constSet(TopLevel, this.name, this);
  }
}
