import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class Book extends Base {
  static {
    this.tableName = "books";
    this.hasMany("reviews");
    constSet(TopLevel, this.name, this);
  }
}
export class Review extends Base {
  static {
    this.tableName = "reviews";
    this.belongsTo("book");
    constSet(TopLevel, this.name, this);
  }
}
